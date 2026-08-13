// Idempotent seed script: populates application_types, form_versions,
// sections, questions, validation_rules, document_requirements, pricing,
// and government_fees from supabase/seed/data. Safe to re-run — every
// upsert keys off a natural unique constraint already defined in
// 0001_core_schema.sql, and the few tables without one (government_fees,
// translation_pricing) are cleared and reinserted per application type.
//
// Usage:
//   cp .env.example .env.local && fill in Supabase values
//   npm run seed

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { applicationTypeSeeds } from './data'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — cannot seed.'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

async function main() {
  for (const app of applicationTypeSeeds) {
    console.log(`Seeding ${app.form_code} — ${app.name}`)

    const { data: appType, error: appTypeErr } = await supabase
      .from('application_types')
      .upsert(
        {
          slug: app.slug,
          form_code: app.form_code,
          name: app.name,
          short_name: app.short_name,
          goal_categories: app.goal_categories,
          summary: app.summary,
          who_its_for: app.who_its_for,
          eligibility_overview: app.eligibility_overview,
          workflow_overview: app.workflow_overview,
          sort_order: app.sort_order,
          is_active: true,
        },
        { onConflict: 'slug' }
      )
      .select()
      .single()

    if (appTypeErr || !appType) throw appTypeErr

    // Build the pdf field_map from any question that declared one.
    const fieldMap: Record<string, string> = {}
    for (const section of app.sections) {
      for (const q of section.questions) {
        if (q.pdf_field) fieldMap[q.key] = q.pdf_field
      }
    }

    const { data: existingVersion } = await supabase
      .from('form_versions')
      .select('id')
      .eq('application_type_id', appType.id)
      .eq('is_current', true)
      .maybeSingle()

    if (existingVersion) {
      const { error } = await supabase
        .from('form_versions')
        .update({ edition_date: app.edition_date, field_map: fieldMap })
        .eq('id', existingVersion.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('form_versions').insert({
        application_type_id: appType.id,
        edition_date: app.edition_date,
        is_current: true,
        field_map: fieldMap,
      })
      if (error) throw error
    }

    for (const [sortIndex, section] of app.sections.entries()) {
      const { data: sectionRow, error: sectionErr } = await supabase
        .from('sections')
        .upsert(
          {
            application_type_id: appType.id,
            key: section.key,
            title: section.title,
            description: section.description ?? null,
            icon: section.icon ?? null,
            sort_order: sortIndex,
          },
          { onConflict: 'application_type_id,key' }
        )
        .select()
        .single()

      if (sectionErr || !sectionRow) throw sectionErr

      for (const [qIndex, q] of section.questions.entries()) {
        const { error: qErr } = await supabase.from('questions').upsert(
          {
            section_id: sectionRow.id,
            key: q.key,
            prompt: q.prompt,
            help_text: q.help_text ?? null,
            type: q.type,
            options: q.options ?? null,
            required: q.required ?? false,
            sort_order: qIndex,
            placeholder: q.placeholder ?? null,
            repeat_group: q.repeat_group ?? null,
            repeat_item_label: q.repeat_item_label ?? null,
            validation: q.validation ?? null,
            show_if: q.show_if ?? null,
            is_eligibility_question: q.is_eligibility_question ?? false,
          },
          { onConflict: 'section_id,key' }
        )
        if (qErr) throw qErr
      }
    }

    if (app.validationRules) {
      for (const rule of app.validationRules) {
        const { error } = await supabase.from('validation_rules').upsert(
          {
            application_type_id: appType.id,
            key: rule.key,
            section_key: rule.section_key,
            description: rule.description,
            rule_type: rule.rule_type,
            config: rule.config ?? {},
            severity_on_fail: rule.severity_on_fail ?? 'needs_attention',
          },
          { onConflict: 'application_type_id,key' }
        )
        if (error) throw error
      }
    }

    for (const [dIndex, doc] of app.documentRequirements.entries()) {
      const { error } = await supabase.from('document_requirements').upsert(
        {
          application_type_id: appType.id,
          key: doc.key,
          label: doc.label,
          category: doc.category,
          description: doc.description ?? null,
          required: doc.required ?? true,
          show_if: doc.show_if ?? null,
          sort_order: dIndex,
        },
        { onConflict: 'application_type_id,key' }
      )
      if (error) throw error
    }

    const { error: pricingErr } = await supabase.from('pricing').upsert(
      {
        application_type_id: appType.id,
        service_fee_cents: app.pricing.service_fee_cents,
        promo_fee_cents: app.pricing.promo_fee_cents ?? null,
        promo_active: app.pricing.promo_active ?? false,
        print_mail_fee_cents: app.pricing.print_mail_fee_cents ?? 1995,
      },
      { onConflict: 'application_type_id' }
    )
    if (pricingErr) throw pricingErr

    await supabase.from('government_fees').delete().eq('application_type_id', appType.id)
    const { error: feeErr } = await supabase.from('government_fees').insert({
      application_type_id: appType.id,
      label: app.governmentFee.label,
      amount_cents: app.governmentFee.amount_cents,
      fee_waiver_available: app.governmentFee.fee_waiver_available ?? false,
      source_note: app.governmentFee.source_note ?? null,
    })
    if (feeErr) throw feeErr
  }

  const { data: existingTranslationPricing } = await supabase
    .from('translation_pricing')
    .select('id')
    .limit(1)
  if (!existingTranslationPricing || existingTranslationPricing.length === 0) {
    await supabase.from('translation_pricing').insert({})
  }

  console.log(`\nSeeded ${applicationTypeSeeds.length} application types.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

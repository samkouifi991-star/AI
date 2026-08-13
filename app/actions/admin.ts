'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireStaff } from '@/lib/admin'
import { logAudit } from '@/lib/audit'

function parseJsonField<T>(raw: string, fallback: T): T {
  if (!raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('Invalid JSON — check the syntax and try again.')
  }
}

export async function updateApplicationType(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = String(formData.get('id'))
  const goalCategories = String(formData.get('goal_categories') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const updates = {
    name: String(formData.get('name') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    who_its_for: String(formData.get('who_its_for') ?? ''),
    eligibility_overview: String(formData.get('eligibility_overview') ?? ''),
    workflow_overview: String(formData.get('workflow_overview') ?? ''),
    is_active: formData.get('is_active') === 'on',
    sort_order: Number(formData.get('sort_order') ?? 0),
    goal_categories: goalCategories,
    cta_text: String(formData.get('cta_text') ?? '').trim() || null,
    estimated_minutes: formData.get('estimated_minutes') ? Number(formData.get('estimated_minutes')) : null,
    faqs: parseJsonField(String(formData.get('faqs') ?? ''), []),
    associated_forms: parseJsonField(String(formData.get('associated_forms') ?? ''), []),
  }
  const { error } = await supabase.from('application_types').update(updates).eq('id', id)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.application_type.updated', entityType: 'application_type', entityId: id })
  revalidatePath('/admin/templates')
}

export async function updateQuestion(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = String(formData.get('id'))
  const slug = String(formData.get('slug'))
  const updates = {
    prompt: String(formData.get('prompt') ?? ''),
    help_text: String(formData.get('help_text') ?? '') || null,
    required: formData.get('required') === 'on',
    sort_order: Number(formData.get('sort_order') ?? 0),
  }
  const { error } = await supabase.from('questions').update(updates).eq('id', id)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.question.updated', entityType: 'question', entityId: id })
  revalidatePath(`/admin/templates/${slug}`)
}

export async function createQuestion(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const sectionId = String(formData.get('section_id'))
  const slug = String(formData.get('slug'))
  const key = String(formData.get('key') ?? '').trim()
  if (!key) throw new Error('Question key is required')

  const { data, error } = await supabase
    .from('questions')
    .insert({
      section_id: sectionId,
      key,
      prompt: String(formData.get('prompt') ?? ''),
      type: String(formData.get('type') ?? 'text'),
      required: formData.get('required') === 'on',
      sort_order: Number(formData.get('sort_order') ?? 100),
    })
    .select()
    .single()
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.question.created', entityType: 'question', entityId: data.id })
  revalidatePath(`/admin/templates/${slug}`)
}

export async function updatePricing(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const applicationTypeId = String(formData.get('application_type_id'))
  const updates = {
    service_fee_cents: Math.round(Number(formData.get('service_fee') ?? 0) * 100),
    promo_fee_cents: formData.get('promo_fee') ? Math.round(Number(formData.get('promo_fee')) * 100) : null,
    promo_active: formData.get('promo_active') === 'on',
    print_mail_fee_cents: Math.round(Number(formData.get('print_mail_fee') ?? 0) * 100),
  }
  const { error } = await supabase.from('pricing').update(updates).eq('application_type_id', applicationTypeId)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.pricing.updated', entityType: 'pricing', entityId: applicationTypeId })
  revalidatePath('/admin/pricing')
  revalidatePath('/pricing')
}

export async function updateGovernmentFee(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = String(formData.get('id'))
  const updates = {
    label: String(formData.get('label') ?? ''),
    amount_cents: Math.round(Number(formData.get('amount') ?? 0) * 100),
    fee_waiver_available: formData.get('fee_waiver_available') === 'on',
    source_note: String(formData.get('source_note') ?? '') || null,
    effective_date: String(formData.get('effective_date') ?? new Date().toISOString().slice(0, 10)),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('government_fees').update(updates).eq('id', id)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.government_fee.updated', entityType: 'government_fee', entityId: id })
  revalidatePath('/admin/government-fees')
  revalidatePath('/pricing')
}

export async function updateSupportRequestStatus(formData: FormData) {
  const { supabase, user } = await requireStaff()
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  const { error } = await supabase.from('support_requests').update({ status }).eq('id', id)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.support_request.updated', entityType: 'support_request', entityId: id, metadata: { status } })
  revalidatePath('/admin/support')
}

export async function updateTranslationStatus(formData: FormData) {
  const { supabase, user } = await requireStaff()
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  const { error } = await supabase.from('translations').update({ status }).eq('id', id)
  if (error) throw error
  await logAudit({ actorId: user.id, action: 'admin.translation.status_updated', entityType: 'translation', entityId: id, metadata: { status } })
  revalidatePath('/admin/translations')
}

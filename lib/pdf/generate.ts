import { createAdminClient } from '@/lib/supabase/admin'
import { PdfWriter, mergePdfs } from './textLayout'
import { getFullSchema, getAnswersBundle, getApplicationTypeById, type SectionWithQuestions } from '@/lib/engine/schema'
import { syncDocumentChecklist } from '@/lib/engine/documents'
import { packageStoragePath, uploadToBucket, PACKAGES_BUCKET } from '@/lib/storage'
import type { Question } from '@/lib/supabase/types'

function formatValue(question: Question, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  if (question.type === 'name' && typeof raw === 'object') {
    const v = raw as { first?: string; middle?: string; last?: string }
    return [v.first, v.middle, v.last].filter(Boolean).join(' ') || '—'
  }
  if (question.type === 'address' && typeof raw === 'object') {
    const v = raw as { street?: string; unit?: string; city?: string; state?: string; zip?: string; country?: string }
    return [v.street && v.unit ? `${v.street}, ${v.unit}` : v.street, v.city, v.state, v.zip, v.country].filter(Boolean).join(', ') || '—'
  }
  if (question.type === 'yes_no') return raw === 'yes' ? 'Yes' : raw === 'no' ? 'No' : '—'
  if (question.type === 'select' || question.type === 'radio_cards') {
    const opt = question.options?.find((o) => o.value === raw)
    return opt?.label ?? String(raw)
  }
  return String(raw)
}

async function buildFormDataSheet(
  formCode: string,
  formName: string,
  schema: SectionWithQuestions[],
  answers: Awaited<ReturnType<typeof getAnswersBundle>>,
  fieldMap: Record<string, string>
) {
  const writer = await PdfWriter.create(`${formCode} — Form Data Sheet`)
  writer.heading(`Form ${formCode} — Data Sheet`)
  writer.paragraph(
    `This sheet organizes your answers by the official ${formCode} (${formName}) structure so you or your preparer can transfer them onto the current USCIS form, or so this data can be merged directly into a fillable PDF using the field map on file for this form edition. This is not itself an official government document.`,
    { size: 9.5 }
  )
  writer.spacer(6)

  for (const section of schema) {
    const seenGroups = new Set<string>()
    const visibleQuestions = section.questions.filter((q) => answers.flat[q.key] !== undefined || q.repeat_group)
    if (visibleQuestions.length === 0) continue

    writer.subheading(section.title)
    for (const q of section.questions) {
      if (q.repeat_group) {
        if (seenGroups.has(q.repeat_group)) continue
        seenGroups.add(q.repeat_group)
        const instances = answers.byRepeatGroup(q.repeat_group)
        if (instances.length === 0) continue
        const groupQuestions = section.questions.filter((qq) => qq.repeat_group === q.repeat_group)
        instances.forEach((inst, idx) => {
          writer.paragraph(`${q.repeat_item_label ?? 'Entry'} ${idx + 1}`, { size: 9.5 })
          for (const gq of groupQuestions) {
            const label = fieldMap[gq.key] ? `${gq.prompt} (${fieldMap[gq.key]})` : gq.prompt
            writer.keyValue(label, formatValue(gq, inst.values[gq.key]))
          }
        })
        continue
      }
      const value = answers.flat[q.key]
      if (value === undefined) continue
      const label = fieldMap[q.key] ? `${q.prompt} (${fieldMap[q.key]})` : q.prompt
      writer.keyValue(label, formatValue(q, value))
    }
    writer.spacer(8)
  }

  return writer.bytes()
}

async function buildFilingInstructions(formCode: string, formName: string, checklistLabels: string[]) {
  const writer = await PdfWriter.create(`${formCode} — Filing Instructions`)
  writer.heading('Personalized Filing Instructions')
  writer.paragraph(`Prepared for your ${formCode} — ${formName} application.`)

  writer.subheading('What is included in this package')
  writer.bullet(`Your completed ${formCode} data sheet, reflecting every answer you provided.`)
  writer.bullet('A personalized supporting-document checklist.')
  writer.bullet('Any certified translations you ordered and completed.')
  writer.bullet('This filing instructions sheet and a cover organizer.')

  writer.subheading('Assembly order')
  writer.bullet('Cover sheet / organizer (on top, for your own reference — do not mail this page unless the form instructions say to).')
  writer.bullet(`Signed, completed ${formCode}.`)
  writer.bullet('Supporting documents, in the order listed on your checklist.')
  writer.bullet('Certified translations, each stapled directly behind the foreign-language original it translates.')

  writer.subheading('Signature locations')
  writer.paragraph(
    `Sign and date every page of ${formCode} that requires a signature in black ink — do not type your signature. If you used a preparer, they must also sign where the form requires it. Unsigned forms are one of the most common reasons USCIS rejects a filing.`
  )

  writer.subheading('Before you file')
  writer.bullet('Confirm you are using the current edition of the form — USCIS periodically replaces older editions.')
  writer.bullet('Confirm the current filing fee and accepted payment methods on the USCIS fee page for this form.')
  writer.bullet('Confirm the correct filing address or e-filing option for your form and location on uscis.gov, since these change by service center and case type.')
  writer.bullet('Make a complete copy of everything you file, for your own records, before mailing or submitting it.')

  writer.subheading('Your document checklist for this filing')
  if (checklistLabels.length === 0) {
    writer.paragraph('No additional supporting documents were required for this application.')
  } else {
    checklistLabels.forEach((label) => writer.bullet(label))
  }

  writer.subheading('A reminder about this package')
  writer.paragraph(
    'Smart USA Visa is a private document preparation company, not a law firm and not affiliated with USCIS or any government agency. These instructions are general guidance to help you organize and file your own paperwork, not legal advice. If your situation is complex, consider consulting a licensed immigration attorney before filing.',
    { size: 9 }
  )

  return writer.bytes()
}

async function buildChecklist(items: { label: string; category: string; status: string }[]) {
  const writer = await PdfWriter.create('Document Checklist')
  writer.heading('Your Document Checklist')
  writer.paragraph('Generated from your answers. Check off each item as you gather it.')

  const categories = Array.from(new Set(items.map((i) => i.category)))
  for (const category of categories) {
    writer.subheading(category[0].toUpperCase() + category.slice(1))
    for (const item of items.filter((i) => i.category === category)) {
      writer.bullet(`${item.label} — ${item.status}`, item.status === 'accepted' || item.status === 'uploaded')
    }
    writer.spacer(6)
  }
  return writer.bytes()
}

async function buildCoverSheet(applicantName: string, formCode: string, formName: string) {
  const writer = await PdfWriter.create('Filing Cover Sheet')
  writer.heading('Filing Package Organizer')
  writer.spacer(10)
  writer.keyValue('Applicant', applicantName || '—')
  writer.keyValue('Application', `${formCode} — ${formName}`)
  writer.keyValue('Package prepared', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
  writer.keyValue('Prepared by', 'Smart USA Visa (self-service document preparation)')
  writer.spacer(16)
  writer.paragraph(
    'This organizer is for your own reference. It summarizes what is in this package and is not part of the official form filing unless your form-specific instructions say otherwise.'
  )
  return writer.bytes()
}

export async function generatePackage(applicationId: string) {
  const admin = createAdminClient()

  const { data: application, error: appErr } = await admin.from('applications').select('*').eq('id', applicationId).single()
  if (appErr || !application) throw appErr ?? new Error('Application not found')

  const applicationType = await getApplicationTypeById(admin, application.application_type_id)
  const schema = await getFullSchema(admin, application.application_type_id)
  const answers = await getAnswersBundle(admin, applicationId, schema)

  const { data: formVersion } = await admin
    .from('form_versions')
    .select('*')
    .eq('application_type_id', application.application_type_id)
    .eq('is_current', true)
    .maybeSingle()

  const checklist = await syncDocumentChecklist(admin, applicationId, application.application_type_id, answers.flat)
  const checklistItems = checklist.map((c) => ({
    label: c.requirement.label,
    category: c.requirement.category,
    status: c.applicationDocument?.status ?? 'missing',
  }))

  const applicantNameKey = schema.flatMap((s) => s.questions).find((q) => q.key.endsWith('_name') && q.type === 'name')?.key
  const nameValue = applicantNameKey ? (answers.flat[applicantNameKey] as { first?: string; last?: string } | undefined) : undefined
  const applicantName = nameValue ? [nameValue.first, nameValue.last].filter(Boolean).join(' ') : ''

  const [formsBytes, instructionsBytes, checklistBytes, coverBytes] = await Promise.all([
    buildFormDataSheet(applicationType.form_code, applicationType.name, schema, answers, formVersion?.field_map ?? {}),
    buildFilingInstructions(applicationType.form_code, applicationType.name, checklistItems.map((c) => c.label)),
    buildChecklist(checklistItems),
    buildCoverSheet(applicantName, applicationType.form_code, applicationType.name),
  ])

  const bundleBytes = await mergePdfs([coverBytes, formsBytes, checklistBytes, instructionsBytes])

  const [formsPath, instructionsPath, checklistPath, coverPath, bundlePath] = await Promise.all([
    uploadToBucket(PACKAGES_BUCKET, packageStoragePath(applicationId, 'form-data-sheet.pdf'), formsBytes, 'application/pdf'),
    uploadToBucket(PACKAGES_BUCKET, packageStoragePath(applicationId, 'filing-instructions.pdf'), instructionsBytes, 'application/pdf'),
    uploadToBucket(PACKAGES_BUCKET, packageStoragePath(applicationId, 'document-checklist.pdf'), checklistBytes, 'application/pdf'),
    uploadToBucket(PACKAGES_BUCKET, packageStoragePath(applicationId, 'cover-sheet.pdf'), coverBytes, 'application/pdf'),
    uploadToBucket(PACKAGES_BUCKET, packageStoragePath(applicationId, 'complete-package.pdf'), bundleBytes, 'application/pdf'),
  ])

  await admin.from('generated_packages').upsert(
    {
      application_id: applicationId,
      forms_storage_path: formsPath,
      instructions_storage_path: instructionsPath,
      checklist_storage_path: checklistPath,
      cover_sheet_storage_path: coverPath,
      bundle_storage_path: bundlePath,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'application_id' }
  )

  await admin.from('applications').update({ status: 'package_ready' }).eq('id', applicationId)
}

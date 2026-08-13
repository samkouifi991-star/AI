import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentRequirement, ApplicationDocument } from '@/lib/supabase/types'
import type { AnswerMap } from './conditions'
import { isVisible } from './conditions'

export type ChecklistItem = {
  requirement: DocumentRequirement
  applicationDocument: ApplicationDocument | null
}

// Ensures every currently-visible, required document_requirement has a
// corresponding application_documents row (status='missing') so the
// checklist is always backed by real rows the customer can act on — no
// checklist item is ever computed purely client-side.
export async function syncDocumentChecklist(
  supabase: SupabaseClient,
  applicationId: string,
  applicationTypeId: string,
  answers: AnswerMap
): Promise<ChecklistItem[]> {
  const { data: requirements, error: reqErr } = await supabase
    .from('document_requirements')
    .select('*')
    .eq('application_type_id', applicationTypeId)
    .order('sort_order')
  if (reqErr) throw reqErr

  const { data: existingDocs, error: docsErr } = await supabase
    .from('application_documents')
    .select('*')
    .eq('application_id', applicationId)
  if (docsErr) throw docsErr

  const visibleRequirements = (requirements ?? []).filter((r) => isVisible(r.show_if, answers))
  const existingByRequirement = new Map((existingDocs ?? []).map((d) => [d.document_requirement_id, d]))

  const toCreate = visibleRequirements.filter((r) => !existingByRequirement.has(r.id))
  if (toCreate.length > 0) {
    const { error: insertErr } = await supabase.from('application_documents').insert(
      toCreate.map((r) => ({
        application_id: applicationId,
        document_requirement_id: r.id,
        status: 'missing' as const,
      }))
    )
    if (insertErr) throw insertErr
  }

  const { data: freshDocs, error: freshErr } = await supabase
    .from('application_documents')
    .select('*')
    .eq('application_id', applicationId)
  if (freshErr) throw freshErr

  return visibleRequirements.map((requirement) => ({
    requirement,
    applicationDocument: (freshDocs ?? []).find((d) => d.document_requirement_id === requirement.id) ?? null,
  }))
}

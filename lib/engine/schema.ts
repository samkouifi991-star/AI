import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApplicationType, Section, Question, Answer } from '@/lib/supabase/types'
import type { AnswerMap } from './conditions'

export type SectionWithQuestions = Section & { questions: Question[] }

export async function getApplicationTypeBySlug(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from('application_types')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  if (error) throw error
  return data as ApplicationType
}

export async function getApplicationTypeById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from('application_types').select('*').eq('id', id).single()
  if (error) throw error
  return data as ApplicationType
}

export async function getFullSchema(
  supabase: SupabaseClient,
  applicationTypeId: string
): Promise<SectionWithQuestions[]> {
  const { data: sections, error: sectionsErr } = await supabase
    .from('sections')
    .select('*')
    .eq('application_type_id', applicationTypeId)
    .order('sort_order')
  if (sectionsErr) throw sectionsErr

  const { data: questions, error: questionsErr } = await supabase
    .from('questions')
    .select('*')
    .in('section_id', (sections ?? []).map((s) => s.id))
    .order('sort_order')
  if (questionsErr) throw questionsErr

  return (sections ?? []).map((section) => ({
    ...section,
    questions: (questions ?? []).filter((q) => q.section_id === section.id),
  }))
}

export type AnswerInstance = { repeaterIndex: number; values: Record<string, unknown> }

export interface AnswersBundle {
  // primary-instance (repeater_index = 0) value per question_key — used to
  // evaluate show_if conditions, since trigger questions are non-repeating.
  flat: AnswerMap
  // every raw answer row, for rendering repeated instances and for save/diff.
  rows: Answer[]
  // repeat_group -> ordered list of instances, each a map of question_key -> value
  byRepeatGroup: (repeatGroup: string) => AnswerInstance[]
}

export async function getAnswersBundle(
  supabase: SupabaseClient,
  applicationId: string,
  schema: SectionWithQuestions[]
): Promise<AnswersBundle> {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('application_id', applicationId)
  if (error) throw error
  const rows = (data ?? []) as Answer[]

  const flat: AnswerMap = {}
  for (const row of rows) {
    if (row.repeater_index === 0) flat[row.question_key] = row.value
  }

  const questionToRepeatGroup = new Map<string, string>()
  for (const section of schema) {
    for (const q of section.questions) {
      if (q.repeat_group) questionToRepeatGroup.set(q.key, q.repeat_group)
    }
  }

  const byRepeatGroup = (repeatGroup: string): AnswerInstance[] => {
    const keysInGroup = new Set(
      schema.flatMap((s) => s.questions).filter((q) => q.repeat_group === repeatGroup).map((q) => q.key)
    )
    const indices = new Set<number>()
    for (const row of rows) {
      if (keysInGroup.has(row.question_key)) indices.add(row.repeater_index)
    }
    return Array.from(indices)
      .sort((a, b) => a - b)
      .map((repeaterIndex) => ({
        repeaterIndex,
        values: Object.fromEntries(
          rows
            .filter((r) => keysInGroup.has(r.question_key) && r.repeater_index === repeaterIndex)
            .map((r) => [r.question_key, r.value])
        ),
      }))
  }

  return { flat, rows, byRepeatGroup }
}

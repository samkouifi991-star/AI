import type { ConditionalRule } from '@/lib/supabase/types'

// A flat lookup of the latest answer value per question_key, used for
// show_if evaluation. Repeater answers are collapsed to their first
// instance's value for the purpose of conditional visibility — a repeated
// question group's own visibility is controlled by the non-repeating
// "trigger" question (e.g. `trips_outside_us`), not by another repeated key.
export type AnswerMap = Record<string, unknown>

function truthy(value: unknown): boolean {
  return value === true || value === 'yes' || value === 'true'
}

export function evaluateRule(rule: ConditionalRule, answers: AnswerMap): boolean {
  const actual = answers[rule.question_key]

  switch (rule.operator) {
    case 'equals':
      return String(actual ?? '') === String(rule.value ?? '')
    case 'not_equals':
      return String(actual ?? '') !== String(rule.value ?? '')
    case 'in':
      return Array.isArray(rule.value) && rule.value.map(String).includes(String(actual ?? ''))
    case 'not_in':
      return Array.isArray(rule.value) && !rule.value.map(String).includes(String(actual ?? ''))
    case 'is_true':
      return truthy(actual)
    case 'is_false':
      return !truthy(actual)
    default:
      return true
  }
}

// All rules must pass (AND) for the question/document to be shown.
export function isVisible(rules: ConditionalRule[] | null | undefined, answers: AnswerMap): boolean {
  if (!rules || rules.length === 0) return true
  return rules.every((rule) => evaluateRule(rule, answers))
}

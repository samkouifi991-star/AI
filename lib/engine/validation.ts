import type { ValidationResult, ValidationSeverity } from '@/lib/supabase/types'
import type { SectionWithQuestions, AnswersBundle } from './schema'
import { isVisible } from './conditions'

type ValidationRuleRow = {
  key: string
  section_key: string
  description: string
  rule_type: 'date_sequence' | 'coverage_gap' | 'conflicting_answers' | 'required_group'
  config: Record<string, any>
  severity_on_fail: 'needs_attention' | 'potential_issue'
}

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function runRule(rule: ValidationRuleRow, answers: AnswersBundle): string | null {
  switch (rule.rule_type) {
    case 'date_sequence': {
      const { date_question, basis_question, min_years } = rule.config
      const dateVal = answers.flat[date_question] as string | undefined
      const basisVal = answers.flat[basis_question] as string | undefined
      if (!dateVal || !basisVal) return null
      const requiredYears = min_years?.[basisVal]
      if (!requiredYears) return null
      const years = (Date.now() - new Date(dateVal).getTime()) / (365.25 * 86400000)
      if (years < requiredYears) {
        return `Based on the date provided, this may not yet meet the ${requiredYears}-year requirement — double-check before filing.`
      }
      return null
    }
    case 'coverage_gap': {
      const { from_question, to_question, repeat_group, years } = rule.config
      const instances = answers.byRepeatGroup(repeat_group)
      if (instances.length === 0) return `Add at least one entry to cover the last ${years} years.`
      const intervals = instances
        .map((inst) => ({
          from: inst.values[from_question] as string | undefined,
          to: (inst.values[to_question] as string | undefined) || new Date().toISOString().slice(0, 10),
        }))
        .filter((iv) => iv.from)
        .sort((a, b) => new Date(a.from!).getTime() - new Date(b.from!).getTime())
      if (intervals.length === 0) return `Add at least one entry to cover the last ${years} years.`
      const earliest = intervals[0].from!
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - years)
      if (new Date(earliest) > cutoff) {
        return `Your entries don't go back the full ${years} years — add earlier history if applicable.`
      }
      for (let i = 1; i < intervals.length; i++) {
        if (daysBetween(intervals[i - 1].to, intervals[i].from!) > 31) {
          return `There's a gap between entries — add anything missing in between.`
        }
      }
      return null
    }
    case 'conflicting_answers': {
      const { if: cond } = rule.config
      if (!cond) return null
      const actual = answers.flat[cond.question_key]
      if (String(actual ?? '') === String(cond.value ?? '')) {
        return rule.description
      }
      return null
    }
    case 'required_group': {
      const keys: string[] = rule.config.keys ?? []
      const missing = keys.filter((k) => !isAnswered(answers.flat[k]))
      if (missing.length > 0) return `Some related answers are still missing.`
      return null
    }
    default:
      return null
  }
}

export function runValidationEngine(
  schema: SectionWithQuestions[],
  answers: AnswersBundle,
  rules: ValidationRuleRow[]
): ValidationResult[] {
  return schema.map((section) => {
    const visibleQuestions = section.questions.filter((q) => isVisible(q.show_if, answers.flat))
    const requiredQuestions = visibleQuestions.filter((q) => q.required)

    const messages: ValidationResult['messages'] = []
    let severity: ValidationSeverity = 'complete'

    for (const q of requiredQuestions) {
      const answered = q.repeat_group
        ? answers.byRepeatGroup(q.repeat_group).some((inst) => Object.values(inst.values).some(isAnswered))
        : isAnswered(answers.flat[q.key])
      if (!answered) {
        messages.push({ question_key: q.key, message: `"${q.prompt}" still needs an answer.` })
        severity = 'needs_attention'
      }
    }

    const sectionRules = rules.filter((r) => r.section_key === section.key)
    for (const rule of sectionRules) {
      const message = runRule(rule, answers)
      if (message) {
        messages.push({ message })
        // potential_issue outranks needs_attention, which outranks complete
        if (rule.severity_on_fail === 'potential_issue' || severity !== 'needs_attention') {
          severity = rule.severity_on_fail
        } else {
          severity = 'needs_attention'
        }
      }
    }

    return { section_key: section.key, section_title: section.title, severity, messages }
  })
}

export function overallReadiness(results: ValidationResult[]): number {
  if (results.length === 0) return 0
  const weight = { complete: 1, needs_attention: 0.4, potential_issue: 0.6 }
  const sum = results.reduce((acc, r) => acc + weight[r.severity], 0)
  return Math.round((sum / results.length) * 100)
}

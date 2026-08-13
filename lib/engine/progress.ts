import { isVisible } from './conditions'
import type { SectionWithQuestions, AnswersBundle } from './schema'

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'object') return Object.values(value as object).some((v) => isAnswered(v))
  return true
}

// Percent complete = required, currently-visible questions that have an
// answer, across every non-repeating question plus at least one instance
// of every visible repeat group. Recalculated fresh on every save — never
// stored as a hand-edited number.
export function calculateProgress(schema: SectionWithQuestions[], answers: AnswersBundle): number {
  let required = 0
  let completed = 0
  const countedRepeatGroups = new Set<string>()

  for (const section of schema) {
    for (const q of section.questions) {
      if (!q.required) continue
      if (!isVisible(q.show_if, answers.flat)) continue

      if (q.repeat_group) {
        if (countedRepeatGroups.has(q.repeat_group)) continue
        countedRepeatGroups.add(q.repeat_group)
        const instances = answers.byRepeatGroup(q.repeat_group)
        required += 1
        if (instances.length > 0 && instances.every((inst) => isAnswered(inst.values[q.key] ?? Object.values(inst.values)[0]))) {
          completed += 1
        } else if (instances.some((inst) => Object.values(inst.values).some(isAnswered))) {
          completed += 1
        }
        continue
      }

      required += 1
      if (isAnswered(answers.flat[q.key])) completed += 1
    }
  }

  if (required === 0) return 0
  return Math.round((completed / required) * 100)
}

export function sectionProgress(section: SectionWithQuestions, answers: AnswersBundle) {
  const visibleQuestions = section.questions.filter((q) => isVisible(q.show_if, answers.flat))
  const requiredQuestions = visibleQuestions.filter((q) => q.required)
  const answeredCount = requiredQuestions.filter((q) =>
    q.repeat_group
      ? answers.byRepeatGroup(q.repeat_group).some((inst) => Object.values(inst.values).some((v) => v !== null && v !== undefined && v !== ''))
      : isAnswered(answers.flat[q.key])
  ).length

  return {
    total: requiredQuestions.length,
    answered: answeredCount,
    isComplete: requiredQuestions.length > 0 && answeredCount === requiredQuestions.length,
  }
}

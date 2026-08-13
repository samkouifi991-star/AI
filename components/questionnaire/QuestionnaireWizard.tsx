'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Question } from '@/lib/supabase/types'
import type { SectionWithQuestions } from '@/lib/engine/schema'
import { isVisible, type AnswerMap } from '@/lib/engine/conditions'
import { QuestionField, emptyValueForType } from './QuestionField'

type ValuesState = Record<string, Record<number, unknown>>
type InstancesState = Record<string, number[]>

type Screen =
  | { kind: 'question'; sectionKey: string; sectionTitle: string; question: Question }
  | { kind: 'repeat'; sectionKey: string; sectionTitle: string; repeatGroup: string; questions: Question[]; label: string }

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'object') return Object.values(value as object).some((v) => typeof v === 'string' && v.trim().length > 0)
  return true
}

function buildScreens(sections: SectionWithQuestions[], flat: AnswerMap): Screen[] {
  const screens: Screen[] = []
  for (const section of sections) {
    const seenGroups = new Set<string>()
    for (const q of section.questions) {
      if (q.repeat_group) {
        if (seenGroups.has(q.repeat_group)) continue
        seenGroups.add(q.repeat_group)
        if (!isVisible(q.show_if, flat)) continue
        const groupQuestions = section.questions.filter((qq) => qq.repeat_group === q.repeat_group)
        screens.push({
          kind: 'repeat',
          sectionKey: section.key,
          sectionTitle: section.title,
          repeatGroup: q.repeat_group,
          questions: groupQuestions,
          label: q.repeat_item_label ?? 'Entry',
        })
      } else {
        if (!isVisible(q.show_if, flat)) continue
        screens.push({ kind: 'question', sectionKey: section.key, sectionTitle: section.title, question: q })
      }
    }
  }
  return screens
}

export function QuestionnaireWizard({
  applicationId,
  sections,
  initialAnswers,
  finishHref,
  title,
}: {
  applicationId: string
  sections: SectionWithQuestions[]
  initialAnswers: { question_key: string; repeater_index: number; value: unknown }[]
  finishHref: string
  title: string
}) {
  const router = useRouter()

  const [values, setValues] = useState<ValuesState>(() => {
    const v: ValuesState = {}
    for (const row of initialAnswers) {
      v[row.question_key] ??= {}
      v[row.question_key][row.repeater_index] = row.value
    }
    return v
  })
  const [instances, setInstances] = useState<InstancesState>(() => {
    const inst: InstancesState = {}
    const groupByQuestionKey = new Map<string, string>()
    for (const s of sections) for (const q of s.questions) if (q.repeat_group) groupByQuestionKey.set(q.key, q.repeat_group)
    for (const row of initialAnswers) {
      const group = groupByQuestionKey.get(row.question_key)
      if (!group) continue
      inst[group] ??= []
      if (!inst[group].includes(row.repeater_index)) inst[group].push(row.repeater_index)
    }
    for (const key in inst) inst[key].sort((a, b) => a - b)
    return inst
  })
  const [screenIndex, setScreenIndex] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pendingQueue = useRef<Map<string, { questionKey: string; repeaterIndex: number; value: unknown }>>(new Map())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flat: AnswerMap = useMemo(() => {
    const f: AnswerMap = {}
    for (const key in values) f[key] = values[key][0]
    return f
  }, [values])

  const screens = useMemo(() => buildScreens(sections, flat), [sections, flat])
  const clampedIndex = Math.min(screenIndex, Math.max(0, screens.length - 1))
  const screen = screens[clampedIndex]

  async function flushQueue() {
    if (pendingQueue.current.size === 0) return
    const batch = Array.from(pendingQueue.current.values())
    pendingQueue.current.clear()
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/applications/${applicationId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: batch }),
      })
      if (!res.ok) throw new Error('save failed')
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  function scheduleSave(questionKey: string, repeaterIndex: number, value: unknown) {
    pendingQueue.current.set(`${questionKey}:${repeaterIndex}`, { questionKey, repeaterIndex, value })
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flushQueue, 700)
  }

  function setValue(questionKey: string, repeaterIndex: number, value: unknown) {
    setValues((prev) => ({ ...prev, [questionKey]: { ...(prev[questionKey] ?? {}), [repeaterIndex]: value } }))
    setErrors((prev) => ({ ...prev, [questionKey]: '' }))
    scheduleSave(questionKey, repeaterIndex, value)
  }

  function addInstance(repeatGroup: string) {
    setInstances((prev) => {
      const existing = prev[repeatGroup] ?? []
      const next = existing.length === 0 ? [0] : [...existing, Math.max(...existing) + 1]
      return { ...prev, [repeatGroup]: next }
    })
  }

  function validateScreen(): boolean {
    if (!screen) return true
    if (screen.kind === 'question') {
      if (screen.question.required && !isAnswered(values[screen.question.key]?.[0])) {
        setErrors({ [screen.question.key]: 'This field is required to continue.' })
        return false
      }
      return true
    }
    // repeat screen: if any question in the group is required, require at
    // least one instance with a non-empty value.
    const requiredInGroup = screen.questions.some((q) => q.required)
    if (!requiredInGroup) return true
    const idxs = instances[screen.repeatGroup] ?? [0]
    const anyFilled = idxs.some((i) => screen.questions.some((q) => isAnswered(values[q.key]?.[i])))
    if (!anyFilled) {
      setErrors({ [screen.repeatGroup]: 'Add at least one entry to continue.' })
      return false
    }
    return true
  }

  async function goNext() {
    if (!validateScreen()) return
    await flushQueue()
    if (clampedIndex >= screens.length - 1) {
      router.push(finishHref)
      return
    }
    setScreenIndex(clampedIndex + 1)
  }

  async function goBack() {
    await flushQueue()
    if (clampedIndex === 0) return
    setScreenIndex(clampedIndex - 1)
  }

  const sectionSummaries = useMemo(() => {
    const order: { key: string; title: string; firstIndex: number }[] = []
    screens.forEach((s, i) => {
      if (!order.some((o) => o.key === s.sectionKey)) order.push({ key: s.sectionKey, title: s.sectionTitle, firstIndex: i })
    })
    return order
  }, [screens])

  async function jumpToSection(firstIndex: number) {
    await flushQueue()
    setScreenIndex(firstIndex)
  }

  if (!screen) {
    return (
      <div className="text-center">
        <p className="text-ink-600">Nothing left to answer in this section.</p>
        <button className="btn-primary mt-4" onClick={() => router.push(finishHref)}>Continue</button>
      </div>
    )
  }

  const percent = screens.length > 0 ? Math.round(((clampedIndex + 1) / screens.length) * 100) : 100

  return (
    <div>
      <div className="mb-6 flex items-center justify-between text-sm text-ink-500">
        <span>{title}</span>
        <span aria-live="polite">
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && <span className="text-danger-600">Couldn&apos;t save — check your connection</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-compass-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-400">{screen.sectionTitle} · Question {clampedIndex + 1} of {screens.length}</p>

      {sectionSummaries.length > 1 && (
        <nav className="mt-6 hidden flex-wrap gap-2 lg:flex" aria-label="Section navigation">
          {sectionSummaries.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => jumpToSection(s.firstIndex)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                s.key === screen.sectionKey ? 'bg-harbor-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>
      )}

      <div className="mt-8 max-w-2xl">
        {screen.kind === 'question' ? (
          <div>
            <h1 className="text-2xl font-bold text-ink-950">{screen.question.prompt}</h1>
            {screen.question.help_text && <p className="mt-2 text-ink-600">{screen.question.help_text}</p>}
            <div className="mt-6">
              <QuestionField
                question={screen.question}
                value={values[screen.question.key]?.[0] ?? emptyValueForType(screen.question.type)}
                onChange={(v) => setValue(screen.question.key, 0, v)}
                autoFocus
              />
              {errors[screen.question.key] && <p className="field-error">{errors[screen.question.key]}</p>}
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-ink-950">{screen.questions[0]?.prompt ?? screen.label}</h1>
            <div className="mt-6 space-y-6">
              {(instances[screen.repeatGroup]?.length ? instances[screen.repeatGroup] : [0]).map((i, position) => (
                <div key={i} className="rounded-2xl border border-ink-100 p-5">
                  <p className="mb-4 text-sm font-semibold text-ink-500">{screen.label} {position + 1}</p>
                  <div className="space-y-5">
                    {screen.questions.map((q) => (
                      <div key={q.key}>
                        <label className="field-label">{q.prompt}</label>
                        <QuestionField
                          question={q}
                          value={values[q.key]?.[i] ?? emptyValueForType(q.type)}
                          onChange={(v) => setValue(q.key, i, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {errors[screen.repeatGroup] && <p className="field-error">{errors[screen.repeatGroup]}</p>}
            <button type="button" className="btn-outline mt-4" onClick={() => addInstance(screen.repeatGroup)}>
              + Add another {screen.label.toLowerCase()}
            </button>
          </div>
        )}
      </div>

      <div className="mt-10 flex max-w-2xl items-center justify-between">
        <button type="button" onClick={goBack} disabled={clampedIndex === 0} className="btn-ghost disabled:opacity-30">
          ← Back
        </button>
        <button type="button" onClick={goNext} className="btn-primary">
          {clampedIndex >= screens.length - 1 ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  )
}

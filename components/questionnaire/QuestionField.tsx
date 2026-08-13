'use client'

import type { Question } from '@/lib/supabase/types'

export type NameValue = { first?: string; middle?: string; last?: string }
export type AddressValue = { street?: string; unit?: string; city?: string; state?: string; zip?: string; country?: string }

export function emptyValueForType(type: Question['type']): unknown {
  if (type === 'name') return {}
  if (type === 'address') return {}
  return ''
}

export function QuestionField({
  question,
  value,
  onChange,
  autoFocus,
}: {
  question: Question
  value: unknown
  onChange: (value: unknown) => void
  autoFocus?: boolean
}) {
  const id = `q-${question.key}`

  switch (question.type) {
    case 'yes_no':
      return (
        <div className="grid grid-cols-2 gap-3">
          {(['yes', 'no'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className="select-card text-center capitalize"
              data-selected={value === opt}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )

    case 'radio_cards':
      return (
        <div className="grid gap-3">
          {(question.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="select-card"
              data-selected={value === opt.value}
              onClick={() => onChange(opt.value)}
            >
              <div className="font-medium text-ink-900">{opt.label}</div>
              {opt.help_text && <div className="mt-1 text-sm text-ink-500">{opt.help_text}</div>}
            </button>
          ))}
        </div>
      )

    case 'select':
      return (
        <select id={id} className="field-input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}>
          <option value="" disabled>Select an option</option>
          {(question.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )

    case 'name': {
      const v = (value ?? {}) as NameValue
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor={`${id}-first`}>First name</label>
            <input id={`${id}-first`} className="field-input" value={v.first ?? ''} autoFocus={autoFocus} onChange={(e) => onChange({ ...v, first: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-middle`}>Middle name</label>
            <input id={`${id}-middle`} className="field-input" value={v.middle ?? ''} onChange={(e) => onChange({ ...v, middle: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-last`}>Last name</label>
            <input id={`${id}-last`} className="field-input" value={v.last ?? ''} onChange={(e) => onChange({ ...v, last: e.target.value })} />
          </div>
        </div>
      )
    }

    case 'address': {
      const v = (value ?? {}) as AddressValue
      return (
        <div className="grid gap-4">
          <div>
            <label className="field-label" htmlFor={`${id}-street`}>Street address</label>
            <input id={`${id}-street`} className="field-input" value={v.street ?? ''} autoFocus={autoFocus} onChange={(e) => onChange({ ...v, street: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-unit`}>Apt / Unit (optional)</label>
            <input id={`${id}-unit`} className="field-input" value={v.unit ?? ''} onChange={(e) => onChange({ ...v, unit: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor={`${id}-city`}>City</label>
              <input id={`${id}-city`} className="field-input" value={v.city ?? ''} onChange={(e) => onChange({ ...v, city: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-state`}>State / Province</label>
              <input id={`${id}-state`} className="field-input" value={v.state ?? ''} onChange={(e) => onChange({ ...v, state: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-zip`}>ZIP / Postal code</label>
              <input id={`${id}-zip`} className="field-input" value={v.zip ?? ''} onChange={(e) => onChange({ ...v, zip: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-country`}>Country</label>
            <input id={`${id}-country`} className="field-input" value={v.country ?? 'United States'} onChange={(e) => onChange({ ...v, country: e.target.value })} />
          </div>
        </div>
      )
    }

    case 'date':
      return <input id={id} type="date" className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />

    case 'number':
      return <input id={id} type="number" className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />

    case 'email':
      return <input id={id} type="email" className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />

    case 'phone':
      return <input id={id} type="tel" className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} placeholder={question.placeholder ?? '(555) 555-5555'} />

    case 'textarea':
      return <textarea id={id} rows={4} className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />

    case 'text':
    default:
      return <input id={id} type="text" className="field-input" value={(value as string) ?? ''} autoFocus={autoFocus} placeholder={question.placeholder ?? undefined} onChange={(e) => onChange(e.target.value)} />
  }
}

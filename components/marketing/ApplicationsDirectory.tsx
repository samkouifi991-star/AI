'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type AppRow = {
  slug: string
  form_code: string
  name: string
  short_name: string
  summary: string
  goal_categories: string[]
}

const goalLabels: Record<string, string> = {
  'green-card': 'Green Card',
  citizenship: 'Citizenship',
  family: 'Family Immigration',
  fiance: 'Fiancé(e)',
  work: 'Work Authorization',
  travel: 'Travel Documents',
  sponsorship: 'Financial Sponsorship',
  address: 'Change of Address',
  'citizenship-documents': 'Citizenship Documents',
  other: 'Other Immigration Forms',
}

// Strips hyphens (and collapses whitespace) so "N400" matches "N-400" and
// "I751" matches "I-751", while phrase searches like "green card" still work
// unchanged since there's no hyphen to strip there.
function normalize(s: string): string {
  return s.toLowerCase().replace(/-/g, '').replace(/\s+/g, ' ').trim()
}

export function ApplicationsDirectory({ applications, initialGoal }: { applications: AppRow[]; initialGoal?: string }) {
  const [query, setQuery] = useState('')
  const [goal, setGoal] = useState<string | null>(initialGoal ?? null)

  const availableGoals = useMemo(() => {
    const set = new Set<string>()
    applications.forEach((a) => a.goal_categories.forEach((g) => set.add(g)))
    return Array.from(set)
  }, [applications])

  const filtered = applications.filter((app) => {
    const q = normalize(query)
    const matchesQuery =
      q.length === 0 ||
      normalize(app.name).includes(q) ||
      normalize(app.short_name).includes(q) ||
      normalize(app.form_code).includes(q) ||
      normalize(app.summary).includes(q) ||
      normalize(app.goal_categories.join(' ')).includes(q)
    const matchesGoal = !goal || app.goal_categories.includes(goal)
    return matchesQuery && matchesGoal
  })

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search by form number or name (e.g. N-400, green card)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input sm:max-w-sm"
          aria-label="Search applications"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setGoal(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${!goal ? 'bg-harbor-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
        >
          All Goals
        </button>
        {availableGoals.map((g) => (
          <button
            key={g}
            onClick={() => setGoal(g)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${goal === g ? 'bg-harbor-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
          >
            {goalLabels[g] ?? g}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm text-ink-500">{filtered.length} application{filtered.length === 1 ? '' : 's'}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((app) => (
          <Link key={app.slug} href={`/applications/${app.slug}`} className="card block hover:shadow-card-hover">
            <span className="badge-neutral">{app.form_code}</span>
            <h3 className="mt-3 font-heading text-lg font-semibold">{app.name}</h3>
            <p className="mt-2 text-sm text-ink-600 line-clamp-3">{app.summary}</p>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-ink-200 p-10 text-center text-ink-500">
            No applications match that search. Try the{' '}
            <Link href="/find-my-application" className="font-semibold text-harbor-700">
              Find My Application
            </Link>{' '}
            wizard instead.
          </p>
        )}
      </div>
    </div>
  )
}

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
  sponsorship: 'Sponsorship',
  address: 'Change of Address',
  'citizenship-documents': 'Citizenship Documents',
  other: 'Other Immigration Forms',
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
    const matchesQuery =
      query.trim().length === 0 ||
      app.name.toLowerCase().includes(query.toLowerCase()) ||
      app.form_code.toLowerCase().includes(query.toLowerCase()) ||
      app.summary.toLowerCase().includes(query.toLowerCase())
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

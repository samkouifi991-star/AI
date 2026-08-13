import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getApplicationSummary } from '@/lib/engine/summary'

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/dashboard')

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const { data: applications } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  const summaries = await Promise.all((applications ?? []).map((app) => getApplicationSummary(supabase, app)))

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
      <p className="mt-1 text-ink-600">Here's where every application you've started stands.</p>

      <div className="mt-8 space-y-5">
        {(applications ?? []).length === 0 && (
          <div className="card text-center">
            <p className="text-ink-600">You haven&apos;t started an application yet.</p>
            <Link href="/find-my-application" className="btn-primary mt-4 inline-flex">Find My Application</Link>
          </div>
        )}

        {(applications ?? []).map((app, i) => {
          const summary = summaries[i]
          return (
            <div key={app.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="badge-neutral">{summary.applicationType.form_code}</span>
                  <h2 className="mt-2 font-heading text-lg font-semibold">{summary.applicationType.name}</h2>
                </div>
                <span className="text-sm font-semibold text-ink-500">{summary.progressPercent}% Complete</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-compass-500" style={{ width: `${summary.progressPercent}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-ink-600">Next: {summary.nextStep.label}</p>
                <Link href={summary.nextStep.href} className="btn-primary">Continue</Link>
              </div>
              <Link href={`/application/${app.id}`} className="mt-3 inline-block text-sm font-semibold text-harbor-700 hover:text-harbor-900">
                View full application dashboard →
              </Link>
            </div>
          )
        })}
      </div>

      {(applications ?? []).length > 0 && (
        <Link href="/find-my-application" className="btn-outline mt-8 inline-flex">Start Another Application</Link>
      )}
    </div>
  )
}

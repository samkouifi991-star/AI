import { requireStaff } from '@/lib/admin'

export default async function AdminOverviewPage() {
  const { supabase } = await requireStaff()

  const [{ count: userCount }, { count: applicationCount }, { count: paidCount }, { count: openSupport }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('applications').select('*', { count: 'exact', head: true }),
    supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'succeeded'),
    supabase.from('support_requests').select('*', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  const stats = [
    { label: 'Total customers', value: userCount ?? 0 },
    { label: 'Applications started', value: applicationCount ?? 0 },
    { label: 'Completed payments', value: paidCount ?? 0 },
    { label: 'Open support requests', value: openSupport ?? 0 },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-sm text-ink-500">{s.label}</p>
            <p className="mt-2 font-heading text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

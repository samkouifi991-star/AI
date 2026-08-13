import { requireStaff } from '@/lib/admin'

export default async function AdminApplicationsPage() {
  const { supabase } = await requireStaff()
  const { data: applications } = await supabase
    .from('applications')
    .select('*, application_types(form_code, name), profiles(email)')
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: payments } = await supabase.from('payments').select('application_id, status').eq('status', 'succeeded')
  const paidSet = new Set((payments ?? []).map((p) => p.application_id))

  return (
    <div>
      <h1 className="text-2xl font-bold">Applications</h1>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Application</th>
              <th className="px-5 py-3 font-semibold">Progress</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Payment</th>
              <th className="px-5 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(applications ?? []).map((app: any) => (
              <tr key={app.id}>
                <td className="px-5 py-3">{app.profiles?.email ?? 'Not signed in yet'}</td>
                <td className="px-5 py-3">{app.application_types?.form_code} — {app.application_types?.name}</td>
                <td className="px-5 py-3">{app.progress_percent}%</td>
                <td className="px-5 py-3"><span className="badge-neutral capitalize">{app.status.replace('_', ' ')}</span></td>
                <td className="px-5 py-3">{paidSet.has(app.id) ? <span className="badge-success">Paid</span> : <span className="badge-neutral">Unpaid</span>}</td>
                <td className="px-5 py-3 text-ink-500">{new Date(app.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { requireStaff } from '@/lib/admin'
import { updateSupportRequestStatus } from '@/app/actions/admin'

export default async function AdminSupportPage() {
  const { supabase } = await requireStaff()
  const { data: requests } = await supabase.from('support_requests').select('*').order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold">Support Requests</h1>
      <div className="mt-6 space-y-4">
        {(requests ?? []).map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-heading font-semibold">{r.subject}</p>
                <p className="text-sm text-ink-500">{r.name} · {r.email} · {new Date(r.created_at).toLocaleString()}</p>
              </div>
              <form action={updateSupportRequestStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className="field-input py-1.5 text-sm">
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <button type="submit" className="btn-outline">Update</button>
              </form>
            </div>
            <p className="mt-3 text-sm text-ink-700">{r.message}</p>
          </div>
        ))}
        {(requests ?? []).length === 0 && <p className="text-ink-500">No support requests yet.</p>}
      </div>
    </div>
  )
}

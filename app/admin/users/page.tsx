import { requireStaff } from '@/lib/admin'

export default async function AdminUsersPage() {
  const { supabase } = await requireStaff()
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3">{u.full_name ?? '—'}</td>
                <td className="px-5 py-3">{u.email}</td>
                <td className="px-5 py-3"><span className="badge-neutral capitalize">{u.role}</span></td>
                <td className="px-5 py-3 text-ink-500">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

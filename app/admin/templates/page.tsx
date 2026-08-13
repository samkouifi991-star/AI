import Link from 'next/link'
import { requireStaff } from '@/lib/admin'

export default async function AdminTemplatesPage() {
  const { supabase } = await requireStaff()
  const { data: applicationTypes } = await supabase.from('application_types').select('*').order('sort_order')

  return (
    <div>
      <h1 className="text-2xl font-bold">Application Templates</h1>
      <p className="mt-1 text-ink-600">Every immigration application is schema-driven — edit content and questions here without touching code.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Form</th>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Active</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(applicationTypes ?? []).map((app) => (
              <tr key={app.id}>
                <td className="px-5 py-3"><span className="badge-neutral">{app.form_code}</span></td>
                <td className="px-5 py-3">{app.name}</td>
                <td className="px-5 py-3">{app.is_active ? <span className="badge-success">Active</span> : <span className="badge-neutral">Inactive</span>}</td>
                <td className="px-5 py-3">
                  <Link href={`/admin/templates/${app.slug}`} className="font-semibold text-harbor-700 hover:text-harbor-900">Edit →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

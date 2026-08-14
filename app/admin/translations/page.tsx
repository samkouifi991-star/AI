import Link from 'next/link'
import { requireStaff } from '@/lib/admin'
import { computePackageDisplayStatus, packageStatusLabel } from '@/lib/engine/translation-package'
import { formatCents } from '@/lib/engine/pricing'
import type { Translation } from '@/lib/supabase/types'

export default async function AdminTranslationsPage() {
  const { supabase } = await requireStaff()

  const { data: packages } = await supabase
    .from('application_translation_packages')
    .select('*, applications(id, application_type_id, application_types(form_code, name))')
    .order('created_at', { ascending: false })

  const userIds = Array.from(new Set((packages ?? []).map((p) => p.user_id).filter(Boolean))) as string[]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] }
  const emailByUserId = new Map((profiles ?? []).map((p) => [p.id, p.email]))

  const packageIds = (packages ?? []).map((p) => p.id)
  const { data: allJobs } = packageIds.length
    ? await supabase.from('translations').select('*').in('translation_package_id', packageIds)
    : { data: [] }
  const jobs = (allJobs ?? []) as Translation[]

  // Self-provided translations (no package, no charge) are still worth
  // seeing so admin can spot-check them, even though there's nothing to
  // fulfill on Smart USA Visa's side.
  const { data: selfProvided } = await supabase
    .from('translations')
    .select('*, applications(id, application_type_id, application_types(form_code, name))')
    .eq('self_provided', true)
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold">Translation Packages</h1>
      <p className="mt-1 text-ink-600">One row per application — the $75 flat fee is charged once per package, never per document.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Application</th>
              <th className="px-5 py-3 font-semibold">Package Status</th>
              <th className="px-5 py-3 font-semibold">Amount Paid</th>
              <th className="px-5 py-3 font-semibold">Documents</th>
              <th className="px-5 py-3 font-semibold">Completed</th>
              <th className="px-5 py-3 font-semibold">Pending</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(packages ?? []).map((pkg: any) => {
              const pkgJobs = jobs.filter((j) => j.translation_package_id === pkg.id)
              const status = computePackageDisplayStatus(pkg, pkgJobs)
              const completed = pkgJobs.filter((j) => j.status === 'completed').length
              return (
                <tr key={pkg.id}>
                  <td className="px-5 py-3">{pkg.user_id ? emailByUserId.get(pkg.user_id) ?? '—' : '—'}</td>
                  <td className="px-5 py-3">{pkg.applications?.application_types?.form_code} — {pkg.applications?.application_types?.name}</td>
                  <td className="px-5 py-3"><span className="badge-neutral">{packageStatusLabel[status]}</span></td>
                  <td className="px-5 py-3">{pkg.payment_status === 'paid' ? formatCents(pkg.price_cents) : '—'}</td>
                  <td className="px-5 py-3">{pkgJobs.length}</td>
                  <td className="px-5 py-3">{completed}</td>
                  <td className="px-5 py-3">{pkgJobs.length - completed}</td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/translations/${pkg.id}`} className="font-semibold text-harbor-700 hover:text-harbor-900">Manage →</Link>
                  </td>
                </tr>
              )
            })}
            {(packages ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-500">No translation packages purchased yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(selfProvided ?? []).length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold">Self-Provided Translations</h2>
          <p className="mt-1 text-sm text-ink-500">Customers uploaded their own translation — no package, no charge.</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-100 bg-white">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Application</th>
                  <th className="px-5 py-3 font-semibold">Document</th>
                  <th className="px-5 py-3 font-semibold">Language</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(selfProvided ?? []).map((job: any) => (
                  <tr key={job.id}>
                    <td className="px-5 py-3">{job.applications?.application_types?.form_code}</td>
                    <td className="px-5 py-3">{job.document_label}</td>
                    <td className="px-5 py-3">{job.source_language}</td>
                    <td className="px-5 py-3"><span className="badge-neutral capitalize">{job.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

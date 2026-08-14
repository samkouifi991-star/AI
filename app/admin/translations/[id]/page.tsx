import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin'
import { computePackageDisplayStatus, packageStatusLabel } from '@/lib/engine/translation-package'
import { formatCents } from '@/lib/engine/pricing'
import { TranslationJobPanel } from '@/components/admin/TranslationJobPanel'
import type { Translation } from '@/lib/supabase/types'

export default async function AdminTranslationPackageDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireStaff()

  const { data: pkg } = await supabase
    .from('application_translation_packages')
    .select('*, applications(id, application_type_id, application_types(form_code, name))')
    .eq('id', params.id)
    .single()
  if (!pkg) notFound()

  const { data: profile } = pkg.user_id ? await supabase.from('profiles').select('email, full_name').eq('id', pkg.user_id).single() : { data: null }
  const { data: jobs } = await supabase.from('translations').select('*').eq('translation_package_id', pkg.id).order('created_at')
  const allJobs = (jobs ?? []) as Translation[]
  const status = computePackageDisplayStatus(pkg, allJobs)

  return (
    <div>
      <Link href="/admin/translations" className="text-sm font-semibold text-harbor-700">← All translation packages</Link>
      <h1 className="mt-2 text-2xl font-bold">
        {(pkg as any).applications?.application_types?.form_code} — {(pkg as any).applications?.application_types?.name}
      </h1>

      <div className="card mt-6 grid gap-4 sm:grid-cols-4">
        <div>
          <p className="text-sm text-ink-500">Customer</p>
          <p className="font-medium">{profile?.email ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Package Status</p>
          <p className="font-medium">{packageStatusLabel[status]}</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Amount Paid</p>
          <p className="font-medium">{pkg.payment_status === 'paid' ? formatCents(pkg.price_cents) : 'Not yet paid'}</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Documents</p>
          <p className="font-medium">{allJobs.length} ({allJobs.filter((j) => j.status === 'completed').length} completed)</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {allJobs.map((job) => (
          <TranslationJobPanel key={job.id} packageId={pkg.id} job={job} />
        ))}
        {allJobs.length === 0 && <p className="text-ink-500">No documents submitted to this package yet.</p>}
      </div>
    </div>
  )
}

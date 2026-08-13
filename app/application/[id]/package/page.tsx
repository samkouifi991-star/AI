import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById } from '@/lib/engine/schema'
import { PackageDownloads } from '@/components/questionnaire/PackageDownloads'
import { regeneratePackage } from '@/app/actions/package'

export default async function PackagePage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible

  if (application.status !== 'paid' && application.status !== 'package_ready') {
    redirect(`/application/${application.id}/review`)
  }

  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const { data: pkg } = await supabase.from('generated_packages').select('*').eq('application_id', application.id).maybeSingle()

  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="badge-success">Payment received</span>
      <h1 className="mt-4 text-3xl font-bold">Your filing package is ready</h1>
      <p className="mt-3 text-ink-600">
        {applicationType.form_code} — {applicationType.name}. Review everything carefully before
        you sign and file — Smart USA Visa prepares your paperwork but does not file it for you.
      </p>

      <div className="mt-10 rounded-2xl border border-ink-100 p-6 text-left">
        {pkg ? (
          <PackageDownloads applicationId={application.id} />
        ) : (
          <div className="text-center">
            <p className="text-ink-600">We&apos;re finishing preparation of your package — this usually takes a few seconds.</p>
            <form action={regeneratePackage} className="mt-4">
              <input type="hidden" name="applicationId" value={application.id} />
              <button type="submit" className="btn-primary">Check Again</button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-10 rounded-2xl bg-harbor-50 p-6 text-left text-sm text-ink-700">
        <p className="font-semibold">Before you file</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Sign every page that requires a signature, in black ink.</li>
          <li>Assemble your package in the order listed in your filing instructions.</li>
          <li>Confirm the current filing fee and filing address on uscis.gov before mailing.</li>
          <li>Keep a full copy of everything you file for your own records.</li>
        </ul>
      </div>

      <Link href="/dashboard" className="btn-ghost mt-8 inline-flex">← Back to dashboard</Link>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById } from '@/lib/engine/schema'
import { getPricingForApplicationType, effectiveServiceFeeCents } from '@/lib/engine/pricing'
import { CheckoutPanel } from '@/components/questionnaire/CheckoutPanel'

export default async function CheckoutPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible

  if (application.status === 'paid' || application.status === 'package_ready') {
    redirect(`/application/${application.id}/package`)
  }

  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const { pricing, governmentFees } = await getPricingForApplicationType(supabase, application.application_type_id)

  const { data: docs } = await supabase
    .from('application_documents')
    .select('translation_id')
    .eq('application_id', application.id)
    .not('translation_id', 'is', null)
  const translationIds = (docs ?? []).map((d) => d.translation_id).filter(Boolean) as string[]
  const { data: translations } = translationIds.length
    ? await supabase.from('translations').select('*').in('id', translationIds)
    : { data: [] }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-harbor-700">{applicationType.form_code} — {applicationType.name}</p>
      <h1 className="mt-2 text-2xl font-bold">Prepare your filing package</h1>
      <p className="mt-2 text-ink-600">
        This charges the Smart USA Visa preparation service only. Government filing fees are paid
        separately, directly to USCIS, when you file.
      </p>

      <div className="mt-8">
        <CheckoutPanel
          applicationId={application.id}
          serviceFeeCents={effectiveServiceFeeCents(pricing)}
          printMailFeeCents={pricing.print_mail_fee_cents}
          governmentFees={governmentFees.map((f) => ({ label: f.label, amountCents: f.amount_cents }))}
          translationLines={(translations ?? []).map((t) => ({ label: t.source_language, amountCents: t.price_cents, status: t.status }))}
        />
      </div>

      <Link href={`/application/${application.id}/review`} className="btn-ghost mt-6 inline-flex">← Back to review</Link>
    </div>
  )
}

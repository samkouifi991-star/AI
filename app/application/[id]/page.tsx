import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationSummary } from '@/lib/engine/summary'
import { packageStatusLabel } from '@/lib/engine/translation-package'

export default async function ApplicationHubPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible
  const summary = await getApplicationSummary(supabase, application)

  const cards = [
    {
      title: 'Application',
      body: `${summary.progressPercent}% complete`,
      href: `/application/${application.id}/questions`,
      cta: 'Continue answering questions',
    },
    {
      title: 'Documents',
      body: `${summary.documentsUploaded} of ${summary.documentsTotal} uploaded`,
      href: `/application/${application.id}/documents`,
      cta: 'Manage documents',
    },
    {
      title: 'Translation',
      body: packageStatusLabel[summary.translationPackageStatus],
      href: `/application/${application.id}/translations`,
      cta: 'View translations',
    },
    {
      title: 'Review',
      body: summary.reviewIssues > 0 ? `${summary.reviewIssues} item${summary.reviewIssues === 1 ? '' : 's'} need attention` : 'Looks complete',
      href: `/application/${application.id}/review`,
      cta: 'Open readiness review',
    },
    {
      title: 'Payment',
      body: summary.paymentStatus === 'paid' ? 'Paid' : 'Not purchased',
      href: `/application/${application.id}/checkout`,
      cta: summary.paymentStatus === 'paid' ? 'View receipt' : 'Prepare & pay',
    },
    {
      title: 'Final Package',
      body: summary.packageReady ? 'Available' : 'Available after payment',
      href: `/application/${application.id}/package`,
      cta: summary.packageReady ? 'Download package' : 'Not yet available',
    },
  ]

  return (
    <div>
      <p className="text-sm text-ink-500">Welcome back</p>
      <h1 className="mt-1 text-2xl font-bold">{summary.applicationType.form_code} — {summary.applicationType.name}</h1>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 w-48 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-compass-500" style={{ width: `${summary.progressPercent}%` }} />
        </div>
        <span className="text-sm font-semibold text-ink-700">{summary.progressPercent}% Complete</span>
      </div>

      <div className="mt-8 rounded-2xl bg-harbor-900 p-6 text-white">
        <p className="text-sm font-medium text-harbor-200">Your next step</p>
        <p className="mt-1 text-lg font-heading font-semibold">{summary.nextStep.label}</p>
        <Link href={summary.nextStep.href} className="btn-primary mt-4 inline-flex">Continue →</Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="card block hover:shadow-card-hover">
            <h3 className="font-heading font-semibold">{card.title}</h3>
            <p className="mt-1 text-sm text-ink-600">{card.body}</p>
            <p className="mt-3 text-sm font-semibold text-harbor-700">{card.cta} →</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

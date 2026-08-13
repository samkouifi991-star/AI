import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPricingForApplicationType, effectiveServiceFeeCents, formatCents } from '@/lib/engine/pricing'
import { startApplication } from '@/app/actions/applications'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data } = await supabase.from('application_types').select('name, summary').eq('slug', params.slug).single()
  if (!data) return {}
  return { title: data.name, description: data.summary }
}

export default async function ApplicationPackagePage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: applicationType } = await supabase
    .from('application_types')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single()

  if (!applicationType) notFound()

  const { pricing, governmentFees } = await getPricingForApplicationType(supabase, applicationType.id)
  const { data: documentRequirements } = await supabase
    .from('document_requirements')
    .select('*')
    .eq('application_type_id', applicationType.id)
    .order('sort_order')

  const serviceFee = effectiveServiceFeeCents(pricing)
  const totalGovernmentFee = governmentFees.reduce((sum, f) => sum + f.amount_cents, 0)

  const faqs = [
    {
      q: 'Do I need a lawyer to use Smart USA Visa?',
      a: 'No. Smart USA Visa is a self-service document preparation platform, not a law firm. If your situation is complex, we will flag it and suggest speaking with a qualified immigration attorney, but most straightforward cases can be prepared entirely through our guided questionnaire.',
    },
    {
      q: 'How long does the process take?',
      a: `Completing the ${applicationType.form_code} questionnaire typically takes 30–60 minutes, though you can save and resume anytime. USCIS processing times after filing vary and are outside our control — check the USCIS processing time tool for current estimates.`,
    },
    {
      q: 'What if I make a mistake on my answers?',
      a: 'You can go back and edit any answer before you finish. Our smart validation checks for missing information, impossible date sequences, and other common issues before you file.',
    },
    {
      q: 'Is my information secure?',
      a: 'Yes. Your data is encrypted in transit and at rest, documents are stored in private storage with signed, time-limited access links, and access is protected by row-level security so only you (and authorized support staff) can see your application.',
    },
  ]

  return (
    <div className="container-page py-14">
      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <span className="badge-neutral">Form {applicationType.form_code}</span>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{applicationType.name}</h1>
          <p className="mt-4 text-lg text-ink-600">{applicationType.summary}</p>

          <section className="mt-10">
            <h2 className="text-xl font-bold">Who this is for</h2>
            <p className="mt-3 text-ink-700">{applicationType.who_its_for}</p>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold">Eligibility overview</h2>
            <p className="mt-3 text-ink-700">{applicationType.eligibility_overview}</p>
            <p className="mt-3 text-sm text-ink-500">
              This is a general overview, not an eligibility determination. We'll ask specific
              questions about your situation during the guided eligibility check.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold">What's included</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                'Guided, conversational questionnaire',
                'Personalized document checklist',
                'Smart validation before you file',
                'Completed form(s), ready to sign',
                'Personalized filing instructions',
                'Certified translation available',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="mt-0.5 text-success-600">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {documentRequirements && documentRequirements.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">Documents generally required</h2>
              <p className="mt-2 text-sm text-ink-500">
                Your personalized checklist may differ based on your answers.
              </p>
              <ul className="mt-4 space-y-2">
                {documentRequirements.map((doc) => (
                  <li key={doc.id} className="flex items-start gap-2 text-sm text-ink-700">
                    <span className="mt-0.5 text-harbor-600">•</span>
                    {doc.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-bold">Expected workflow</h2>
            <p className="mt-3 text-ink-700">{applicationType.workflow_overview}</p>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold">Frequently asked questions</h2>
            <div className="mt-4 space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q} className="card">
                  <h3 className="font-heading font-semibold">{faq.q}</h3>
                  <p className="mt-2 text-sm text-ink-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div>
          <div className="card sticky top-24">
            <p className="text-sm font-semibold text-ink-500">Pricing</p>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-sm text-ink-600">Smart USA Visa service fee</span>
              <span className="font-heading text-2xl font-bold text-ink-950">{formatCents(serviceFee)}</span>
            </div>
            {pricing.promo_active && pricing.promo_fee_cents != null && (
              <p className="mt-1 text-right text-xs text-ink-400 line-through">{formatCents(pricing.service_fee_cents)}</p>
            )}

            <div className="mt-4 border-t border-ink-100 pt-4">
              {governmentFees.map((fee) => (
                <div key={fee.id} className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-600">{fee.label}</span>
                  <span className="font-semibold text-ink-800">
                    {fee.amount_cents > 0 ? formatCents(fee.amount_cents) : 'No fee'}
                  </span>
                </div>
              ))}
              {totalGovernmentFee > 0 && (
                <p className="mt-2 text-xs text-ink-500">
                  Paid directly to USCIS — not collected by Smart USA Visa. {governmentFees[0]?.source_note}
                </p>
              )}
            </div>

            <form action={startApplication} className="mt-6">
              <input type="hidden" name="slug" value={applicationType.slug} />
              <button type="submit" className="btn-primary w-full text-base">
                Start Application
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-ink-500">
              Start for free — no payment until you're ready to prepare your filing package.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-16 border-t border-ink-100 pt-8 text-xs text-ink-500">
        Smart USA Visa is a private company and is not affiliated with USCIS, DHS, the Department
        of State, or any U.S. government agency. We provide self-help document preparation
        services and do not provide legal advice, legal representation, or determine immigration
        eligibility.
      </p>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const goals = [
  { icon: '🪪', title: 'Get a Green Card', href: '/find-my-application?goal=green-card' },
  { icon: '🤝', title: 'Help a Family Member Immigrate', href: '/find-my-application?goal=family' },
  { icon: '🇺🇸', title: 'Apply for Citizenship', href: '/find-my-application?goal=citizenship' },
  { icon: '💍', title: "Bring My Fiancé(e) to the U.S.", href: '/find-my-application?goal=fiance' },
  { icon: '💼', title: 'Get or Renew a Work Permit', href: '/find-my-application?goal=work' },
  { icon: '✈️', title: 'Apply for a Travel Document', href: '/find-my-application?goal=travel' },
]

const steps = [
  { n: '1', title: 'Choose your application', body: 'Tell us what you want to accomplish and we point you to the right USCIS form.' },
  { n: '2', title: 'Answer simple questions', body: 'A guided, conversational wizard — no legal jargon, no blank government PDF.' },
  { n: '3', title: 'Upload your documents', body: 'A personalized checklist tells you exactly what to gather, with certified translation available.' },
  { n: '4', title: 'Review your application', body: 'Smart checks flag missing or inconsistent answers before you file.' },
  { n: '5', title: 'Prepare your filing package', body: 'Download your completed forms, checklist, and personalized filing instructions.' },
]

export default async function HomePage() {
  const supabase = createClient()
  const { data: featured } = await supabase
    .from('application_types')
    .select('slug, form_code, name, short_name, summary')
    .eq('is_active', true)
    .order('sort_order')
    .limit(6)

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-harbor-50 via-white to-white">
        <div className="container-page grid gap-12 py-16 md:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="badge-neutral">Self-service document preparation</span>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
              Your U.S. immigration paperwork, made simpler.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Answer easy questions and Smart USA Visa helps prepare your immigration forms, a
              personalized supporting-document checklist, and clear filing instructions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/find-my-application" className="btn-primary text-base">
                Find My Application
              </Link>
              <Link href="/applications" className="btn-outline text-base">
                View All Applications
              </Link>
            </div>
            <p className="mt-8 max-w-xl text-sm text-ink-500">
              Smart USA Visa is a private document preparation service and is not affiliated with
              USCIS or any U.S. government agency. We are not a law firm and do not provide legal
              advice.
            </p>
          </div>
          <div className="relative">
            <div className="card">
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-semibold text-ink-500">N-400 — Naturalization</span>
                <span className="badge-success">72% Complete</span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-full w-[72%] rounded-full bg-compass-500" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {['Personal Info', 'Address History', 'Employment', 'Travel History'].map((label, i) => (
                  <div key={label} className="rounded-xl border border-ink-100 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={i < 3 ? 'text-success-600' : 'text-warning-500'}>{i < 3 ? '✓' : '!'}</span>
                      <span className="text-ink-700">{label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-2xl bg-white p-4 shadow-card-hover sm:block">
              <p className="text-xs font-semibold text-ink-500">Document checklist</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">8 of 11 uploaded</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">What are you trying to do?</h2>
        <p className="mt-2 text-ink-600">We'll ask a few questions and point you to the right application — no need to know a USCIS form number.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <Link key={goal.title} href={goal.href} className="select-card group">
              <span className="text-2xl">{goal.icon}</span>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-heading font-semibold text-ink-900">{goal.title}</span>
                <span className="text-ink-400 transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/find-my-application" className="mt-6 inline-block text-sm font-semibold text-harbor-700 hover:text-harbor-900">
          Something else? Find my application →
        </Link>
      </section>

      {featured && featured.length > 0 && (
        <section className="bg-harbor-50/60 py-16">
          <div className="container-page">
            <h2 className="text-2xl font-bold sm:text-3xl">Popular applications</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((app) => (
                <Link key={app.slug} href={`/applications/${app.slug}`} className="card block hover:shadow-card-hover">
                  <span className="badge-neutral">{app.form_code}</span>
                  <h3 className="mt-3 font-heading text-lg font-semibold">{app.name}</h3>
                  <p className="mt-2 text-sm text-ink-600 line-clamp-2">{app.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">How Smart USA Visa works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step) => (
            <div key={step.n} className="card">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-harbor-900 font-heading text-sm font-bold text-white">
                {step.n}
              </span>
              <h3 className="mt-4 font-heading font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-ink-100 bg-harbor-900 py-16 text-white">
        <div className="container-page flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Ready to get started?</h2>
            <p className="mt-2 max-w-xl text-harbor-100">
              Start for free — you won't be asked to pay until you're ready to prepare your filing package.
            </p>
          </div>
          <Link href="/find-my-application" className="btn-primary text-base">
            Find My Application
          </Link>
        </div>
      </section>
    </>
  )
}

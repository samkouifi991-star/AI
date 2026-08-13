import Link from 'next/link'

export const metadata = { title: 'Resources' }

const resources = [
  {
    title: 'Understanding continuous residence',
    body: 'For naturalization, "continuous residence" means not abandoning your U.S. home base — a long trip abroad doesn\'t automatically break it, but it can raise questions worth understanding before you file.',
  },
  {
    title: 'What happens at a USCIS interview',
    body: 'Most green card and citizenship applications include an in-person interview where an officer reviews your application and, for naturalization, tests English and civics knowledge.',
  },
  {
    title: 'Fee waivers, explained',
    body: 'Some USCIS forms allow you to request a reduced fee or full fee waiver based on income — Smart USA Visa flags when your selected form supports this.',
  },
  {
    title: 'Why address history matters',
    body: 'USCIS uses your address history to verify identity and residence claims — keeping it complete and gap-free avoids follow-up requests for evidence.',
  },
]

export default function ResourcesPage() {
  return (
    <div className="container-page py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Resources</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        Plain-language explainers to help you understand your application. For authoritative,
        up-to-date government information, always check{' '}
        <a href="https://www.uscis.gov" target="_blank" rel="noreferrer" className="font-semibold text-harbor-700 underline">
          uscis.gov
        </a>{' '}
        directly.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {resources.map((r) => (
          <div key={r.title} className="card">
            <h2 className="font-heading font-semibold">{r.title}</h2>
            <p className="mt-2 text-sm text-ink-600">{r.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 card bg-harbor-50">
        <h2 className="font-heading font-semibold">Not sure where to start?</h2>
        <p className="mt-2 text-sm text-ink-600">Our guided finder asks a few questions and points you to the right application.</p>
        <Link href="/find-my-application" className="btn-primary mt-4 inline-flex">Find My Application</Link>
      </div>
    </div>
  )
}

import Link from 'next/link'

export const metadata = { title: 'How It Works' }

const steps = [
  { n: '1', title: 'Choose your application', body: "Tell us what you want to accomplish and we'll point you to the right USCIS form — no need to already know a form number." },
  { n: '2', title: 'Answer simple questions', body: 'We guide you through your application one plain-language question at a time, with tooltips and examples along the way.' },
  { n: '3', title: 'Upload your documents', body: 'Receive a personalized supporting-document checklist built from your actual answers, with certified translation available for foreign-language documents.' },
  { n: '4', title: 'Review your application', body: 'Smart checks identify missing information, impossible date sequences, and other common issues before you file.' },
  { n: '5', title: 'Prepare your filing package', body: 'Download your completed forms, personalized filing instructions, document checklist, and a filing cover sheet.' },
]

export default function HowItWorksPage() {
  return (
    <div className="container-page py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">How Smart USA Visa works</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        A guided, TurboTax-style interview for U.S. immigration paperwork — built for clarity, not
        for legal jargon.
      </p>

      <div className="mt-12 space-y-8">
        {steps.map((step) => (
          <div key={step.n} className="flex gap-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-harbor-900 font-heading text-lg font-bold text-white">
              {step.n}
            </span>
            <div className="card flex-1">
              <h2 className="font-heading text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-ink-600">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link href="/find-my-application" className="btn-primary">Find My Application</Link>
        <Link href="/pricing" className="btn-outline">See Pricing</Link>
      </div>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { getFlatFeeCents } from '@/lib/engine/translation-package'
import { formatCents } from '@/lib/engine/pricing'

export const metadata = { title: 'FAQ' }

const generalFaqs = [
  {
    q: 'What is Smart USA Visa?',
    a: 'Smart USA Visa is a self-service platform that helps you prepare your own U.S. immigration paperwork through a guided questionnaire, a personalized document checklist, and clear filing instructions.',
  },
  {
    q: 'Is Smart USA Visa a law firm?',
    a: 'No. Smart USA Visa provides self-help document preparation and related services. It is not a law firm and does not provide legal advice or legal representation.',
  },
  {
    q: 'Can I save my progress and come back later?',
    a: 'Yes. Every answer autosaves as you go, and your dashboard picks up exactly where you left off, on any device.',
  },
  {
    q: 'Does Smart USA Visa file my application for me?',
    a: 'No. We prepare your forms, checklist, and filing instructions — you review, sign, and file with USCIS yourself, or with an attorney if you choose to hire one.',
  },
]

export default async function FaqPage() {
  const supabase = createClient()
  const flatFeeCents = await getFlatFeeCents(supabase)

  const translationFaqs = [
    {
      q: 'How much does document translation cost?',
      a: `Smart USA Visa offers an optional Certified Document Translation Package for ${formatCents(flatFeeCents)} per immigration application. The flat fee covers required supporting documents for that application that need English translation, subject to the translation service terms.`,
    },
    {
      q: 'Is the fee charged for each document?',
      a: `No. The translation package is a flat ${formatCents(flatFeeCents)} fee for the application, not a per-document charge.`,
    },
    {
      q: 'What documents can I have translated?',
      a: 'Depending on your application, these may include documents such as birth certificates, marriage certificates, divorce documents, civil records, police certificates, and other required supporting documents.',
    },
    {
      q: 'What if I already have my own English translation?',
      a: 'You do not need to purchase the Smart USA Visa translation package. Upload your existing English translation and any applicable translator certification through your document checklist.',
    },
    {
      q: 'Do I have to purchase translation services?',
      a: 'No. Translation services are optional. You may provide your own translation.',
    },
    {
      q: 'What language will my documents be translated into?',
      a: 'Documents purchased through the translation service will be translated into English.',
    },
    {
      q: 'Will translated documents appear in my application?',
      a: 'Yes. Once completed, translations automatically appear with the appropriate supporting document in your Smart USA Visa workspace and final application package.',
    },
    {
      q: 'Does the translation package cover more than one immigration application?',
      a: `No. The ${formatCents(flatFeeCents)} package applies to required translations associated with one Smart USA Visa immigration application. A separate application may require a separate translation package.`,
    },
    {
      q: 'Is Smart USA Visa a law firm?',
      a: 'No. Smart USA Visa provides self-help document preparation and related services. It is not a law firm and does not provide legal advice or legal representation.',
    },
  ]

  return (
    <div className="container-page max-w-3xl py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Frequently Asked Questions</h1>
      <p className="mt-3 text-ink-600">Answers about how Smart USA Visa works, pricing, and certified translation.</p>

      <section className="mt-10">
        <h2 className="text-xl font-bold">General</h2>
        <div className="mt-4 space-y-4">
          {generalFaqs.map((faq) => (
            <div key={faq.q} className="card">
              <h3 className="font-heading font-semibold">{faq.q}</h3>
              <p className="mt-2 text-sm text-ink-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="translation" className="mt-12 scroll-mt-24">
        <h2 className="text-xl font-bold">Certified Document Translation</h2>
        <div className="mt-4 space-y-4">
          {translationFaqs.map((faq) => (
            <div key={faq.q} className="card">
              <h3 className="font-heading font-semibold">{faq.q}</h3>
              <p className="mt-2 text-sm text-ink-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata = { title: 'Support' }

const faqs = [
  { q: 'I forgot to answer something — can I go back?', a: 'Yes. Every section of the questionnaire can be revisited from the section navigation, right up until you submit for review.' },
  { q: 'Will my progress be saved if I close the browser?', a: 'Yes — every answer autosaves as you go. Sign back in from any device and pick up exactly where you left off.' },
  { q: 'Can Smart USA Visa tell me if I will be approved?', a: 'No. We are not a law firm and cannot make eligibility determinations. Our smart checks flag things worth reviewing, but only USCIS or a licensed attorney can assess eligibility.' },
  { q: 'How do certified translations work?', a: 'Upload a foreign-language document, tell us the language, and we route it to a certified translator. You receive the original document, the translation, and a signed certification.' },
]

export default function SupportPage() {
  return (
    <div className="container-page py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Support</h1>
      <p className="mt-3 max-w-2xl text-ink-600">Answers to common questions, or send us a message directly.</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.q} className="card">
              <h3 className="font-heading font-semibold">{faq.q}</h3>
              <p className="mt-2 text-sm text-ink-600">{faq.a}</p>
            </div>
          ))}
        </div>
        <ContactForm />
      </div>
    </div>
  )
}

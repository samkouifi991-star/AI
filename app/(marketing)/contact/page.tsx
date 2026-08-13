import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata = { title: 'Contact' }

export default function ContactPage() {
  return (
    <div className="container-page max-w-2xl py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Contact Us</h1>
      <p className="mt-3 text-ink-600">
        Have a question about your application or Smart USA Visa in general? Send us a message
        and a real person will get back to you.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
      <p className="mt-8 text-xs text-ink-500">
        Smart USA Visa cannot provide legal advice about your specific situation. For legal
        questions, please consult a licensed immigration attorney.
      </p>
    </div>
  )
}

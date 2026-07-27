import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Business Pilot AI team.'
};

export default function ContactPage() {
  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <h1 className="text-3xl font-display font-semibold text-ink mb-2 text-center">Get in touch</h1>
      <p className="text-slate-500 text-center mb-8">Questions about a plan or setup? We'll reply within one business day.</p>
      <ContactForm />
    </div>
  );
}

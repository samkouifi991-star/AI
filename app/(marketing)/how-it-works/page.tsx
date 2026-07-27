import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Set up your AI receptionist in about 10–15 minutes — no technical knowledge required.'
};

const STEPS = [
  { title: 'Create your account', desc: 'Sign up with your email — takes under a minute.' },
  { title: 'Choose your business type', desc: 'Service business or restaurant — we tailor everything from here.' },
  { title: 'Add your business information', desc: 'Name, hours, and service area.' },
  { title: 'Upload your menu or services', desc: 'Import from a website, PDF, image, DOCX, or CSV, or enter it directly.' },
  { title: 'Choose a voice', desc: 'Browse and preview real voices, pick the one that fits.' },
  { title: 'Connect your calendar and payments', desc: 'One click each for Google Calendar and Stripe.' },
  { title: 'Test your assistant', desc: 'Try a real conversation before anyone else calls in.' },
  { title: 'Go live', desc: 'Your AI starts answering calls immediately.' }
];

export default function HowItWorksPage() {
  return (
    <div>
      <section className="bg-slate-50 py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-4xl font-display font-semibold text-ink mb-3">Live in about 15 minutes</h1>
          <p className="text-slate-500">No developer, no technical setup — just answer a few questions about your business.</p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-16">
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-medium">{i + 1}</div>
                {i < STEPS.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="pb-6">
                <div className="font-medium text-ink">{s.title}</div>
                <div className="text-sm text-slate-500 mt-1">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-4">
          <Link href="/signup" className="btn-primary text-base px-6 py-3">Start Free</Link>
        </div>
      </section>
    </div>
  );
}

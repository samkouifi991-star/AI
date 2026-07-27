import type { Metadata } from 'next';
import Link from 'next/link';
import HeroDemo from '@/components/HeroDemo';

export const metadata: Metadata = {
  title: 'Business Pilot AI — Your business answers, sells, books, and takes payments',
  description:
    'Business Pilot AI answers your calls, books appointments, takes restaurant orders, and collects payments — in multiple languages, day or night.'
};

const CAPABILITIES = [
  { title: 'Answers every call', desc: 'A natural-sounding AI receptionist, available 24/7 — no more missed calls.' },
  { title: 'Books appointments', desc: 'Checks your real calendar availability and schedules customers automatically.' },
  { title: 'Creates estimates', desc: 'Quotes jobs using your own pricing rules — distance, ZIP code, or service-based.' },
  { title: 'Takes restaurant orders', desc: 'Full menu ordering with sizes, modifiers, and add-ons, for pickup or delivery.' },
  { title: 'Answers from your knowledge', desc: 'Upload your menu, FAQs, or policies — it answers naturally, not from a script.' },
  { title: 'Collects payments', desc: 'Sends a secure payment link by text and confirms the booking once it clears.' },
  { title: 'Sends text confirmations', desc: 'Appointment reminders, order confirmations, and receipts, automatically.' },
  { title: 'Speaks multiple languages', desc: 'Detects the caller\'s language and can switch automatically, with permission.' },
  { title: 'Transfers to your team', desc: 'Hands off urgent or complex calls to a real person, instantly.' }
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <h1 className="text-4xl md:text-6xl font-display font-semibold tracking-tight leading-[1.1] text-ink">
            Your business answers, sells, books, and takes payments — even when you cannot.
          </h1>
          <p className="text-lg text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            Business Pilot AI is a virtual receptionist for service businesses and restaurants — it answers your phone,
            captures leads, books appointments or takes orders, and gets you paid, without you lifting a finger.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <HeroDemo />
      </section>

      <section className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-display font-semibold text-ink">Everything your front office needs</h2>
            <p className="text-slate-500 mt-3">One AI, every job your phone should already be doing.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="card">
                <div className="font-medium text-ink mb-1.5">{c.title}</div>
                <div className="text-sm text-slate-500 leading-relaxed">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-display font-semibold text-ink">One dashboard, everything visible</h2>
            <p className="text-slate-500 mt-3">Calls, leads, appointments, orders, and payments — all in one place.</p>
          </div>
          <div className="card p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Calls answered', value: '42' },
                { label: 'New leads', value: '18' },
                { label: 'Appointments booked', value: '11' },
                { label: 'Payments collected', value: '$3,240' }
              ].map((s) => (
                <div key={s.label} className="border border-slate-100 rounded-lg p-4">
                  <div className="text-2xl font-display font-semibold text-ink">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { text: 'Marcus Webb — call completed, estimate visit booked', tone: 'badge-success', label: 'Booked' },
                { text: 'Order #2041 — paid, sent to kitchen', tone: 'badge-success', label: 'Paid' },
                { text: 'Call transferred to owner — urgent request', tone: 'badge-warning', label: 'Transferred' }
              ].map((a) => (
                <div key={a.text} className="py-3 flex items-center justify-between">
                  <span className="text-sm text-slate-700">{a.text}</span>
                  <span className={a.tone}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-display font-semibold text-ink mb-4">A voice that sounds like a real person</h2>
          <p className="text-slate-500 max-w-xl mx-auto mb-8">
            Choose from a library of natural, human-sounding voices — professional, friendly, calm, or energetic — preview
            them, and pick the one that fits your business.
          </p>
          <div className="flex items-center justify-center gap-1 h-10">
            {[40, 70, 30, 90, 50, 65, 35].map((h, i) => (
              <span key={i} className="w-1.5 bg-brand-500 rounded-full animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-slate-400 mb-6">Works with the tools you already use</p>
          <div className="flex items-center justify-center gap-8 flex-wrap text-slate-400 font-medium text-sm">
            <span>Google Calendar</span>
            <span>Stripe</span>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-display font-semibold text-white mb-6">Built to keep your data yours</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-left">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-white font-medium mb-1.5">Your data, isolated</div>
              <div className="text-sm text-slate-400">Every business&apos;s calls, leads, and records are fully separated — never visible to anyone else.</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-white font-medium mb-1.5">Encrypted credentials</div>
              <div className="text-sm text-slate-400">Any account you connect is encrypted at rest and never shown again after saving.</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-white font-medium mb-1.5">Verified payments</div>
              <div className="text-sm text-slate-400">Handled by Stripe — an order or appointment is never marked paid until Stripe confirms it.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-display font-semibold text-ink mb-4">Ready to stop missing calls?</h2>
        <p className="text-slate-500 mb-8">Set up your AI receptionist in about 10–15 minutes.</p>
        <Link href="/signup" className="btn-primary text-base px-6 py-3">Start Free</Link>
      </section>
    </>
  );
}

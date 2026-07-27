'use client';

import { useState } from 'react';

const FAQS = [
  { q: 'How realistic does the AI sound?', a: "It uses natural, human-sounding voices — you browse and preview real options before choosing one, so you know exactly how it'll sound before you go live." },
  { q: 'Can it use my current business number?', a: 'Yes. Keep advertising your existing number and forward calls to your AI — we give you carrier-specific forwarding instructions, with support for forwarding all calls, only missed calls, or only when busy.' },
  { q: 'Can I buy a number through Business Pilot AI?', a: 'Yes. Search by area code or region, buy a number, and everything — call handling, SMS, your assistant — is configured automatically.' },
  { q: 'Does it work for restaurants?', a: 'Yes. Upload your menu (from a website, PDF, photo, DOCX, or spreadsheet), and your AI can answer menu questions, take full orders with modifiers and add-ons, and handle pickup or delivery.' },
  { q: 'Can it book appointments?', a: 'Yes, for service businesses. It checks your real, connected Google Calendar availability before offering times.' },
  { q: 'Can it take payments?', a: "Yes, through Stripe. It sends a secure payment link by text, and an order or appointment is only marked paid after Stripe actually confirms the payment — never before." },
  { q: 'Can it send text messages?', a: "Yes — confirmations, reminders, and payment links. Note that SMS volume can be affected by carrier messaging-registration requirements in some regions; we'll show you the exact status if that applies to your account." },
  { q: 'Which languages are supported?', a: "Multiple languages, with automatic detection available. If enabled, it will ask for your customer's permission before switching languages mid-call, rather than switching without asking." },
  { q: 'How does it learn my business?', a: 'You upload your website, menu, FAQs, policies, or any document — it answers naturally from that information. You don\'t need to write out every possible question and answer in advance.' },
  { q: 'What happens when it does not know an answer?', a: "It says so honestly and can transfer the call to a real person, rather than guessing or making something up." },
  { q: 'Can it transfer calls?', a: 'Yes — to any number you configure, based on rules you set (a specific department, after-hours contact, or simply "if the customer asks for a person").' },
  { q: 'Is customer data secure?', a: "Every business's data is isolated at the database level — no business can see another's calls, orders, or records. Any account credentials you connect are encrypted at rest." },
  { q: 'Can I test it before going live?', a: 'Yes. A guided test step is part of setup, and a full Test Center lets you check calls, SMS, and your connections anytime after.' },
  { q: 'Can I cancel anytime?', a: 'Yes — subscriptions can be cancelled at any time from your account settings, or by contacting support.' },
  { q: 'What happens to my phone number if I cancel?', a: "If you forwarded your own existing number, nothing changes — it's yours and always was. If you bought or imported a number through us, you can request to port it out to another provider before cancelling." }
];

export default function FaqAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <div className="space-y-3">
      {FAQS.map((f, i) => (
        <div key={f.q} className="card p-0 overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
            aria-expanded={open === i}
          >
            <span className="font-medium text-ink text-sm">{f.q}</span>
            <span className={`text-slate-400 transition-transform shrink-0 ${open === i ? 'rotate-180' : ''}`}>▾</span>
          </button>
          <div className={`grid transition-all duration-200 ${open === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <p className="px-5 pb-4 text-sm text-slate-500 leading-relaxed">{f.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 29,
    yearly: 290,
    tagline: 'For solo businesses testing AI call handling.',
    minutes: 100,
    features: ['100 AI call minutes included', 'Lead capture', 'Call summaries and transcripts', 'Basic knowledge base', '1 phone number']
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 79,
    yearly: 790,
    tagline: 'For growing businesses that need appointments, orders, payments, and automation.',
    minutes: 400,
    features: ['400 AI call minutes included', 'Everything in Starter', 'Appointment booking', 'Restaurant ordering', 'SMS confirmations', 'Google Calendar sync']
  },
  {
    key: 'pro',
    name: 'Pro',
    monthly: 149,
    yearly: 1490,
    tagline: 'For high-volume businesses, advanced routing, multiple numbers, and deeper automation.',
    minutes: 1000,
    features: ['1,000 AI call minutes included', 'Everything in Growth', 'Advanced call routing', 'Multiple phone numbers', 'Invoicing and online payments', 'Priority support']
  }
];

export default function PricingCards() {
  const [yearly, setYearly] = useState(false);

  return (
    <div>
      <div className="flex justify-center mb-10">
        <div className="bg-slate-100 rounded-full p-1 inline-flex gap-1">
          <button onClick={() => setYearly(false)} className={`px-4 py-1.5 rounded-full text-sm font-medium ${!yearly ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}>Monthly</button>
          <button onClick={() => setYearly(true)} className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 ${yearly ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}>
            Yearly <span className="badge-success">save ~17%</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PLANS.map((p) => {
          const featured = p.key === 'growth';
          const price = yearly ? Math.round(p.yearly / 12) : p.monthly;
          return (
            <div key={p.key} className={`card p-7 flex flex-col ${featured ? 'border-2 border-brand-600' : ''}`}>
              {featured && <span className="badge-slate w-fit mb-3">Most popular</span>}
              <div className="text-lg font-display font-semibold text-ink">{p.name}</div>
              <p className="text-sm text-slate-500 mt-1 mb-3">{p.tagline}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-display font-semibold text-ink">${price}</span>
                <span className="text-sm text-slate-500">/month</span>
              </div>
              {yearly && <div className="text-xs text-slate-400 mt-1">${p.yearly} billed yearly</div>}
              <ul className="space-y-2 mt-6 mb-8 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-success mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={featured ? 'btn-primary text-center' : 'btn-secondary text-center'}>Start Free</Link>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-400 mt-8 max-w-2xl mx-auto">
        Each plan includes a set number of AI call minutes per month. Additional call minutes, SMS messages, and phone
        number rental beyond your plan's included usage are billed at published overage rates — usage is never
        unlimited on any plan.
      </p>
    </div>
  );
}

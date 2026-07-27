'use client';

import { useState } from 'react';
import Link from 'next/link';

const SCRIPTS = {
  service: [
    { who: 'ai', text: "Thanks for calling Summit Fence Co. — how can I help?" },
    { who: 'customer', text: "I need about 200 feet of vinyl privacy fencing installed." },
    { who: 'ai', text: "Happy to help. Can I get the property address and whether you'll need any gates?" },
    { who: 'ai', text: "Based on that, you're looking at roughly $6,800–$8,200 — I have Thursday at 10am or Friday at 2pm for a free on-site visit." },
    { who: 'customer', text: "Thursday works." },
    { who: 'ai', text: "You're booked — I just texted you a confirmation." }
  ],
  restaurant: [
    { who: 'ai', text: "Thanks for calling Tony's Pizzeria — pickup or delivery today?" },
    { who: 'customer', text: "Delivery, please. One large pepperoni and an order of garlic knots." },
    { who: 'ai', text: "Got it. Anything to drink, and is your delivery address still on file?" },
    { who: 'customer', text: "Two Cokes, and yes, same address." },
    { who: 'ai', text: "Your total is $34.50 — I've texted you a secure payment link. Your order goes to the kitchen as soon as that's paid." }
  ]
};

export default function HeroDemo() {
  const [businessType, setBusinessType] = useState<'service' | 'restaurant'>('service');
  const [step, setStep] = useState(1);

  const script = SCRIPTS[businessType];

  function switchType(type: 'service' | 'restaurant') {
    setBusinessType(type);
    setStep(1);
  }

  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="bg-slate-100 rounded-full p-1 inline-flex gap-1">
          <button
            onClick={() => switchType('service')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${businessType === 'service' ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}
          >
            Service Business
          </button>
          <button
            onClick={() => switchType('restaurant')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${businessType === 'restaurant' ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}
          >
            Restaurant
          </button>
        </div>
      </div>

      <div className="card max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Live call — {businessType === 'service' ? 'Summit Fence Co.' : "Tony's Pizzeria"}
          </div>
          <span className="badge-success">AI answered</span>
        </div>
        <div className="space-y-3 min-h-[240px]">
          {script.slice(0, step).map((line, i) => (
            <div key={i} className={`flex ${line.who === 'ai' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${line.who === 'ai' ? 'bg-brand-50 text-brand-700 rounded-tl-sm' : 'bg-slate-900 text-white rounded-tr-sm'}`}>
                {line.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center mt-4">
          {step < script.length ? (
            <button className="btn-secondary text-sm" onClick={() => setStep((s) => s + 1)}>Continue the call</button>
          ) : (
            <button className="text-sm text-slate-500 underline" onClick={() => setStep(1)}>Replay</button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mt-8">
        <Link href="/signup" className="btn-primary">Start Free</Link>
        <Link href="/how-it-works" className="btn-secondary">See How It Works</Link>
      </div>
    </div>
  );
}

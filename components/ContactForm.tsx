'use client';

import { useState } from 'react';

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus('error');
      setError(data.error);
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="card p-8 text-center">
        <div className="text-success text-2xl mb-2">✓</div>
        <div className="font-medium text-ink">Message sent</div>
        <div className="text-sm text-slate-500 mt-1">We&apos;ll get back to you soon.</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" type="email" className="input" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </div>
      <div>
        <label htmlFor="message" className="label">Message</label>
        <textarea id="message" className="input" rows={4} required value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
      </div>
      <button className="btn-primary w-full" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

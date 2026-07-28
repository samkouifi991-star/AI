'use client';

import { useEffect, useState } from 'react';
import PhoneSubNav from '../PhoneSubNav';

const MODES = [
  ['ai_answers_all', 'AI answers all calls'],
  ['ai_after_no_answer', 'AI answers only after no answer'],
  ['ai_after_hours', 'AI answers after hours only'],
  ['ring_business_first', 'Ring business first, then AI'],
  ['ring_ai_first_then_transfer', 'Ring AI first, then transfer'],
  ['simultaneous_ring', 'Simultaneous ring (where supported)']
];

export default function RoutingPage() {
  const [rules, setRules] = useState<any>({
    mode: 'ai_answers_all',
    ring_seconds_before_ai: 15,
    fallback_transfer_number: '',
    emergency_transfer_number: '',
    transfer_on_low_confidence: true,
    transfer_on_customer_request: true,
    voicemail_fallback_enabled: true
  });
  const [destinations, setDestinations] = useState<{ label: string; phoneNumber: string; department: string; isEmergencyContact: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/phone/routing');
      const data = await res.json();
      if (data.rules) setRules(data.rules);
      if (data.destinations) {
        setDestinations(
          data.destinations.map((d: any) => ({ label: d.label, phoneNumber: d.phone_number, department: d.department ?? '', isEmergencyContact: d.is_emergency_contact }))
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch('/api/phone/routing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: rules.mode,
        ringSecondsBeforeAi: rules.ring_seconds_before_ai,
        fallbackTransferNumber: rules.fallback_transfer_number,
        emergencyTransferNumber: rules.emergency_transfer_number,
        transferOnLowConfidence: rules.transfer_on_low_confidence,
        transferOnCustomerRequest: rules.transfer_on_customer_request,
        voicemailFallbackEnabled: rules.voicemail_fallback_enabled,
        destinations
      })
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  function addDestination() {
    setDestinations((d) => [...d, { label: '', phoneNumber: '', department: '', isEmergencyContact: false }]);
  }

  if (loading) return <div className="card max-w-2xl">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Call routing</h1>
        <p className="text-slate-600 text-sm">Decide how incoming calls are handled, and where they go if the AI can&apos;t help.</p>
      </div>

      <PhoneSubNav />

      {saved && <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">Saved.</div>}

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold mb-1">Routing mode</h2>
        {MODES.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" checked={rules.mode === key} onChange={() => setRules((r: any) => ({ ...r, mode: key }))} />
            {label}
          </label>
        ))}
        {(rules.mode === 'ring_business_first' || rules.mode === 'ring_ai_first_then_transfer') && (
          <div className="pl-6">
            <label className="label">Ring seconds before switching</label>
            <input className="input max-w-[120px]" type="number" value={rules.ring_seconds_before_ai} onChange={(e) => setRules((r: any) => ({ ...r, ring_seconds_before_ai: Number(e.target.value) }))} />
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold mb-1">Fallback and escalation</h2>
        <div>
          <label className="label">Fallback transfer number</label>
          <input className="input" value={rules.fallback_transfer_number ?? ''} onChange={(e) => setRules((r: any) => ({ ...r, fallback_transfer_number: e.target.value }))} />
        </div>
        <div>
          <label className="label">Emergency transfer number</label>
          <input className="input" value={rules.emergency_transfer_number ?? ''} onChange={(e) => setRules((r: any) => ({ ...r, emergency_transfer_number: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rules.transfer_on_low_confidence} onChange={(e) => setRules((r: any) => ({ ...r, transfer_on_low_confidence: e.target.checked }))} />
          Transfer if AI confidence is low
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rules.transfer_on_customer_request} onChange={(e) => setRules((r: any) => ({ ...r, transfer_on_customer_request: e.target.checked }))} />
          Transfer if customer requests a human
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rules.voicemail_fallback_enabled} onChange={(e) => setRules((r: any) => ({ ...r, voicemail_fallback_enabled: e.target.checked }))} />
          Fall back to voicemail if no one answers
        </label>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Transfer destinations</h2>
          <button className="btn-secondary text-xs" onClick={addDestination}>+ Add destination</button>
        </div>
        {destinations.map((d, i) => (
          <div key={i} className="grid sm:grid-cols-4 gap-2 items-center">
            <input className="input" placeholder="Label (Owner cell, Kitchen...)" value={d.label} onChange={(e) => { const next = [...destinations]; next[i] = { ...d, label: e.target.value }; setDestinations(next); }} />
            <input className="input" placeholder="Phone number" value={d.phoneNumber} onChange={(e) => { const next = [...destinations]; next[i] = { ...d, phoneNumber: e.target.value }; setDestinations(next); }} />
            <input className="input" placeholder="Department (optional)" value={d.department} onChange={(e) => { const next = [...destinations]; next[i] = { ...d, department: e.target.value }; setDestinations(next); }} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={d.isEmergencyContact} onChange={(e) => { const next = [...destinations]; next[i] = { ...d, isEmergencyContact: e.target.checked }; setDestinations(next); }} />
              Emergency contact
            </label>
          </div>
        ))}
      </section>

      <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save routing settings'}</button>
    </div>
  );
}

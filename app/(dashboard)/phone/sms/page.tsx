'use client';

import { useEffect, useState } from 'react';
import PhoneSubNav from '../PhoneSubNav';

const DEFAULTS = {
  paymentLinkMessages: true,
  appointmentConfirmations: true,
  orderConfirmations: true,
  missedCallFollowup: false,
  optOutText: 'Reply STOP to unsubscribe.',
  businessDisplayName: '',
  defaultSenderNumber: '',
  messagingRegistrationStatus: 'unregistered'
};

export default function SmsSettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/phone/sms-settings');
      const data = await res.json();
      if (data.settings) {
        setSettings({
          paymentLinkMessages: data.settings.payment_link_messages,
          appointmentConfirmations: data.settings.appointment_confirmations,
          orderConfirmations: data.settings.order_confirmations,
          missedCallFollowup: data.settings.missed_call_followup,
          optOutText: data.settings.opt_out_text,
          businessDisplayName: data.settings.business_display_name ?? '',
          defaultSenderNumber: data.settings.default_sender_number ?? '',
          messagingRegistrationStatus: data.settings.messaging_registration_status
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/phone/sms-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSaving(false);
    setSaved(true);
  }

  async function sendTest() {
    setTestResult(null);
    const res = await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType: 'sms', phoneNumber: testNumber })
    });
    const data = await res.json();
    setTestResult(data.status === 'pass' ? 'Test SMS sent successfully.' : `Failed: ${data.details?.error ?? 'unknown error'}`);
  }

  if (loading) return <div className="card max-w-2xl">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">SMS settings</h1>
        <p className="text-slate-600 text-sm">What your AI texts customers, and when.</p>
      </div>

      <PhoneSubNav />

      {settings.messagingRegistrationStatus !== 'registered' && (
        <div className="text-sm text-warning bg-amber-50 rounded-lg px-3 py-2">
          Messaging registration status: <strong>{settings.messagingRegistrationStatus}</strong>. Twilio requires A2P 10DLC
          registration for higher-volume SMS in the US — until that&apos;s complete, messages may be rate-limited or filtered by
          carriers. This is a Twilio account-level requirement, not something this app can complete on your behalf.
        </div>
      )}

      {saved && <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">Saved.</div>}

      <section className="card space-y-2">
        {[
          ['paymentLinkMessages', 'Payment-link messages'],
          ['appointmentConfirmations', 'Appointment confirmations'],
          ['orderConfirmations', 'Order confirmations'],
          ['missedCallFollowup', 'Missed-call follow-ups']
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={(settings as any)[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))} />
            {label}
          </label>
        ))}
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label">Business name shown in texts</label>
          <input className="input" value={settings.businessDisplayName} onChange={(e) => setSettings((s) => ({ ...s, businessDisplayName: e.target.value }))} />
        </div>
        <div>
          <label className="label">Opt-out text</label>
          <input className="input" value={settings.optOutText} onChange={(e) => setSettings((s) => ({ ...s, optOutText: e.target.value }))} />
        </div>
      </section>

      <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save SMS settings'}</button>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Send a test SMS</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="Your phone number" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} />
          <button className="btn-secondary" onClick={sendTest}>Send test</button>
        </div>
        {testResult && <p className="text-sm text-slate-600">{testResult}</p>}
      </section>
    </div>
  );
}

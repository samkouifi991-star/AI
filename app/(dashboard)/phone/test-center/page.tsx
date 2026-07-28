'use client';

import { useEffect, useState } from 'react';
import PhoneSubNav from '../PhoneSubNav';

const TESTS = [
  { type: 'forwarding_check', label: 'Test inbound number', needsPhone: false },
  { type: 'inbound_call', label: 'Call my phone (inbound check)', needsPhone: false },
  { type: 'transfer', label: 'Test transfer', needsPhone: false },
  { type: 'sms', label: 'Test SMS', needsPhone: true },
  { type: 'webhook', label: 'Test webhook', needsPhone: false },
  { type: 'assistant_tools', label: 'Test assistant tools', needsPhone: false }
];

export default function TestCenterPage() {
  const [log, setLog] = useState<any[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');

  async function loadLog() {
    const res = await fetch('/api/phone/test');
    const data = await res.json();
    setLog(data.results ?? []);
  }

  useEffect(() => {
    loadLog();
  }, []);

  async function run(testType: string) {
    setRunning(testType);
    await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType, phoneNumber })
    });
    setRunning(null);
    await loadLog();
  }

  const statusTone: Record<string, string> = { pass: 'badge-success', fail: 'badge-danger', pending: 'badge-warning' };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Test center</h1>
        <p className="text-slate-600 text-sm">
          Verify your phone setup before going live. Some tests (marked &quot;pending&quot; below) require an actual phone call — no
          server-side simulation can substitute for that, so those give you clear instructions instead of a fake pass.
        </p>
      </div>

      <PhoneSubNav />

      <section className="card space-y-3">
        <input className="input max-w-xs" placeholder="Your phone number (for SMS test)" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        <div className="grid sm:grid-cols-2 gap-2">
          {TESTS.map((t) => (
            <button key={t.type} className="btn-secondary text-sm" onClick={() => run(t.type)} disabled={running === t.type}>
              {running === t.type ? 'Running…' : t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Live log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">No tests run yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {log.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium capitalize">{r.test_type.replace(/_/g, ' ')}</span>
                  <span className={statusTone[r.status] ?? 'badge-warning'}>{r.status}</span>
                </div>
                <div className="text-xs text-slate-500">{new Date(r.run_at).toLocaleString()}</div>
                {r.details?.instructions && <div className="text-xs text-slate-600 mt-1">{r.details.instructions}</div>}
                {r.details?.note && <div className="text-xs text-slate-600 mt-1">{r.details.note}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

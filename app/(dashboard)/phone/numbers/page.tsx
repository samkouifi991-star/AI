'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import PhoneSubNav from '../PhoneSubNav';

type Tab = 'forward' | 'buy' | 'import';

export default function PhoneNumbersPage() {
  const supabase = supabaseBrowser();
  const [tab, setTab] = useState<Tab>('forward');
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Option A state
  const [carrierCodes, setCarrierCodes] = useState<any[]>([]);
  const [aiDestination, setAiDestination] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState({
    existingNumber: '',
    carrier: 'other',
    forwardAllCalls: false,
    forwardMissedCalls: true,
    forwardWhenBusy: true,
    forwardAfterHours: false,
    fallbackTransferNumber: ''
  });
  const [savingForwarding, setSavingForwarding] = useState(false);
  const [forwardingSetup, setForwardingSetup] = useState<any>(null);
  const [testingForwarding, setTestingForwarding] = useState(false);
  const [forwardTestMessage, setForwardTestMessage] = useState<string | null>(null);
  const [showDisconnectInstructions, setShowDisconnectInstructions] = useState(false);
  const [disablingForwarding, setDisablingForwarding] = useState(false);

  // Option B state
  const [searchParams, setSearchParams] = useState({ areaCode: '', numberType: 'local' as 'local' | 'toll_free' });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Option C state
  const [twilioCreds, setTwilioCreds] = useState({ accountSid: '', authToken: '' });
  const [twilioConnection, setTwilioConnection] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [byoNumbers, setByoNumbers] = useState<any[]>([]);
  const [importing, setImporting] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function loadNumbers() {
    const res = await fetch('/api/phone/numbers');
    const data = await res.json();
    setNumbers(data.numbers ?? []);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      await loadNumbers();
      const fRes = await fetch('/api/phone/forwarding');
      const fData = await fRes.json();
      setCarrierCodes(fData.carrierCodes ?? []);
      setAiDestination(fData.aiDestinationNumber);
      if (fData.setup) {
        setForwardingSetup(fData.setup);
        setForwarding({
          existingNumber: fData.setup.existing_number ?? '',
          carrier: fData.setup.carrier ?? 'other',
          forwardAllCalls: fData.setup.forward_all_calls,
          forwardMissedCalls: fData.setup.forward_missed_calls,
          forwardWhenBusy: fData.setup.forward_when_busy,
          forwardAfterHours: fData.setup.forward_after_hours,
          fallbackTransferNumber: fData.setup.fallback_transfer_number ?? ''
        });
      }
      const tRes = await fetch('/api/phone/twilio-connect');
      const tData = await tRes.json();
      setTwilioConnection(tData.connection);
      setLoading(false);
    }
    load();
  }, []);

  async function saveForwarding() {
    setSavingForwarding(true);
    setActionError(null);
    const res = await fetch('/api/phone/forwarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwarding)
    });
    setSavingForwarding(false);
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error);
    } else {
      setActionSuccess('Forwarding setup saved.');
    }
  }

  async function testForwarding() {
    setActionError(null);
    setForwardTestMessage(null);
    const res = await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType: 'forwarding_check' })
    });
    const data = await res.json();
    setForwardTestMessage(data.details?.instructions ?? 'Now place that test call, then click "Check now" once it rings your AI.');
  }

  // Real verification, not a self-report: checks whether a call actually
  // arrived at this business's AI number (see /api/phone/test
  // forwarding_verify) rather than just trusting that the customer clicked
  // a button.
  async function checkForwardingVerified() {
    setTestingForwarding(true);
    const res = await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType: 'forwarding_verify' })
    });
    const data = await res.json();
    setTestingForwarding(false);
    if (data.status === 'pass') {
      setForwardTestMessage('Verified — a call reached your AI number. Forwarding is working.');
      const fRes = await fetch('/api/phone/forwarding');
      const fData = await fRes.json();
      setForwardingSetup(fData.setup ?? null);
    } else {
      setForwardTestMessage(data.details?.note ?? "We haven't seen the test call yet.");
    }
  }

  async function confirmForwardingDisabled() {
    if (!window.confirm('Confirm forwarding is off? New calls will stop reaching your AI employee until you turn it back on.')) return;
    setDisablingForwarding(true);
    const res = await fetch('/api/phone/forwarding/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true })
    });
    setDisablingForwarding(false);
    if (res.ok) {
      setActionSuccess('Forwarding marked as disabled. Your AI number is still active — release it separately below if you want to stop that too.');
      const fRes = await fetch('/api/phone/forwarding');
      const fData = await fRes.json();
      setForwardingSetup(fData.setup ?? null);
    }
  }

  async function searchNumbers() {
    setSearching(true);
    setActionError(null);
    const qs = new URLSearchParams({
      areaCode: searchParams.areaCode,
      numberType: searchParams.numberType,
      voice: 'true'
    });
    const res = await fetch(`/api/phone/search?${qs}`);
    const data = await res.json();
    setSearching(false);
    if (!res.ok) return setActionError(data.error);
    setSearchResults(data.results ?? []);
  }

  async function buyNumber(phoneNumber: string, monthlyPrice: number | null) {
    const priceLabel = monthlyPrice ? `$${monthlyPrice}/month` : 'a recurring monthly fee';
    if (!window.confirm(`This purchases ${phoneNumber} through Twilio for real — ${priceLabel}, charged to your connected Twilio account. Continue?`)) {
      return;
    }
    setPurchasing(phoneNumber);
    setActionError(null);
    const res = await fetch('/api/phone/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, numberType: searchParams.numberType, monthlyPrice })
    });
    const data = await res.json();
    setPurchasing(null);
    if (!res.ok) {
      setActionError(`${data.error}${data.failedStep ? ` (failed at: ${data.failedStep})` : ''}`);
      return;
    }
    setActionSuccess('Number purchased and provisioned — it will now ring your AI.');
    await loadNumbers();
  }

  async function connectTwilio() {
    setConnecting(true);
    setActionError(null);
    const res = await fetch('/api/phone/twilio-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(twilioCreds)
    });
    const data = await res.json();
    setConnecting(false);
    if (!res.ok) return setActionError(data.error);
    setTwilioConnection({ status: 'connected' });
    setTwilioCreds({ accountSid: '', authToken: '' });
    const numRes = await fetch('/api/phone/twilio-connect/numbers');
    const numData = await numRes.json();
    setByoNumbers(numData.numbers ?? []);
  }

  async function importByoNumber(sid: string, phoneNumber: string) {
    setImporting(sid);
    setActionError(null);
    const res = await fetch('/api/phone/twilio-connect/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twilioSid: sid, phoneNumber })
    });
    const data = await res.json();
    setImporting(null);
    if (!res.ok) {
      setActionError(`${data.error}${data.failedStep ? ` (failed at: ${data.failedStep})` : ''}`);
      return;
    }
    setActionSuccess('Number imported and attached to your assistant.');
    await loadNumbers();
  }

  async function renameNumber(id: string, currentName: string) {
    const name = prompt('Number label', currentName);
    if (name === null) return;
    await fetch('/api/phone/numbers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, friendlyName: name }) });
    await loadNumbers();
  }

  async function releaseNumberConfirmed(id: string, phoneNumber: string) {
    if (!confirm(`Release ${phoneNumber}? This cannot be undone — the number will stop working immediately.`)) return;
    const res = await fetch('/api/phone/numbers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirm: true }) });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    setActionSuccess('Number released.');
    await loadNumbers();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Phone numbers</h1>
        <p className="text-slate-600 text-sm">Keep your current number, buy a new one, or bring your own Twilio account.</p>
      </div>

      <PhoneSubNav />

      {actionError && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{actionError}</div>}
      {actionSuccess && <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">{actionSuccess}</div>}

      <div className="flex gap-2">
        <button className={tab === 'forward' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('forward')}>Use existing number</button>
        <button className={tab === 'buy' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('buy')}>Buy a new number</button>
        <button className={tab === 'import' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('import')}>Import from Twilio</button>
      </div>

      {tab === 'forward' && (
        <section className="card space-y-4">
          <h2 className="font-display text-lg font-semibold">Forward your existing number</h2>
          <p className="text-sm text-slate-600">
            Keep advertising <strong>{forwarding.existingNumber || 'your current number'}</strong> — just forward calls to your
            AI destination number: <span className="font-mono">{aiDestination ?? 'assigned once you save'}</span>
          </p>

          <div>
            <label className="label">Your existing business number</label>
            <input className="input" value={forwarding.existingNumber} onChange={(e) => setForwarding((f) => ({ ...f, existingNumber: e.target.value }))} />
          </div>

          <div>
            <label className="label">Carrier</label>
            <select className="input" value={forwarding.carrier} onChange={(e) => setForwarding((f) => ({ ...f, carrier: e.target.value }))}>
              {carrierCodes.map((c) => <option key={c.carrier} value={c.carrier}>{c.display_name}</option>)}
            </select>
          </div>

          {carrierCodes.find((c) => c.carrier === forwarding.carrier) && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              {(() => {
                const c = carrierCodes.find((c) => c.carrier === forwarding.carrier);
                const dest = aiDestination ?? '[your AI number]';
                return (
                  <>
                    {c.forward_all_code && <div>Forward all calls: <span className="font-mono">{c.forward_all_code.replace('{number}', dest)}</span></div>}
                    {c.forward_busy_code && <div>Forward when busy: <span className="font-mono">{c.forward_busy_code.replace('{number}', dest)}</span></div>}
                    {c.forward_no_answer_code && <div>Forward on no answer: <span className="font-mono">{c.forward_no_answer_code.replace('{number}', dest)}</span></div>}
                    {c.notes && <p className="text-xs text-slate-500 mt-1">{c.notes}</p>}
                  </>
                );
              })()}
            </div>
          )}

          <div className="space-y-2">
            {[
              ['forwardAllCalls', 'Forward all calls'],
              ['forwardMissedCalls', 'Forward only missed calls'],
              ['forwardWhenBusy', 'Forward when busy'],
              ['forwardAfterHours', 'Forward after hours only']
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(forwarding as any)[key]} onChange={(e) => setForwarding((f) => ({ ...f, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>

          <div>
            <label className="label">Fallback transfer number</label>
            <input className="input" value={forwarding.fallbackTransferNumber} onChange={(e) => setForwarding((f) => ({ ...f, fallbackTransferNumber: e.target.value }))} />
          </div>

          <div className="flex gap-3">
            <button className="btn-primary" onClick={saveForwarding} disabled={savingForwarding}>{savingForwarding ? 'Saving…' : 'Save forwarding setup'}</button>
            <button className="btn-secondary" onClick={testForwarding} disabled={testingForwarding}>I&apos;ve set up forwarding — test it</button>
            <button className="btn-secondary" onClick={checkForwardingVerified} disabled={testingForwarding}>{testingForwarding ? 'Checking…' : 'Check now'}</button>
          </div>
          {forwardTestMessage && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{forwardTestMessage}</div>}
          {forwardingSetup?.last_test_status === 'pass' && (
            <span className="badge-success inline-block">Verified {forwardingSetup.last_tested_at ? new Date(forwardingSetup.last_tested_at).toLocaleDateString() : ''}</span>
          )}

          {forwardingSetup && (
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <h3 className="font-display font-semibold text-sm">Stop forwarding calls</h3>
              <p className="text-xs text-slate-500">
                You can disable forwarding whenever you want — your original business number will then ring normally
                again. Your AI number stays active unless you separately disconnect or cancel it. Disabling forwarding
                does not automatically release your AI number or stop number-rental charges.
              </p>
              <span className={forwardingSetup.forwarding_active === false ? 'badge-warning inline-block' : 'badge-success inline-block'}>
                {forwardingSetup.forwarding_active === false ? 'Forwarding disabled' : 'Forwarding active'}
              </span>
              <div>
                <button className="btn-secondary text-xs" onClick={() => setShowDisconnectInstructions((v) => !v)}>
                  {showDisconnectInstructions ? 'Hide disconnect instructions' : 'Show disconnect instructions'}
                </button>
              </div>
              {showDisconnectInstructions &&
                (() => {
                  const c = carrierCodes.find((c) => c.carrier === forwarding.carrier);
                  return (
                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-2">
                      {c ? (
                        <>
                          {c.forward_all_cancel_code && <div>Cancel all-call forwarding: <span className="font-mono">{c.forward_all_cancel_code}</span>, then press Call.</div>}
                          {c.forward_no_answer_cancel_code && <div>Cancel no-answer forwarding: <span className="font-mono">{c.forward_no_answer_cancel_code}</span>, then press Call.</div>}
                          {c.forward_busy_cancel_code && <div>Cancel busy forwarding: <span className="font-mono">{c.forward_busy_cancel_code}</span>, then press Call.</div>}
                          {!c.forward_all_cancel_code && !c.forward_no_answer_cancel_code && (
                            <div className="text-warning">We don&apos;t have a published cancellation code for this carrier — contact them directly.</div>
                          )}
                          <p className="text-xs text-slate-500">Confirm it worked by calling your business number and hearing it ring normally, not your AI.</p>
                        </>
                      ) : (
                        <div className="text-warning">Contact your carrier for instructions specific to your plan.</div>
                      )}
                    </div>
                  );
                })()}
              <button className="btn-secondary text-xs" onClick={confirmForwardingDisabled} disabled={disablingForwarding || forwardingSetup.forwarding_active === false}>
                {disablingForwarding ? 'Saving…' : 'I turned off call forwarding'}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'buy' && (
        <section className="card space-y-4">
          <h2 className="font-display text-lg font-semibold">Buy a new number</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input className="input" placeholder="Area code" value={searchParams.areaCode} onChange={(e) => setSearchParams((s) => ({ ...s, areaCode: e.target.value }))} />
            <select className="input" value={searchParams.numberType} onChange={(e) => setSearchParams((s) => ({ ...s, numberType: e.target.value as any }))}>
              <option value="local">Local</option>
              <option value="toll_free">Toll-free</option>
            </select>
            <button className="btn-primary" onClick={searchNumbers} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <div key={r.phoneNumber} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{r.phoneNumber}</div>
                    <div className="text-xs text-slate-500">
                      {r.locality ?? r.region} · {r.capabilities.voice && 'Voice '}{r.capabilities.sms && 'SMS '}{r.capabilities.mms && 'MMS'}
                      {r.monthlyPrice ? ` · $${r.monthlyPrice}/mo` : ''}
                    </div>
                  </div>
                  <button className="btn-primary text-sm" onClick={() => buyNumber(r.phoneNumber, r.monthlyPrice)} disabled={purchasing === r.phoneNumber}>
                    {purchasing === r.phoneNumber ? 'Provisioning…' : 'Buy this number'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'import' && (
        <section className="card space-y-4">
          <h2 className="font-display text-lg font-semibold">Import from your own Twilio account</h2>
          {twilioConnection?.status === 'connected' ? (
            <div>
              <div className="badge-success mb-3 inline-block">Twilio connected</div>
              <button
                className="btn-secondary text-sm mb-3"
                onClick={async () => {
                  const res = await fetch('/api/phone/twilio-connect/numbers');
                  const data = await res.json();
                  setByoNumbers(data.numbers ?? []);
                }}
              >
                Refresh number list
              </button>
              <div className="space-y-2">
                {byoNumbers.map((n) => (
                  <div key={n.sid} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="text-sm font-medium">{n.phoneNumber}</div>
                    <button className="btn-primary text-sm" onClick={() => importByoNumber(n.sid, n.phoneNumber)} disabled={importing === n.sid}>
                      {importing === n.sid ? 'Importing…' : 'Import'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Twilio doesn&apos;t offer a one-click account link for third-party apps — connect with your Account SID and Auth
                Token. Your token is encrypted before it&apos;s stored and is never shown again after saving.
              </p>
              <input className="input" placeholder="Account SID" value={twilioCreds.accountSid} onChange={(e) => setTwilioCreds((c) => ({ ...c, accountSid: e.target.value }))} />
              <input className="input" type="password" placeholder="Auth Token" value={twilioCreds.authToken} onChange={(e) => setTwilioCreds((c) => ({ ...c, authToken: e.target.value }))} />
              <button className="btn-primary" onClick={connectTwilio} disabled={connecting}>{connecting ? 'Connecting…' : 'Connect Twilio account'}</button>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Your numbers</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : numbers.length === 0 ? (
          <p className="text-sm text-slate-500">No numbers yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {numbers.map((n) => (
              <div key={n.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{n.friendly_name ?? n.phone_number}</div>
                  <div className="text-xs text-slate-500">{n.phone_number} · {n.source} · {n.status}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs" onClick={() => renameNumber(n.id, n.friendly_name ?? '')}>Rename</button>
                  <button className="text-xs text-danger" onClick={() => releaseNumberConfirmed(n.id, n.phone_number)}>Release</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

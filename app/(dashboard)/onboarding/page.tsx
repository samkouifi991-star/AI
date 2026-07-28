'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

const STAGES = ['business', 'phone', 'voice', 'knowledge', 'calendar', 'payments', 'test', 'go_live'] as const;
type Stage = (typeof STAGES)[number];
type StageOrComplete = Stage | 'complete';

const STAGE_LABELS: Record<Stage, string> = {
  business: 'Business',
  phone: 'Phone',
  voice: 'AI Voice',
  knowledge: 'Knowledge',
  calendar: 'Calendar',
  payments: 'Payments',
  test: 'Test',
  go_live: 'Go Live'
};

export default function OnboardingWizard() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('business');
  const [completed, setCompleted] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [goLiveError, setGoLiveError] = useState<string | null>(null);

  // Stage: business
  const [form, setForm] = useState({ business_type: 'service' as 'service' | 'restaurant', name: '', phone_number: '', service_area: '' });

  // Stage: phone
  const [phoneOption, setPhoneOption] = useState<'forward' | 'buy' | null>(null);
  const [existingNumber, setExistingNumber] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [numberResults, setNumberResults] = useState<any[]>([]);
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Stage: voice
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<any>(null);

  // Stage: calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  // Stage: payments
  const [stripeConnected, setStripeConnected] = useState(false);

  // Stage: test
  const [testResult, setTestResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single();
      if (business) {
        setBusinessId(business.id);
        setForm({ business_type: business.business_type, name: business.name ?? '', phone_number: business.phone_number ?? '', service_area: business.service_area ?? '' });

        const { data: conn } = await supabase.from('calendar_connections').select('id').eq('business_id', business.id).single();
        setCalendarConnected(!!conn);

        const { data: stripeConn } = await supabase.from('provider_connections').select('status').eq('business_id', business.id).eq('provider', 'stripe').single();
        setStripeConnected(stripeConn?.status === 'connected');

        const progRes = await fetch('/api/onboarding/progress');
        const progData = await progRes.json();
        setStage(progData.progress.current_stage === 'complete' ? 'go_live' : progData.progress.current_stage);
        setCompleted(progData.progress.completed_stages ?? []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProgress(newStage: StageOrComplete, newCompleted: Stage[]) {
    setCompleted(newCompleted);
    if (newStage !== 'complete') setStage(newStage);
    const res = await fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStage: newStage, completedStages: newCompleted })
    });
    return res.json();
  }

  async function goLive() {
    setGoLiveBusy(true);
    setGoLiveError(null);
    const data = await saveProgress('complete', [...completed, 'go_live']);
    setGoLiveBusy(false);
    if (data.isLive) {
      router.push('/dashboard');
    } else {
      setGoLiveError(
        data.reason ?? 'Could not confirm your phone and assistant are fully connected yet — check Phone Management.'
      );
    }
  }

  function markComplete(current: Stage) {
    const next = Array.from(new Set([...completed, current]));
    const idx = STAGES.indexOf(current);
    const nextStage = STAGES[idx + 1] ?? current;
    saveProgress(nextStage, next);
  }

  // ---- Stage: business ----
  async function submitBusiness() {
    setSaving(true);
    setError(null);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: upsertError } = await supabase
      .from('businesses')
      .upsert({ owner_user_id: user.id, business_type: form.business_type, name: form.name, phone_number: form.phone_number, service_area: form.service_area }, { onConflict: 'owner_user_id' })
      .select()
      .single();
    setSaving(false);
    if (upsertError) return setError(upsertError.message);
    setBusinessId(data.id);
    markComplete('business');
  }

  // ---- Stage: phone ----
  async function saveForwarding() {
    setPhoneBusy(true);
    setError(null);
    const res = await fetch('/api/phone/forwarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ existingNumber, forwardMissedCalls: true, forwardWhenBusy: true })
    });
    setPhoneBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    markComplete('phone');
  }

  async function searchNumbers() {
    setPhoneBusy(true);
    setError(null);
    const res = await fetch(`/api/phone/search?areaCode=${areaCode}&numberType=local&voice=true`);
    const data = await res.json();
    setPhoneBusy(false);
    if (!res.ok) return setError(data.error);
    setNumberResults(data.results ?? []);
  }

  async function buyNumber(phoneNumber: string, price: number | null) {
    const priceLabel = price ? `$${price}/month` : 'a recurring monthly fee';
    if (!window.confirm(`This purchases ${phoneNumber} through Twilio for real — ${priceLabel}, charged to your connected Twilio account. Continue?`)) {
      return;
    }
    setPhoneBusy(true);
    setError(null);
    const res = await fetch('/api/phone/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, numberType: 'local', monthlyPrice: price })
    });
    const data = await res.json();
    setPhoneBusy(false);
    if (!res.ok) return setError(`${data.error}${data.failedStep ? ` (${data.failedStep})` : ''}`);
    markComplete('phone');
  }

  // ---- Stage: voice ----
  useEffect(() => {
    if (stage !== 'voice' || voices.length > 0) return;
    fetch('/api/voice/list')
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? []));
  }, [stage, voices.length]);

  async function saveVoice() {
    if (!businessId || !selectedVoice) return;
    setSaving(true);
    await supabase.from('business_voice_settings').upsert(
      { business_id: businessId, voice_provider: selectedVoice.provider ?? 'elevenlabs', voice_id: selectedVoice.id, voice_name: selectedVoice.name, default_language: 'en' },
      { onConflict: 'business_id' }
    );
    await fetch('/api/voice/sync-assistant', { method: 'POST' });
    setSaving(false);
    markComplete('voice');
  }

  // ---- Stage: knowledge ----
  async function skipKnowledgeForNow() {
    markComplete('knowledge');
  }

  // ---- Stage: test ----
  async function runQuickTest() {
    const res = await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType: 'assistant_tools' })
    });
    const data = await res.json();
    setTestResult(data.status === 'pass' ? 'Your assistant is configured and reachable.' : 'Assistant check did not pass yet — you can still continue and test again later.');
  }

  const stageIndex = STAGES.indexOf(stage);

  if (loading) return <div className="max-w-2xl card">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Set up Business Pilot AI</h1>
        <p className="text-slate-600 text-sm">About 10–15 minutes. We&apos;ll walk you through everything.</p>
      </div>

      <div className="flex items-center gap-1">
        {STAGES.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stageIndex ? 'bg-brand-600' : 'bg-slate-100'}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {STAGES.map((s) => (
          <span key={s} className={completed.includes(s) ? 'text-success font-medium' : s === stage ? 'text-ink font-medium' : ''}>
            {completed.includes(s) ? '✓ ' : '○ '}
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {stage === 'business' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Tell us about your business</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setForm((f) => ({ ...f, business_type: 'service' }))} className={`text-left border rounded-lg px-3 py-2 ${form.business_type === 'service' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <div className="text-sm font-medium">Service business</div>
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, business_type: 'restaurant' }))} className={`text-left border rounded-lg px-3 py-2 ${form.business_type === 'restaurant' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <div className="text-sm font-medium">Restaurant</div>
            </button>
          </div>
          <div>
            <label className="label">Business name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Current business phone number</label>
            <input className="input" value={form.phone_number} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <div>
            <label className="label">Service area</label>
            <input className="input" value={form.service_area} onChange={(e) => setForm((f) => ({ ...f, service_area: e.target.value }))} />
          </div>
          <button className="btn-primary" onClick={submitBusiness} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</button>
        </section>
      )}

      {stage === 'phone' && (
        <section className="card space-y-4">
          <h2 className="font-display text-lg font-semibold">Do you want to keep your current number, or get a new one?</h2>
          <div className="flex gap-2">
            <button className={phoneOption === 'forward' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setPhoneOption('forward')}>Keep my current number</button>
            <button className={phoneOption === 'buy' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setPhoneOption('buy')}>Get a new number</button>
          </div>

          {phoneOption === 'forward' && (
            <div className="space-y-2">
              <input className="input" placeholder="Your existing business number" value={existingNumber} onChange={(e) => setExistingNumber(e.target.value)} />
              <button className="btn-primary" onClick={saveForwarding} disabled={phoneBusy}>{phoneBusy ? 'Saving…' : 'Save and continue'}</button>
              <p className="text-xs text-slate-500">You&apos;ll get carrier-specific forwarding instructions in full Phone Settings after setup.</p>
            </div>
          )}

          {phoneOption === 'buy' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input className="input" placeholder="Area code" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} />
                <button className="btn-secondary" onClick={searchNumbers} disabled={phoneBusy}>Search</button>
              </div>
              {numberResults.map((r) => (
                <div key={r.phoneNumber} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-sm">
                  <span>{r.phoneNumber} {r.monthlyPrice ? `· $${r.monthlyPrice}/mo` : ''}</span>
                  <button className="btn-primary text-xs" onClick={() => buyNumber(r.phoneNumber, r.monthlyPrice)} disabled={phoneBusy}>Buy</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {stage === 'voice' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Choose your AI&apos;s voice</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {voices.map((v) => (
              <button key={v.id} onClick={() => setSelectedVoice(v)} className={`text-left border rounded-lg p-2 ${selectedVoice?.id === v.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                <div className="text-sm font-medium">{v.name}</div>
                <div className="text-xs text-slate-500">{[v.gender, v.accent, v.style].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={saveVoice} disabled={!selectedVoice || saving}>{saving ? 'Saving…' : 'Save and continue'}</button>
        </section>
      )}

      {stage === 'knowledge' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Teach your AI about your business</h2>
          <p className="text-sm text-slate-600">
            {form.business_type === 'restaurant'
              ? 'Upload your menu now, or do it later from the Menu page — either way, nothing changes for your AI until you publish.'
              : 'Upload documents, add FAQs, and set pricing now, or do it later from the Knowledge Base page.'}
          </p>
          <a href={form.business_type === 'restaurant' ? '/menu' : '/knowledge-base'} className="btn-secondary inline-block">
            Go to {form.business_type === 'restaurant' ? 'Menu' : 'Knowledge Base'}
          </a>
          <div>
            <button className="btn-primary" onClick={skipKnowledgeForNow}>Continue (I&apos;ll finish this later)</button>
          </div>
        </section>
      )}

      {stage === 'calendar' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Connect Google Calendar</h2>
          <p className="text-sm text-slate-600">So your AI can check real availability and book appointments.</p>
          {calendarConnected ? (
            <div className="badge-success inline-block">Connected</div>
          ) : (
            <a href="/api/calendar/google" className="btn-primary inline-block">Connect Google Calendar</a>
          )}
          <div>
            <button className="btn-secondary" onClick={() => markComplete('calendar')}>{calendarConnected ? 'Continue' : 'Skip for now'}</button>
          </div>
        </section>
      )}

      {stage === 'payments' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Connect payments</h2>
          <p className="text-sm text-slate-600">Connect your own Stripe account, or use Business Pilot AI&apos;s built-in payment processing.</p>
          {stripeConnected ? (
            <div className="badge-success inline-block">Stripe connected</div>
          ) : (
            <a href="/api/payments/stripe-connect" className="btn-primary inline-block">Connect Stripe</a>
          )}
          <div>
            <button className="btn-secondary" onClick={() => markComplete('payments')}>{stripeConnected ? 'Continue' : 'Use built-in payments instead'}</button>
          </div>
        </section>
      )}

      {stage === 'test' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">Test your assistant</h2>
          <button className="btn-secondary" onClick={runQuickTest}>Run a quick check</button>
          {testResult && <p className="text-sm text-slate-600">{testResult}</p>}
          <a href="/phone/test-center" className="text-sm text-brand-600 underline block">Open the full Test Center</a>
          <button className="btn-primary" onClick={() => markComplete('test')}>Continue</button>
        </section>
      )}

      {stage === 'go_live' && (
        <section className="card space-y-3">
          <h2 className="font-display text-lg font-semibold">You&apos;re ready to go live</h2>
          <ul className="text-sm space-y-1">
            {STAGES.filter((s) => s !== 'go_live').map((s) => (
              <li key={s} className={completed.includes(s) ? 'text-success' : 'text-slate-400'}>
                {completed.includes(s) ? '✓' : '○'} {STAGE_LABELS[s]}
              </li>
            ))}
          </ul>
          {goLiveError && (
            <div className="text-sm text-warning bg-amber-50 rounded-lg px-3 py-2">
              Not live yet — {goLiveError}
            </div>
          )}
          <button className="btn-primary" onClick={goLive} disabled={goLiveBusy}>
            {goLiveBusy ? 'Checking your connection…' : 'Go live'}
          </button>
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
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

// Mirrors the shape /api/phone/assistant-settings expects — that route
// upserts every one of these fields, so a save from here has to send the
// full object (loaded first) rather than just the one field this step
// edits, or it would silently blank out settings saved elsewhere.
const ASSISTANT_SETTINGS_DEFAULTS = {
  name: 'AI Receptionist',
  firstMessage: '',
  systemPromptOverride: '',
  language: 'en',
  fallbackLanguage: '',
  speakingSpeed: 1.0,
  interruptionSensitivity: 'medium',
  silenceTimeoutSeconds: 10,
  callTimeoutSeconds: 1800,
  voicemailBehavior: 'leave_message',
  recordCalls: true,
  collectTranscripts: true,
  generateSummaries: true,
  advancedModeEnabled: false
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
  const [voiceProviderKey, setVoiceProviderKey] = useState('elevenlabs');
  const [selectedVoice, setSelectedVoice] = useState<any>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stage: knowledge
  const [assistantSettings, setAssistantSettings] = useState(ASSISTANT_SETTINGS_DEFAULTS);
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [instructionsResult, setInstructionsResult] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteImporting, setWebsiteImporting] = useState(false);
  const [websiteImportResult, setWebsiteImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadedNames, setKbUploadedNames] = useState<string[]>([]);
  const [kbError, setKbError] = useState<string | null>(null);

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
      .then((d) => {
        setVoices(d.voices ?? []);
        if (d.provider) setVoiceProviderKey(d.provider);
      });
  }, [stage, voices.length]);

  async function playVoicePreview(voice: any) {
    setPreviewError(null);
    setPreviewingId(voice.id);
    try {
      if (voice.previewUrl) {
        if (audioRef.current) {
          audioRef.current.src = voice.previewUrl;
          await audioRef.current.play();
        }
      } else {
        const res = await fetch('/api/voice/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: voiceProviderKey, voiceId: voice.id })
        });
        if (!res.ok) throw new Error('Preview failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = objectUrl;
          await audioRef.current.play();
        }
      }
    } catch {
      setPreviewError('Could not play that preview.');
    } finally {
      setPreviewingId(null);
    }
  }

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
  const [assistantSettingsLoaded, setAssistantSettingsLoaded] = useState(false);
  useEffect(() => {
    if (stage !== 'knowledge' || assistantSettingsLoaded) return;
    setAssistantSettingsLoaded(true);
    fetch('/api/phone/assistant-settings')
      .then((r) => r.json())
      .then((d) => {
        if (!d.settings) return;
        setAssistantSettings({
          name: d.settings.name,
          firstMessage: d.settings.first_message ?? '',
          systemPromptOverride: d.settings.system_prompt_override ?? '',
          language: d.settings.language,
          fallbackLanguage: d.settings.fallback_language ?? '',
          speakingSpeed: d.settings.speaking_speed,
          interruptionSensitivity: d.settings.interruption_sensitivity,
          silenceTimeoutSeconds: d.settings.silence_timeout_seconds,
          callTimeoutSeconds: d.settings.call_timeout_seconds,
          voicemailBehavior: d.settings.voicemail_behavior,
          recordCalls: d.settings.record_calls,
          collectTranscripts: d.settings.collect_transcripts,
          generateSummaries: d.settings.generate_summaries,
          advancedModeEnabled: d.settings.advanced_mode_enabled
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, assistantSettingsLoaded]);

  async function saveInstructions() {
    setInstructionsSaving(true);
    setInstructionsResult(null);
    const res = await fetch('/api/phone/assistant-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assistantSettings)
    });
    const data = await res.json();
    setInstructionsSaving(false);
    setInstructionsResult(
      data.syncStatus === 'synced'
        ? 'Saved — your AI will follow these instructions on the next call.'
        : data.syncStatus === 'partial'
        ? 'Saved, but one or more settings could not be confirmed on your AI employee yet.'
        : 'Saved. This will apply once your phone number is fully connected.'
    );
  }

  async function importWebsite() {
    if (!websiteUrl.trim()) return;
    setWebsiteImporting(true);
    setWebsiteImportResult(null);
    try {
      const res = await fetch('/api/knowledge/import-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setWebsiteImportResult({ ok: false, message: data.error ?? 'Could not import that website.' });
        return;
      }
      setWebsiteImportResult({
        ok: true,
        message: `Read ${data.pagesFetched} page${data.pagesFetched === 1 ? '' : 's'} from your site and added it to your AI's knowledge base.`
      });
    } catch {
      setWebsiteImportResult({ ok: false, message: 'Could not import that website.' });
    } finally {
      setWebsiteImporting(false);
    }
  }

  async function handleKnowledgeFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    setKbUploading(true);
    setKbError(null);

    const path = `${businessId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('knowledge-documents').upload(path, file);
    if (uploadError) {
      setKbError(uploadError.message);
      setKbUploading(false);
      return;
    }

    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({ business_id: businessId, file_name: file.name, storage_path: path, doc_type: 'other', status: 'processing' })
      .select()
      .single();
    if (insertError || !doc) {
      setKbError(insertError?.message ?? 'Failed to save document record.');
      setKbUploading(false);
      return;
    }

    await fetch('/api/knowledge/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id })
    });

    setKbUploadedNames((names) => [...names, file.name]);
    setKbUploading(false);
    e.target.value = '';
  }

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
          <p className="text-xs text-slate-500">Listen to a sample before choosing — nothing is saved until you pick Select.</p>
          <audio ref={audioRef} className="hidden" />
          {previewError && <div className="text-xs text-danger">{previewError}</div>}
          <div className="grid sm:grid-cols-2 gap-2">
            {voices.map((v) => {
              const active = selectedVoice?.id === v.id;
              return (
                <div key={v.id} className={`border rounded-lg p-2 flex items-center justify-between gap-2 ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                  <div>
                    <div className="text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-slate-500">{[v.gender, v.accent, v.style].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1"
                      onClick={() => playVoicePreview(v)}
                      disabled={previewingId === v.id}
                    >
                      {previewingId === v.id ? 'Loading…' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      className={active ? 'btn-primary text-xs px-2 py-1' : 'btn-secondary text-xs px-2 py-1'}
                      onClick={() => setSelectedVoice(v)}
                    >
                      {active ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-primary" onClick={saveVoice} disabled={!selectedVoice || saving}>{saving ? 'Saving…' : 'Save and continue'}</button>
        </section>
      )}

      {stage === 'knowledge' && (
        <div className="space-y-4">
          <section className="card space-y-3">
            <h2 className="font-display text-lg font-semibold">How should your AI receptionist behave?</h2>
            <p className="text-sm text-slate-600">
              Tell it how to talk to customers, what to prioritize, or anything specific to how you run things —
              this is added to the instructions it already follows, not a replacement for them.
            </p>
            <textarea
              className="input font-mono text-xs"
              rows={5}
              placeholder='e.g. "Always mention our happy hour from 4-6pm. Be warm but brief — most callers are on their lunch break. Never quote a price for custom orders, always say a team member will follow up."'
              value={assistantSettings.systemPromptOverride}
              onChange={(e) => setAssistantSettings((s) => ({ ...s, systemPromptOverride: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={saveInstructions} disabled={instructionsSaving}>
                {instructionsSaving ? 'Saving…' : 'Save instructions'}
              </button>
              {instructionsResult && <span className="text-xs text-slate-600">{instructionsResult}</span>}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="font-display text-lg font-semibold">Import from your website</h2>
            <p className="text-sm text-slate-600">
              Enter your site and your AI will read it (plus a few linked pages like About, Menu, or FAQ) to learn
              how to answer customers.
            </p>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="https://yourbusiness.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
              <button className="btn-secondary shrink-0" onClick={importWebsite} disabled={websiteImporting || !websiteUrl.trim()}>
                {websiteImporting ? 'Reading site…' : 'Import from website'}
              </button>
            </div>
            {websiteImportResult && (
              <div className={websiteImportResult.ok ? 'text-sm text-success bg-green-50 rounded-lg px-3 py-2' : 'text-sm text-danger bg-red-50 rounded-lg px-3 py-2'}>
                {websiteImportResult.message}
              </div>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="font-display text-lg font-semibold">Teach your AI about your business</h2>
            <p className="text-sm text-slate-600">
              {form.business_type === 'restaurant'
                ? 'Upload your menu now, or do it later from the Menu page — either way, nothing changes for your AI until you publish.'
                : 'Upload documents, add FAQs, and set pricing now, or do it later from the Knowledge Base page.'}
            </p>
            <div>
              <label className="btn-secondary inline-block cursor-pointer">
                {kbUploading ? 'Uploading…' : 'Upload a document'}
                <input type="file" className="hidden" onChange={handleKnowledgeFileUpload} disabled={kbUploading} />
              </label>
            </div>
            {kbUploadedNames.length > 0 && (
              <ul className="text-xs text-slate-600 list-disc list-inside">
                {kbUploadedNames.map((n) => (
                  <li key={n}>{n} uploaded</li>
                ))}
              </ul>
            )}
            {kbError && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{kbError}</div>}
            <a href={form.business_type === 'restaurant' ? '/menu' : '/knowledge-base'} className="btn-secondary inline-block">
              Go to {form.business_type === 'restaurant' ? 'Menu' : 'Knowledge Base'}
            </a>
            <div>
              <button className="btn-primary" onClick={skipKnowledgeForNow}>Continue</button>
            </div>
          </section>
        </div>
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

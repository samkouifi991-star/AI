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
  const [phoneOption, setPhoneOption] = useState<'forward' | 'buy' | 'connect_existing' | null>(null);
  const [existingNumber, setExistingNumber] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [numberResults, setNumberResults] = useState<any[]>([]);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [phoneDataLoaded, setPhoneDataLoaded] = useState(false);

  // Phone: connect an existing Twilio number
  const [twilioCreds, setTwilioCreds] = useState({ accountSid: '', authToken: '' });
  const [twilioConnStatus, setTwilioConnStatus] = useState<any>(null);
  const [connectingTwilio, setConnectingTwilio] = useState(false);
  const [byoNumbers, setByoNumbers] = useState<any[]>([]);
  const [importingSid, setImportingSid] = useState<string | null>(null);

  // Phone: keep current number + forward calls
  const [forwardSubStep, setForwardSubStep] = useState<'get_number' | 'details' | 'test'>('get_number');
  const [forwardType, setForwardType] = useState<'all' | 'unanswered' | 'delay' | 'after_hours'>('unanswered');
  const [forwardCarrier, setForwardCarrier] = useState('other');
  const [carrierCodes, setCarrierCodes] = useState<any[]>([]);
  const [aiDestination, setAiDestination] = useState<string | null>(null);
  const [forwardingSetup, setForwardingSetup] = useState<any>(null);
  const [savingForwarding, setSavingForwarding] = useState(false);
  const [testingForwarding, setTestingForwarding] = useState(false);
  const [forwardTestMessage, setForwardTestMessage] = useState<string | null>(null);
  const [showDisconnectInstructions, setShowDisconnectInstructions] = useState(false);
  const [disablingForwarding, setDisablingForwarding] = useState(false);
  const [disableConfirmed, setDisableConfirmed] = useState(false);
  const [forwardGetNumberMethod, setForwardGetNumberMethod] = useState<'buy' | 'connect_existing' | null>(null);

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

  // Lets the owner jump back into any step they've already finished (or
  // the one they're on) to change something — doesn't touch `completed`,
  // so nothing already done gets un-checked just by revisiting it. Steps
  // not yet reached aren't clickable — skipping ahead of unfinished setup
  // (e.g. testing before a number is connected) isn't what "go back" means.
  function goToStage(s: Stage) {
    if (s === stage) return;
    saveProgress(s, completed);
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
  const hasActiveAiNumber = phoneNumbers.some((n) => n.status === 'active');

  async function loadPhoneStageData() {
    const [numRes, fRes, tRes] = await Promise.all([
      fetch('/api/phone/numbers'),
      fetch('/api/phone/forwarding'),
      fetch('/api/phone/twilio-connect')
    ]);
    const numData = await numRes.json();
    const fData = await fRes.json();
    const tData = await tRes.json();

    const numbers = numData.numbers ?? [];
    setPhoneNumbers(numbers);
    setCarrierCodes(fData.carrierCodes ?? []);
    setAiDestination(fData.aiDestinationNumber);
    setTwilioConnStatus(tData.connection);

    const activeAiNumber = numbers.some((n: any) => n.status === 'active');

    if (fData.setup) {
      setForwardingSetup(fData.setup);
      setExistingNumber(fData.setup.existing_number ?? '');
      setForwardCarrier(fData.setup.carrier ?? 'other');
      setForwardType(
        fData.setup.forward_all_calls ? 'all' : fData.setup.forward_after_hours ? 'after_hours' : fData.setup.forward_missed_calls ? 'unanswered' : 'unanswered'
      );
      if (!phoneOption) setPhoneOption('forward');
      setForwardSubStep(!activeAiNumber ? 'get_number' : !fData.setup.existing_number ? 'details' : 'test');
    } else if (numbers.some((n: any) => n.source === 'imported_byo')) {
      if (!phoneOption) setPhoneOption('connect_existing');
    } else if (activeAiNumber) {
      if (!phoneOption) setPhoneOption('buy');
    }

    setPhoneDataLoaded(true);
  }

  useEffect(() => {
    if (stage !== 'phone' || phoneDataLoaded) return;
    loadPhoneStageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, phoneDataLoaded]);

  async function searchNumbers() {
    setPhoneBusy(true);
    setError(null);
    const res = await fetch(`/api/phone/search?areaCode=${areaCode}&numberType=local&voice=true`);
    const data = await res.json();
    setPhoneBusy(false);
    if (!res.ok) return setError(data.error);
    setNumberResults(data.results ?? []);
  }

  // completeAfter: whether a successful purchase should finish the Phone
  // step outright ('buy' chosen directly) or just satisfy step 1 of the
  // forwarding flow ('forward' chosen — an AI number is still needed
  // before forwarding, business number, and a test can happen).
  async function buyNumber(phoneNumber: string, price: number | null, completeAfter: boolean) {
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
    await loadPhoneStageData0();
    if (completeAfter) {
      markComplete('phone');
    } else {
      setForwardSubStep('details');
    }
  }

  // Re-fetch without the "only load once" guard, for after an action
  // changes phone state mid-stage.
  async function loadPhoneStageData0() {
    setPhoneDataLoaded(false);
    await loadPhoneStageData();
  }

  async function connectTwilioByo() {
    setConnectingTwilio(true);
    setError(null);
    const res = await fetch('/api/phone/twilio-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(twilioCreds)
    });
    const data = await res.json();
    setConnectingTwilio(false);
    if (!res.ok) return setError(data.error);
    setTwilioConnStatus({ status: 'connected' });
    setTwilioCreds({ accountSid: '', authToken: '' });
    const numRes = await fetch('/api/phone/twilio-connect/numbers');
    const numData = await numRes.json();
    setByoNumbers(numData.numbers ?? []);
  }

  async function importByoNumber(sid: string, phoneNumber: string, completeAfter: boolean) {
    setImportingSid(sid);
    setError(null);
    const res = await fetch('/api/phone/twilio-connect/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twilioSid: sid, phoneNumber })
    });
    const data = await res.json();
    setImportingSid(null);
    if (!res.ok) return setError(`${data.error}${data.failedStep ? ` (${data.failedStep})` : ''}`);
    await loadPhoneStageData0();
    if (completeAfter) {
      markComplete('phone');
    } else {
      setForwardSubStep('details');
    }
  }

  async function saveForwardingDetails() {
    setSavingForwarding(true);
    setError(null);
    const res = await fetch('/api/phone/forwarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        existingNumber,
        carrier: forwardCarrier,
        forwardAllCalls: forwardType === 'all' || forwardType === 'after_hours',
        forwardMissedCalls: forwardType === 'unanswered' || forwardType === 'delay',
        forwardWhenBusy: false,
        forwardAfterHours: forwardType === 'after_hours'
      })
    });
    setSavingForwarding(false);
    if (!res.ok) return setError((await res.json()).error);
    await loadPhoneStageData0();
    setForwardSubStep('test');
  }

  async function runForwardingTest() {
    setTestingForwarding(true);
    setForwardTestMessage(null);
    await fetch('/api/phone/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testType: 'forwarding_check' })
    });
    setTestingForwarding(false);
    setForwardTestMessage('Now place that test call from another phone, then click "Check now" below once it rings your AI.');
  }

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
      setForwardTestMessage("Verified — a call reached your AI number. Forwarding is working.");
      await loadPhoneStageData0();
      markComplete('phone');
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
      setDisableConfirmed(true);
      await loadPhoneStageData0();
    }
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

  // Honest, plain-language status for the Phone step — reflects what has
  // actually been verified (a real purchase/import/read-back, or a real
  // test call landing in `calls`), never just "the user clicked something."
  function phoneStageStatus(): { label: string; tone: string } {
    if (error) return { label: 'Failed', tone: 'badge-danger' };
    if (completed.includes('phone')) return { label: 'Phone verified', tone: 'badge-success' };
    if (phoneOption === 'buy' && phoneBusy) return { label: 'Purchasing number', tone: 'badge-warning' };
    if (phoneOption === 'connect_existing' && (connectingTwilio || importingSid)) return { label: 'Connecting number', tone: 'badge-warning' };
    if (phoneOption === 'forward') {
      if (!hasActiveAiNumber) return phoneBusy ? { label: 'Purchasing number', tone: 'badge-warning' } : { label: 'Number required', tone: 'badge-warning' };
      if (forwardSubStep === 'test') return { label: 'Call forwarding not tested', tone: 'badge-warning' };
      return { label: 'Awaiting selection', tone: 'badge-warning' };
    }
    if (!phoneOption) return { label: 'Number required', tone: 'badge-warning' };
    return { label: 'Awaiting selection', tone: 'badge-warning' };
  }

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
        {STAGES.map((s) => {
          const reachable = completed.includes(s) || s === stage;
          return (
            <button
              key={s}
              type="button"
              onClick={() => goToStage(s)}
              disabled={!reachable}
              title={reachable ? `Go to ${STAGE_LABELS[s]}` : 'Finish earlier steps first'}
              className={
                (completed.includes(s) ? 'text-success font-medium' : s === stage ? 'text-ink font-medium' : 'text-slate-400') +
                (reachable ? ' hover:underline cursor-pointer' : ' cursor-not-allowed')
              }
            >
              {completed.includes(s) ? '✓ ' : '○ '}
              {STAGE_LABELS[s]}
            </button>
          );
        })}
      </div>
      {completed.includes(stage) && (
        <p className="text-xs text-slate-500">
          You&apos;ve already completed this step — make any changes below and save, or move on to another step above.
        </p>
      )}

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
        <div className="space-y-4">
          <section className="card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">How would you like customers to reach your AI employee?</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Every business needs an AI-enabled phone number. You can get a new number, connect a Twilio number
                  you already own, or keep your current business number and forward calls to your AI number.
                </p>
              </div>
              <span className={phoneStageStatus().tone}>{phoneStageStatus().label}</span>
            </div>
          </section>

          {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          {/* Option 1: Get a new AI number */}
          <section className={`card space-y-3 ${phoneOption === 'buy' ? 'ring-2 ring-brand-500' : ''}`}>
            <h3 className="font-display font-semibold">1. Get a new AI number</h3>
            <p className="text-xs text-slate-500">Use this if you don&apos;t already have a suitable Twilio number.</p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li>We&apos;ll help you choose and purchase a new Twilio number.</li>
              <li>It connects automatically to your Business Pilot AI assistant.</li>
              <li>You can publish this number as your new business number.</li>
              <li>Phone-number rental and usage charges may apply.</li>
              <li>You&apos;ll be asked to confirm before anything is purchased.</li>
            </ul>
            {phoneOption !== 'buy' ? (
              <button className="btn-primary text-sm" onClick={() => setPhoneOption('buy')}>Get a new AI number</button>
            ) : (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <input className="input" placeholder="Area code" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} />
                  <button className="btn-secondary" onClick={searchNumbers} disabled={phoneBusy}>Search</button>
                </div>
                {numberResults.map((r) => (
                  <div key={r.phoneNumber} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-sm">
                    <span>{r.phoneNumber} {r.monthlyPrice ? `· $${r.monthlyPrice}/mo` : ''}</span>
                    <button className="btn-primary text-xs" onClick={() => buyNumber(r.phoneNumber, r.monthlyPrice, true)} disabled={phoneBusy}>
                      {phoneBusy ? 'Purchasing…' : 'Buy this number'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Option 2: Connect an existing Twilio number */}
          <section className={`card space-y-3 ${phoneOption === 'connect_existing' ? 'ring-2 ring-brand-500' : ''}`}>
            <h3 className="font-display font-semibold">2. Connect an existing Twilio number</h3>
            <p className="text-xs text-slate-500">Use this if you already own a Twilio number.</p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li>Import or connect your existing Twilio number.</li>
              <li>We&apos;ll connect it to your new Vapi assistant.</li>
              <li>The number must support voice.</li>
              <li>Ownership and the provider connection are verified before it&apos;s marked ready.</li>
            </ul>
            {phoneOption !== 'connect_existing' ? (
              <button className="btn-primary text-sm" onClick={() => setPhoneOption('connect_existing')}>Connect my Twilio number</button>
            ) : (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {twilioConnStatus?.status === 'connected' ? (
                  <div className="space-y-2">
                    <span className="badge-success inline-block">Twilio connected</span>
                    {byoNumbers.length === 0 && (
                      <button
                        className="btn-secondary text-xs block"
                        onClick={async () => {
                          const res = await fetch('/api/phone/twilio-connect/numbers');
                          const data = await res.json();
                          setByoNumbers(data.numbers ?? []);
                        }}
                      >
                        Load my Twilio numbers
                      </button>
                    )}
                    {byoNumbers.map((n) => (
                      <div key={n.sid} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-sm">
                        <div>
                          <div>{n.phoneNumber}</div>
                          {!n.capabilities?.voice && <div className="text-xs text-danger">Doesn&apos;t support voice — can&apos;t be used for calls.</div>}
                        </div>
                        <button
                          className="btn-primary text-xs"
                          onClick={() => importByoNumber(n.sid, n.phoneNumber, true)}
                          disabled={importingSid === n.sid || !n.capabilities?.voice}
                        >
                          {importingSid === n.sid ? 'Connecting…' : 'Connect this number'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Enter your Twilio Account SID and Auth Token. Your token is encrypted before it&apos;s stored and never shown again.
                    </p>
                    <input className="input" placeholder="Account SID" value={twilioCreds.accountSid} onChange={(e) => setTwilioCreds((c) => ({ ...c, accountSid: e.target.value }))} />
                    <input className="input" type="password" placeholder="Auth Token" value={twilioCreds.authToken} onChange={(e) => setTwilioCreds((c) => ({ ...c, authToken: e.target.value }))} />
                    <button className="btn-primary text-sm" onClick={connectTwilioByo} disabled={connectingTwilio}>
                      {connectingTwilio ? 'Connecting…' : 'Connect Twilio account'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Option 3: Keep current number, forward to AI */}
          <section className={`card space-y-3 ${phoneOption === 'forward' ? 'ring-2 ring-brand-500' : ''}`}>
            <h3 className="font-display font-semibold">3. Keep my current business number</h3>
            <p className="text-xs text-slate-500">Use this if you want customers to keep calling the number they already know.</p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
              <li>You still need a separate AI number — forwarding needs somewhere to send calls to.</li>
              <li>Your current business number forwards calls to that AI number.</li>
              <li>Customers keep dialing the number they already know.</li>
              <li>Business Pilot AI answers the forwarded calls.</li>
              <li>Choose: forward all calls, only unanswered calls, after a ring delay, or after business hours.</li>
              <li>Call forwarding is controlled by your carrier and may create carrier charges.</li>
            </ul>
            {phoneOption !== 'forward' ? (
              <button className="btn-primary text-sm" onClick={() => setPhoneOption('forward')}>Keep my current number</button>
            ) : (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                {/* Step 1: get or connect an AI number */}
                {!hasActiveAiNumber && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Step 1: Get or connect an AI number first</p>
                    <div className="flex gap-2">
                      <button className={forwardGetNumberMethod === 'buy' ? 'btn-primary text-xs' : 'btn-secondary text-xs'} onClick={() => setForwardGetNumberMethod('buy')}>New number</button>
                      <button className={forwardGetNumberMethod === 'connect_existing' ? 'btn-primary text-xs' : 'btn-secondary text-xs'} onClick={() => setForwardGetNumberMethod('connect_existing')}>Connect Twilio number</button>
                    </div>
                    {forwardGetNumberMethod === 'buy' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input className="input" placeholder="Area code" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} />
                          <button className="btn-secondary" onClick={searchNumbers} disabled={phoneBusy}>Search</button>
                        </div>
                        {numberResults.map((r) => (
                          <div key={r.phoneNumber} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-sm">
                            <span>{r.phoneNumber} {r.monthlyPrice ? `· $${r.monthlyPrice}/mo` : ''}</span>
                            <button className="btn-primary text-xs" onClick={() => buyNumber(r.phoneNumber, r.monthlyPrice, false)} disabled={phoneBusy}>
                              {phoneBusy ? 'Purchasing…' : 'Buy this number'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {forwardGetNumberMethod === 'connect_existing' && (
                      <div className="space-y-2">
                        {twilioConnStatus?.status === 'connected' ? (
                          <div className="space-y-2">
                            {byoNumbers.length === 0 && (
                              <button
                                className="btn-secondary text-xs"
                                onClick={async () => {
                                  const res = await fetch('/api/phone/twilio-connect/numbers');
                                  const data = await res.json();
                                  setByoNumbers(data.numbers ?? []);
                                }}
                              >
                                Load my Twilio numbers
                              </button>
                            )}
                            {byoNumbers.map((n) => (
                              <div key={n.sid} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-sm">
                                <span>{n.phoneNumber}</span>
                                <button className="btn-primary text-xs" onClick={() => importByoNumber(n.sid, n.phoneNumber, false)} disabled={importingSid === n.sid || !n.capabilities?.voice}>
                                  {importingSid === n.sid ? 'Connecting…' : 'Connect'}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input className="input" placeholder="Account SID" value={twilioCreds.accountSid} onChange={(e) => setTwilioCreds((c) => ({ ...c, accountSid: e.target.value }))} />
                            <input className="input" type="password" placeholder="Auth Token" value={twilioCreds.authToken} onChange={(e) => setTwilioCreds((c) => ({ ...c, authToken: e.target.value }))} />
                            <button className="btn-primary text-sm" onClick={connectTwilioByo} disabled={connectingTwilio}>
                              {connectingTwilio ? 'Connecting…' : 'Connect Twilio account'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2 & 3: business number + forwarding behavior */}
                {hasActiveAiNumber && forwardSubStep === 'details' && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Step 2: Your current business number</p>
                    <input className="input" placeholder="Your existing business number" value={existingNumber} onChange={(e) => setExistingNumber(e.target.value)} />

                    <p className="text-sm font-medium">Step 3: When should calls forward?</p>
                    {[
                      ['all', 'Forward all calls'],
                      ['unanswered', 'Forward only unanswered calls'],
                      ['delay', 'Forward after a ring delay'],
                      ['after_hours', 'Forward after business hours']
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="forwardType" checked={forwardType === key} onChange={() => setForwardType(key as any)} />
                        {label}
                      </label>
                    ))}
                    {forwardType === 'after_hours' && (
                      <p className="text-xs text-warning bg-amber-50 rounded-lg px-3 py-2">
                        Most carriers can&apos;t automatically turn forwarding on and off by time of day. We&apos;ll forward all
                        calls to your AI number, and you can set your AI to only answer after hours (and ring your business
                        first during open hours) from Call Routing once setup is done.
                      </p>
                    )}

                    <p className="text-sm font-medium">Step 4: Your carrier</p>
                    <select className="input max-w-xs" value={forwardCarrier} onChange={(e) => setForwardCarrier(e.target.value)}>
                      {carrierCodes.map((c) => (
                        <option key={c.carrier} value={c.carrier}>{c.display_name}</option>
                      ))}
                    </select>
                    {carrierCodes.find((c) => c.carrier === forwardCarrier) &&
                      (() => {
                        const c = carrierCodes.find((c) => c.carrier === forwardCarrier);
                        const dest = aiDestination ?? '[your AI number]';
                        const code =
                          forwardType === 'all' || forwardType === 'after_hours'
                            ? c.forward_all_code
                            : c.forward_no_answer_code;
                        return (
                          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                            {code ? (
                              <div>Dial: <span className="font-mono">{code.replace('{number}', dest)}</span>, then press Call.</div>
                            ) : (
                              <div className="text-warning">We don&apos;t have a published code for this carrier and forwarding type — contact your carrier for instructions.</div>
                            )}
                            {c.notes && <p className="text-xs text-slate-500">{c.notes}</p>}
                          </div>
                        );
                      })()}

                    <button className="btn-primary" onClick={saveForwardingDetails} disabled={savingForwarding || !existingNumber}>
                      {savingForwarding ? 'Saving…' : 'Save and continue to test'}
                    </button>
                  </div>
                )}

                {/* Step 5 & 6: test + verify */}
                {hasActiveAiNumber && forwardSubStep === 'test' && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Step 5: Test forwarding</p>
                    <p className="text-sm text-slate-600">
                      From a different phone, call your business number ({existingNumber || 'the number you entered'}).
                      It should ring your AI employee.
                    </p>
                    <div className="flex gap-2">
                      <button className="btn-secondary text-sm" onClick={runForwardingTest} disabled={testingForwarding}>
                        {testingForwarding ? 'Working…' : "I've set up forwarding — test it"}
                      </button>
                      <button className="btn-primary text-sm" onClick={checkForwardingVerified} disabled={testingForwarding}>
                        {testingForwarding ? 'Checking…' : 'Check now'}
                      </button>
                    </div>
                    {forwardTestMessage && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{forwardTestMessage}</div>}
                    <button className="text-xs text-slate-500 underline" onClick={() => setForwardSubStep('details')}>Change forwarding details</button>
                  </div>
                )}

                {/* Stop forwarding — always available once forwarding exists */}
                {forwardingSetup && (
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium">Stop forwarding calls</p>
                    <p className="text-xs text-slate-500">
                      You can disable forwarding whenever you want — your original business number will then ring
                      normally again. Your AI number stays active unless you separately disconnect or cancel it.
                      Disabling forwarding does not automatically release your AI number or stop number-rental charges.
                    </p>
                    <button className="btn-secondary text-xs" onClick={() => setShowDisconnectInstructions((v) => !v)}>
                      {showDisconnectInstructions ? 'Hide disconnect instructions' : 'Show disconnect instructions'}
                    </button>
                    {showDisconnectInstructions &&
                      (() => {
                        const c = carrierCodes.find((c) => c.carrier === forwardCarrier);
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
                    <div className="flex gap-2 pt-1">
                      <button className="btn-secondary text-xs" onClick={confirmForwardingDisabled} disabled={disablingForwarding}>
                        {disablingForwarding ? 'Saving…' : 'I turned off call forwarding'}
                      </button>
                    </div>
                    {disableConfirmed && (
                      <div className="text-xs text-success bg-green-50 rounded-lg px-3 py-2">
                        Forwarding marked as disabled. Your AI number is still active — go to Phone Management if you want to release it separately.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
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

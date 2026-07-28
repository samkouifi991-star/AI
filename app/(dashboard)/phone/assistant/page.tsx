'use client';

import { useEffect, useState } from 'react';
import PhoneSubNav from '../PhoneSubNav';

const DEFAULTS = {
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

type LastSync = {
  status: 'pending' | 'synced' | 'partial' | 'failed';
  vapi_assistant_id: string | null;
  requested_at: string;
  completed_at: string | null;
  error_message: string | null;
} | null;

// Plain-language for the owner — technical status (assistant IDs, raw sync
// state) lives in the collapsed Advanced section below, not here.
function statusBadge(lastSync: LastSync): { label: string; className: string } {
  if (!lastSync) return { label: 'Your number still needs an assistant', className: 'badge-warning' };
  if (lastSync.status === 'synced') return { label: 'Your AI employee is ready', className: 'badge-success' };
  if (lastSync.status === 'partial') return { label: 'A setting could not be applied', className: 'badge-warning' };
  if (lastSync.status === 'pending') return { label: 'Syncing…', className: 'badge-warning' };
  if (lastSync.error_message?.toLowerCase().includes('no active phone number')) {
    return { label: 'Your number still needs an assistant', className: 'badge-warning' };
  }
  return { label: 'A setting could not be applied', className: 'badge-danger' };
}

export default function AssistantSettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [lastSync, setLastSync] = useState<LastSync>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [mismatches, setMismatches] = useState<string[]>([]);
  const [lastSyncMeta, setLastSyncMeta] = useState<any>(null);

  async function load() {
    const res = await fetch('/api/phone/assistant-settings');
    const data = await res.json();
    if (data.settings) {
      setSettings({
        name: data.settings.name,
        firstMessage: data.settings.first_message ?? '',
        systemPromptOverride: data.settings.system_prompt_override ?? '',
        language: data.settings.language,
        fallbackLanguage: data.settings.fallback_language ?? '',
        speakingSpeed: data.settings.speaking_speed,
        interruptionSensitivity: data.settings.interruption_sensitivity,
        silenceTimeoutSeconds: data.settings.silence_timeout_seconds,
        callTimeoutSeconds: data.settings.call_timeout_seconds,
        voicemailBehavior: data.settings.voicemail_behavior,
        recordCalls: data.settings.record_calls,
        collectTranscripts: data.settings.collect_transcripts,
        generateSummaries: data.settings.generate_summaries,
        advancedModeEnabled: data.settings.advanced_mode_enabled
      });
    }
    setLastSync(data.lastSync ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySyncResult(data: any) {
    if (data.syncStatus === 'synced') {
      setSaveResult('Your AI employee is ready — your latest changes are live.');
      setMismatches([]);
    } else if (data.syncStatus === 'partial') {
      setSaveResult('A setting could not be applied — see Advanced below for exactly which one.');
      setMismatches(Object.entries(data.fieldResults ?? {}).filter(([, v]: any) => !v.match).map(([k]) => k));
    } else {
      setSaveResult('A setting could not be applied. See Advanced below for the technical reason.');
      setMismatches([]);
    }
    setLastSyncMeta(data);
  }

  async function save() {
    setSaving(true);
    setSaveResult(null);
    setMismatches([]);
    const res = await fetch('/api/phone/assistant-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    setSaving(false);
    applySyncResult(data);
    await load();
  }

  async function repair() {
    setRepairing(true);
    setSaveResult(null);
    setMismatches([]);
    const res = await fetch('/api/phone/assistant-settings/repair', { method: 'POST' });
    const data = await res.json();
    setRepairing(false);
    applySyncResult(data);
    await load();
  }

  if (loading) return <div className="card max-w-2xl">Loading…</div>;

  const badge = statusBadge(lastSync);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1">Assistant settings</h1>
          <p className="text-slate-600 text-sm">How your AI receptionist introduces itself and behaves on calls.</p>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </div>

      <PhoneSubNav />

      {saveResult && (
        <div className={mismatches.length ? 'text-sm text-warning bg-amber-50 rounded-lg px-3 py-2' : 'text-sm text-success bg-green-50 rounded-lg px-3 py-2'}>
          {saveResult}
        </div>
      )}

      {(lastSync || lastSyncMeta) && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">Advanced</summary>
          <div className="mt-2 space-y-1 pl-1">
            {lastSync && (
              <div>
                Vapi assistant ID: <span className="font-mono">{lastSync.vapi_assistant_id ?? 'none'}</span> · last checked{' '}
                {new Date(lastSync.completed_at ?? lastSync.requested_at).toLocaleString()}
              </div>
            )}
            {lastSyncMeta?.mappingCorrected && (
              <div>The assistant mapping was out of date and was corrected automatically during this sync.</div>
            )}
            {lastSyncMeta?.syncError && <div>Error: {lastSyncMeta.syncError}</div>}
            {mismatches.length > 0 && (
              <div>
                Fields that did not apply:
                <ul className="list-disc list-inside">
                  {mismatches.map((f) => (
                    <li key={f} className="font-mono">{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <section className="card space-y-3">
        <div>
          <label className="label">Assistant name</label>
          <input className="input" value={settings.name} onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">First message</label>
          <p className="text-xs text-slate-500 mb-1">The exact sentence Ava speaks when she answers — nothing else overrides this.</p>
          <textarea className="input" rows={2} value={settings.firstMessage} onChange={(e) => setSettings((s) => ({ ...s, firstMessage: e.target.value }))} />
        </div>
      </section>

      <section className="card space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Language</label>
            <select className="input" value={settings.language} onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}>
              <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option>
            </select>
          </div>
          <div>
            <label className="label">Fallback language</label>
            <input className="input" value={settings.fallbackLanguage} onChange={(e) => setSettings((s) => ({ ...s, fallbackLanguage: e.target.value }))} />
          </div>
          <div>
            <label className="label">Speaking speed</label>
            <input className="input" type="number" step="0.1" min="0.5" max="2" value={settings.speakingSpeed} onChange={(e) => setSettings((s) => ({ ...s, speakingSpeed: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Interruption sensitivity</label>
            <select className="input" value={settings.interruptionSensitivity} onChange={(e) => setSettings((s) => ({ ...s, interruptionSensitivity: e.target.value }))}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="label">Silence timeout (seconds)</label>
            <input className="input" type="number" value={settings.silenceTimeoutSeconds} onChange={(e) => setSettings((s) => ({ ...s, silenceTimeoutSeconds: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Call timeout (seconds)</label>
            <input className="input" type="number" value={settings.callTimeoutSeconds} onChange={(e) => setSettings((s) => ({ ...s, callTimeoutSeconds: Number(e.target.value) }))} />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label">Voicemail behavior</label>
          <select className="input max-w-xs" value={settings.voicemailBehavior} onChange={(e) => setSettings((s) => ({ ...s, voicemailBehavior: e.target.value }))}>
            <option value="leave_message">Leave a message</option>
            <option value="hang_up">Hang up</option>
            <option value="transfer">Transfer instead</option>
          </select>
        </div>
        {[
          ['recordCalls', 'Record calls'],
          ['collectTranscripts', 'Collect transcripts'],
          ['generateSummaries', 'Generate call summaries']
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={(settings as any)[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))} />
            {label}
          </label>
        ))}
      </section>

      <section className="card">
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={settings.advancedModeEnabled} onChange={(e) => setSettings((s) => ({ ...s, advancedModeEnabled: e.target.checked }))} />
          Advanced mode (edit raw system prompt)
        </label>
        {settings.advancedModeEnabled && (
          <textarea
            className="input font-mono text-xs"
            rows={6}
            value={settings.systemPromptOverride}
            onChange={(e) => setSettings((s) => ({ ...s, systemPromptOverride: e.target.value }))}
            placeholder="Additional instructions appended to the generated system prompt…"
          />
        )}
      </section>

      <div className="flex gap-3">
        <button className="btn-primary" onClick={save} disabled={saving || repairing}>{saving ? 'Saving…' : 'Save assistant settings'}</button>
        <button className="btn-secondary" onClick={repair} disabled={saving || repairing} title="Re-resolve the correct Vapi assistant and re-verify every field, without changing anything above">
          {repairing ? 'Checking…' : 'Repair connection'}
        </button>
      </div>
    </div>
  );
}

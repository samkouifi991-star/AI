'use client';

import { useEffect, useState } from 'react';

const DEFAULTS = {
  name: 'AI Receptionist',
  greeting: '',
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

export default function AssistantSettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [mismatches, setMismatches] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/phone/assistant-settings');
      const data = await res.json();
      if (data.settings) {
        setSettings({
          name: data.settings.name,
          greeting: data.settings.greeting ?? '',
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
      setLoading(false);
    }
    load();
  }, []);

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

    if (data.note) {
      setSaveResult(data.note);
    } else if (data.syncStatus === 'synced') {
      setSaveResult('Saved and confirmed on your live assistant — read back from Vapi and every field matched.');
    } else if (data.syncStatus === 'partial') {
      setSaveResult('Saved, but only some settings were confirmed applied — see below.');
      const failed = Object.entries(data.fieldResults ?? {})
        .filter(([, v]: any) => !v.match)
        .map(([k]) => k);
      setMismatches(failed);
    } else {
      setSaveResult(data.syncError ?? 'Saved, but syncing to the live assistant failed.');
    }
  }

  if (loading) return <div className="card max-w-2xl">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Assistant settings</h1>
        <p className="text-slate-600 text-sm">How your AI receptionist introduces itself and behaves on calls.</p>
      </div>

      {saveResult && (
        <div className={mismatches.length ? 'text-sm text-warning bg-amber-50 rounded-lg px-3 py-2' : 'text-sm text-success bg-green-50 rounded-lg px-3 py-2'}>
          {saveResult}
          {mismatches.length > 0 && (
            <ul className="list-disc list-inside mt-1 text-xs">
              {mismatches.map((f) => (
                <li key={f}>{f} did not apply as requested</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="card space-y-3">
        <div>
          <label className="label">Assistant name</label>
          <input className="input" value={settings.name} onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Greeting</label>
          <textarea className="input" rows={2} value={settings.greeting} onChange={(e) => setSettings((s) => ({ ...s, greeting: e.target.value }))} />
        </div>
        <div>
          <label className="label">First message</label>
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

      <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save assistant settings'}</button>
    </div>
  );
}

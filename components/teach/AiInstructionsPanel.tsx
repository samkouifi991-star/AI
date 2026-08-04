'use client';

import { useEffect, useState } from 'react';

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
  advancedModeEnabled: false,
  tone: 'friendly'
};

/**
 * "How should {aiName} behave?" — shared between onboarding's Teach-her
 * step and the permanent /teach page. Loads the full assistant_settings
 * row first and always POSTs it back in full (/api/phone/assistant-
 * settings does a plain upsert, not a merge) so editing tone here can
 * never blank out fields set elsewhere, like first message or voicemail
 * behavior. Reports the real PATCH -> GET -> compare sync outcome, never
 * a bare "Saved" as if the live assistant were updated on faith.
 */
export default function AiInstructionsPanel({ aiName }: { aiName: string }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/phone/assistant-settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setSettings({
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
            advancedModeEnabled: d.settings.advanced_mode_enabled,
            tone: d.tone ?? 'friendly'
          });
        } else {
          setSettings((s) => ({ ...s, tone: d.tone ?? 'friendly' }));
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    setResult(null);
    const res = await fetch('/api/phone/assistant-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    setSaving(false);
    if (data.syncStatus === 'synced') {
      setResult({ ok: true, message: `Saved — ${aiName} will follow these instructions on the next call.` });
    } else if (data.syncStatus === 'partial') {
      setResult({ ok: false, message: 'Saved to your account, but one or more settings did not confirm as applied on the live assistant.' });
    } else {
      setResult({ ok: false, message: `Saved to your account. This will take effect on ${aiName}'s live assistant once your phone number is fully connected.` });
    }
  }

  if (loading) return <div className="text-bp-ink-muted" style={{ fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', marginBottom: 6 }}>Tone</label>
        <select
          className="input"
          style={{ maxWidth: 260 }}
          value={settings.tone}
          onChange={(e) => setSettings((s) => ({ ...s, tone: e.target.value }))}
        >
          <option value="friendly">Warm and friendly</option>
          <option value="professional">Polished and professional</option>
          <option value="concise">Brief and to the point</option>
        </select>
      </div>

      <div>
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Priorities, special instructions, and things {aiName} must never say or invent
        </label>
        <textarea
          className="input"
          rows={6}
          placeholder={`e.g. "Always mention our happy hour from 4-6pm. Never quote a price for custom orders — say a team member will follow up. Never say we offer financing — we don't."`}
          value={settings.systemPromptOverride}
          onChange={(e) => setSettings((s) => ({ ...s, systemPromptOverride: e.target.value }))}
        />
        <p className="text-bp-ink-faint" style={{ fontSize: 11.5, marginTop: 4 }}>
          Added to the instructions {aiName} already follows — never a replacement for them.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save instructions'}</button>
        {result && <span className={result.ok ? 'text-success' : 'text-warning'} style={{ fontSize: 12.5 }}>{result.message}</span>}
      </div>
    </div>
  );
}

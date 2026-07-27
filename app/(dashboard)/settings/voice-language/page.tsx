'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { SUPPORTED_LANGUAGES } from '@/lib/language';

type Voice = {
  id: string;
  name: string;
  previewUrl: string | null;
  gender?: string;
  accent?: string;
  style?: string;
  languages?: string[];
  supportsMultilingual: boolean;
};

type Settings = {
  voice_provider: string;
  voice_id: string;
  voice_name: string | null;
  default_language: string;
  additional_languages: string[];
  auto_detect_language: boolean;
  confirm_before_switch: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  voice_provider: 'elevenlabs',
  voice_id: '',
  voice_name: null,
  default_language: 'en',
  additional_languages: [],
  auto_detect_language: false,
  confirm_before_switch: true
};

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

export default function VoiceLanguagePage() {
  const supabase = supabaseBrowser();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [providerName, setProviderName] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();
      if (!business) return;
      setBusinessId(business.id);

      const { data: existing } = await supabase
        .from('business_voice_settings')
        .select('*')
        .eq('business_id', business.id)
        .single();
      if (existing) setSettings(existing as Settings);

      await loadVoices((existing as Settings)?.voice_provider);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadVoices(providerKey?: string) {
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const url = providerKey ? `/api/voice/list?provider=${providerKey}` : '/api/voice/list';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load voices');
      setVoices(data.voices);
      setProviderName(data.providerName);
    } catch (err: any) {
      setVoiceError(err.message);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }

  async function playPreview(voice: Voice) {
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
          body: JSON.stringify({ provider: settings.voice_provider, voiceId: voice.id })
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
      setVoiceError('Could not play that preview.');
    } finally {
      setPreviewingId(null);
    }
  }

  function selectVoice(voice: Voice) {
    setSettings((s) => ({ ...s, voice_id: voice.id, voice_name: voice.name }));
  }

  function toggleAdditionalLanguage(code: string) {
    setSettings((s) => {
      const has = s.additional_languages.includes(code);
      return {
        ...s,
        additional_languages: has
          ? s.additional_languages.filter((c) => c !== code)
          : [...s.additional_languages, code]
      };
    });
  }

  const selectedVoice = voices.find((v) => v.id === settings.voice_id) ?? null;
  const requestedLanguages = [settings.default_language, ...settings.additional_languages];

  const compatibilityWarnings: string[] = [];
  if (selectedVoice) {
    const multiLanguageRequested = requestedLanguages.length > 1 || settings.auto_detect_language;

    if (multiLanguageRequested && !selectedVoice.supportsMultilingual) {
      compatibilityWarnings.push(
        `${selectedVoice.name} doesn't support multiple languages — it may not sound natural outside its base language. Choose a multilingual voice if you need more than one language.`
      );
    }

    if (selectedVoice.languages && selectedVoice.languages.length > 0) {
      const unsupported = requestedLanguages.filter((code) => !selectedVoice.languages!.includes(code));
      if (unsupported.length > 0) {
        const labels = unsupported.map((c) => SUPPORTED_LANGUAGES.find((l) => l.code === c)?.label ?? c);
        compatibilityWarnings.push(
          `${selectedVoice.name} doesn't list support for ${labels.join(', ')}. Calls in ${
            labels.length > 1 ? 'these languages' : 'this language'
          } may sound off.`
        );
      }
    }
  }

  async function handleTestConnection() {
    setConnectionStatus('testing');
    setConnectionMessage(null);
    try {
      const res = await fetch(`/api/voice/test-connection?provider=${settings.voice_provider}`, { method: 'POST' });
      const data = await res.json();
      setConnectionStatus(data.ok ? 'connected' : 'error');
      setConnectionMessage(data.message);
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionMessage(err.message ?? 'Could not reach the provider.');
    }
  }

  async function handleSyncVoice() {
    setSyncStatus('syncing');
    setSyncMessage(null);
    try {
      const res = await fetch('/api/voice/sync-assistant', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncStatus('error');
        setSyncMessage(data.error ?? 'Sync failed.');
        return;
      }
      setSyncStatus('synced');
      setSyncMessage(
        data.usedFallback
          ? 'Selected voice was unavailable — automatically synced the fallback voice instead.'
          : 'Voice synced to your live AI assistant.'
      );
    } catch (err: any) {
      setSyncStatus('error');
      setSyncMessage(err.message ?? 'Sync failed.');
    }
  }

  async function handleSave() {
    if (!businessId) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase.from('business_voice_settings').upsert(
      {
        business_id: businessId,
        voice_provider: settings.voice_provider,
        voice_id: settings.voice_id,
        voice_name: settings.voice_name,
        default_language: settings.default_language,
        additional_languages: settings.additional_languages,
        auto_detect_language: settings.auto_detect_language,
        confirm_before_switch: settings.confirm_before_switch,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'business_id' }
    );

    if (!error) {
      setSaved(true);
      // Save persists settings; syncing to the live assistant is now an
      // explicit, separate action (the Sync Voice button below) so the
      // owner can see connection/sync status distinctly from save status.
      await handleSyncVoice();
    }
    setSaving(false);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Voice and language</h1>
        <p className="text-slate-600 text-sm">
          Choose how your AI receptionist sounds and which languages it can speak.
        </p>
      </div>

      {saved && (
        <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">
          Saved. Your AI will use these settings on the next call.
        </div>
      )}

      <audio ref={audioRef} className="hidden" />

      <section className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-semibold">Voice</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Provider: {providerName || 'ElevenLabs'}</span>
            {connectionStatus === 'connected' && <span className="badge-success">Connected</span>}
            {connectionStatus === 'testing' && <span className="badge-warning">Testing…</span>}
            {connectionStatus === 'error' && <span className="badge-danger">Error</span>}
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Browse real voices from ElevenLabs and preview before choosing. The API key is never sent to
          the browser — every request here is made server-side.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={handleTestConnection} disabled={connectionStatus === 'testing'}>
            {connectionStatus === 'testing' ? 'Testing connection…' : 'Test connection'}
          </button>
          {connectionMessage && (
            <span className={connectionStatus === 'error' ? 'text-xs text-danger' : 'text-xs text-success'}>
              {connectionMessage}
            </span>
          )}
        </div>

        {voiceError && (
          <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-3">
            {voiceError} — check that ELEVENLABS_API_KEY is set in your server environment.
          </div>
        )}

        {loadingVoices ? (
          <div className="text-sm text-slate-500">Loading voices from ElevenLabs…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {voices.map((v) => {
              const active = settings.voice_id === v.id;
              return (
                <div
                  key={v.id}
                  className={`border rounded-lg p-3 flex items-center justify-between ${
                    active ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-slate-500">
                      {[v.gender, v.accent, v.style].filter(Boolean).join(' · ') || (v.supportsMultilingual ? 'Multilingual' : '')}
                    </div>
                    {v.languages && v.languages.length > 0 && (
                      <div className="text-[11px] text-slate-400 mt-0.5">Languages: {v.languages.join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1"
                      onClick={() => playPreview(v)}
                      disabled={previewingId === v.id}
                    >
                      {previewingId === v.id ? 'Loading…' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      className={active ? 'btn-primary text-xs px-2 py-1' : 'btn-secondary text-xs px-2 py-1'}
                      onClick={() => selectVoice(v)}
                    >
                      {active ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={handleSyncVoice} disabled={syncStatus === 'syncing' || !settings.voice_id}>
            {syncStatus === 'syncing' ? 'Syncing…' : 'Sync voice to assistant'}
          </button>
          {syncStatus === 'synced' && <span className="text-xs text-success">{syncMessage}</span>}
          {syncStatus === 'error' && <span className="text-xs text-danger">{syncMessage}</span>}
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-1">Language</h2>
        <p className="text-sm text-slate-600 mb-4">
          Your knowledge base stays in one language — the AI translates responses as needed.
        </p>

        <div className="mb-4">
          <label className="label">Default language</label>
          <select
            className="input max-w-xs"
            value={settings.default_language}
            onChange={(e) => setSettings((s) => ({ ...s, default_language: e.target.value }))}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="label">Additional languages</label>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.filter((l) => l.code !== settings.default_language).map((l) => {
              const on = settings.additional_languages.includes(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => toggleAdditionalLanguage(l.code)}
                  className={on ? 'badge-success' : 'badge-slate'}
                  style={{ cursor: 'pointer' }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            id="auto-detect"
            type="checkbox"
            checked={settings.auto_detect_language}
            onChange={(e) => setSettings((s) => ({ ...s, auto_detect_language: e.target.checked }))}
          />
          <label htmlFor="auto-detect" className="text-sm text-slate-600">
            Automatically detect the caller&apos;s language and respond in it
          </label>
        </div>

        {settings.auto_detect_language && (
          <div className="flex items-center gap-2 pl-6">
            <input
              id="confirm-switch"
              type="checkbox"
              checked={settings.confirm_before_switch}
              onChange={(e) => setSettings((s) => ({ ...s, confirm_before_switch: e.target.checked }))}
            />
            <label htmlFor="confirm-switch" className="text-sm text-slate-600">
              Ask the caller to confirm before switching languages mid-call
            </label>
          </div>
        )}

        {compatibilityWarnings.length > 0 && (
          <div className="mt-4 space-y-2">
            {compatibilityWarnings.map((w) => (
              <div key={w} className="text-sm text-warning bg-amber-50 rounded-lg px-3 py-2">
                {w}
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="btn-primary" onClick={handleSave} disabled={saving || !businessId}>
        {saving ? 'Saving…' : 'Save voice and language settings'}
      </button>
    </div>
  );
}

import { Voice, VoiceProvider } from '../types';

// ElevenLabs REST API: https://elevenlabs.io/docs/api-reference/voices/get-all
// GET /v1/voices, authenticated with header "xi-api-key".
// Multilingual models (eleven_multilingual_v2, eleven_turbo_v2_5) speak
// whatever language the input text is written in, so any voice from this
// vendor can be treated as multilingual-capable for our purposes as long as
// the assistant is configured to use one of those models — see
// vapi-assistant-config.example.json.
//
// This is the PRIMARY and default voice provider for Business Pilot AI
// (see lib/voice/index.ts — VOICE_PROVIDER defaults to 'elevenlabs').

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

interface ElevenLabsVoiceResponse {
  voice_id: string;
  name: string;
  preview_url: string | null;
  labels?: { gender?: string; accent?: string; description?: string; use_case?: string };
  verified_languages?: { language: string }[];
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly key = 'elevenlabs';
  readonly displayName = 'ElevenLabs';

  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
    this.apiKey = apiKey;
  }

  async listVoices(): Promise<Voice[]> {
    const res = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: { 'xi-api-key': this.apiKey }
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs voices request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { voices: ElevenLabsVoiceResponse[] };

    return data.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
      gender: v.labels?.gender,
      accent: v.labels?.accent,
      style: v.labels?.description ?? v.labels?.use_case,
      languages: v.verified_languages?.map((l) => l.language),
      supportsMultilingual: true
    }));
  }

  /**
   * Lightweight, cheap authenticated call used by the "Test Connection"
   * button — hits /v1/user (returns subscription/account info) rather than
   * /v1/voices, so a bad key is confirmed without pulling the whole catalog.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${ELEVENLABS_API_BASE}/user`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      if (res.status === 401) {
        return { ok: false, message: 'Invalid ElevenLabs API key.' };
      }
      if (!res.ok) {
        return { ok: false, message: `ElevenLabs returned ${res.status}.` };
      }
      return { ok: true, message: 'Connected to ElevenLabs.' };
    } catch (err: any) {
      return { ok: false, message: err.message ?? 'Could not reach ElevenLabs.' };
    }
  }
}


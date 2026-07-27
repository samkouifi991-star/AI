// The contract every voice/TTS vendor adapter must satisfy. The rest of the
// app — the Settings > Voice & Language page, the API route, and the call
// webhook — only ever talks to this interface, never to a vendor SDK
// directly. To add a new vendor: implement this interface in
// lib/voice/providers/<vendor>.ts, register it in lib/voice/index.ts, and
// add its API key to .env. Nothing else changes.
//
// See README section "Swapping voice providers" for the full walkthrough.

export interface Voice {
  id: string;              // vendor's voice id — this is what gets stored in
                            // business_voice_settings.voice_id
  name: string;
  previewUrl: string | null; // publicly playable audio sample, or null if the
                              // vendor doesn't expose one
  gender?: string;
  accent?: string;
  style?: string;           // vendor's description/use-case label, e.g. "warm, friendly"
  languages?: string[];     // ISO 639-1 codes this voice can speak, when the
                             // vendor exposes that (used to warn the owner if
                             // a selected voice doesn't support a language
                             // they've enabled)
  supportsMultilingual: boolean; // true if this voice auto-adapts to the
                                  // language of the text it's given (e.g.
                                  // ElevenLabs' multilingual models). This
                                  // determines whether language switching
                                  // mid-call is possible at all for this
                                  // voice — see lib/language.ts.
}

export interface VoicePreview {
  audio: Buffer;
  contentType: string; // e.g. 'audio/mpeg'
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface VoiceProvider {
  /** Machine key stored in business_voice_settings.voice_provider */
  readonly key: string;
  /** Display name shown in the Voice & Language settings page */
  readonly displayName: string;

  /** Fetches the current voice catalog from the vendor. Never mocked —
   * throws if the vendor's API call fails so the UI can show a real error
   * instead of silently falling back to fake data. */
  listVoices(): Promise<Voice[]>;

  /** Only needed for vendors that don't return a static preview_url (e.g.
   * OpenAI). Synthesizes a short real sample on demand. Vendors that already
   * provide previewUrl on each Voice can omit this — the UI just plays the
   * URL directly. */
  synthesizePreview?(voiceId: string, text: string): Promise<VoicePreview>;

  /** Backs the "Test Connection" button — a cheap authenticated call that
   * confirms the API key works without pulling the full voice catalog. */
  testConnection?(): Promise<ConnectionTestResult>;
}

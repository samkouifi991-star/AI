import { VoiceProvider } from './types';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs';
import { OpenAiVoiceProvider } from './providers/openai';

// ElevenLabs is the primary, default voice provider for Business Pilot AI.
//
// To add another vendor (e.g. PlayHT, Azure, Deepgram Aura, Cartesia):
//   1. Create lib/voice/providers/<vendor>.ts implementing VoiceProvider
//      (see types.ts for the contract).
//   2. Add one line to the registry map below.
//   3. Add the vendor's API key to .env.example and .env.local.
// Nothing in the Settings page, the API route, or the call webhook needs
// to change — they all depend on the VoiceProvider interface, not on any
// specific vendor.

type ProviderFactory = () => VoiceProvider;

const REGISTRY: Record<string, ProviderFactory> = {
  elevenlabs: () => new ElevenLabsVoiceProvider(process.env.ELEVENLABS_API_KEY!),
  openai: () => new OpenAiVoiceProvider(process.env.OPENAI_API_KEY!)
};

// Used by lib/vapi-assistant.ts if a business's saved voice_id no longer
// exists in the provider's catalog (deleted/renamed voice, etc.). Configured
// via ELEVENLABS_FALLBACK_VOICE_ID so it can be changed per-deployment
// without a code change — defaults to Rachel, a stock ElevenLabs voice
// that's virtually always available, if the env var isn't set.
export const FALLBACK_VOICE = {
  provider: 'elevenlabs',
  voiceId: process.env.ELEVENLABS_FALLBACK_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
};

/** All providers registered in this deployment, used to populate a vendor
 * switcher in the Settings UI if you want to let businesses pick between
 * multiple vendors rather than one fixed default. */
export function availableProviderKeys(): string[] {
  return Object.keys(REGISTRY);
}

/** Returns the provider for a given key (falls back to the deployment
 * default in VOICE_PROVIDER — ElevenLabs — if no key is passed). Throws a
 * clear error for an unregistered key rather than silently returning a
 * default — a wrong key should never be masked as an implicit choice. */
export function getVoiceProvider(providerKey?: string): VoiceProvider {
  const key = providerKey ?? process.env.VOICE_PROVIDER ?? 'elevenlabs';
  const factory = REGISTRY[key];
  if (!factory) {
    throw new Error(
      `Unknown voice provider "${key}". Registered providers: ${availableProviderKeys().join(', ')}`
    );
  }
  return factory();
}

import { supabaseServiceRole } from './supabase/admin';
import { getVoiceProvider, FALLBACK_VOICE } from './voice';
import { logger } from './logger';
import { VAPI_TOOLS } from './vapi-tools';

const VAPI_API_BASE = 'https://api.vapi.ai';

function vapiHeaders() {
  if (!process.env.VAPI_API_KEY) throw new Error('VAPI_API_KEY is not configured');
  return { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' };
}

/**
 * Creates a brand-new Vapi assistant for a business — used the first time
 * a business provisions a number (buy or import), rather than assuming one
 * already exists. Returns the real Vapi assistant id.
 */
export async function createAssistant(params: {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceProvider: string;
  voiceId: string;
  serverUrl: string;
  serverUrlSecret: string;
}): Promise<{ assistantId: string } | { error: string }> {
  try {
    const res = await fetch(`${VAPI_API_BASE}/assistant`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify({
        name: params.name,
        firstMessage: params.firstMessage,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          systemPrompt: params.systemPrompt,
          functions: VAPI_TOOLS
        },
        voice: { provider: params.voiceProvider, voiceId: params.voiceId, model: 'eleven_multilingual_v2' },
        serverUrl: params.serverUrl,
        serverUrlSecret: params.serverUrlSecret
      })
    });
    if (!res.ok) return { error: `Vapi assistant creation failed: ${res.status} ${await res.text()}` };
    const data = await res.json();
    return { assistantId: data.id };
  } catch (err: any) {
    logger.error('vapi_create_assistant_failed', { message: err.message });
    return { error: err.message ?? 'Could not reach Vapi' };
  }
}

/**
 * Imports a Twilio number (platform-purchased or BYO) into Vapi and
 * attaches it to an assistant — this is what actually makes the number
 * ring the AI. Requires the Twilio Account SID and Auth Token so Vapi can
 * take over the number's call handling on Twilio's side; for BYO numbers,
 * the auth token is decrypted just before this call and never persisted
 * outside the encrypted column.
 */
export async function importTwilioNumberToVapi(params: {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  assistantId: string;
}): Promise<{ vapiPhoneNumberId: string } | { error: string }> {
  try {
    const res = await fetch(`${VAPI_API_BASE}/phone-number`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify({
        provider: 'twilio',
        number: params.twilioPhoneNumber,
        twilioAccountSid: params.twilioAccountSid,
        twilioAuthToken: params.twilioAuthToken,
        assistantId: params.assistantId
      })
    });
    if (!res.ok) return { error: `Vapi phone import failed: ${res.status} ${await res.text()}` };
    const data = await res.json();
    return { vapiPhoneNumberId: data.id };
  } catch (err: any) {
    logger.error('vapi_import_number_failed', { message: err.message });
    return { error: err.message ?? 'Could not reach Vapi' };
  }
}

/** Detaches/deletes a Vapi phone-number resource — used to roll back a
 * provisioning job that failed partway through. */
export async function deleteVapiPhoneNumber(vapiPhoneNumberId: string): Promise<void> {
  try {
    await fetch(`${VAPI_API_BASE}/phone-number/${vapiPhoneNumberId}`, { method: 'DELETE', headers: vapiHeaders() });
  } catch (err: any) {
    logger.error('vapi_delete_number_rollback_failed', { vapiPhoneNumberId, message: err.message });
  }
}

/** Deletes a Vapi assistant — used to roll back assistant creation if a
 * later provisioning step fails. */
export async function deleteAssistant(assistantId: string): Promise<void> {
  try {
    await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, { method: 'DELETE', headers: vapiHeaders() });
  } catch (err: any) {
    logger.error('vapi_delete_assistant_rollback_failed', { assistantId, message: err.message });
  }
}

/**
 * Pushes the customer-facing assistant_settings (greeting, first message,
 * language, speaking speed, etc.) to the real Vapi assistant. Called from
 * the Assistant Settings page's Save action.
 */
export async function syncAssistantSettings(
  assistantId: string,
  settings: {
    name: string;
    firstMessage?: string | null;
    language: string;
    speakingSpeed: number;
    silenceTimeoutSeconds: number;
    voicemailBehavior: string;
    recordCalls: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: vapiHeaders(),
      body: JSON.stringify({
        name: settings.name,
        firstMessage: settings.firstMessage ?? undefined,
        voicemailMessage: settings.voicemailBehavior === 'leave_message' ? settings.firstMessage : undefined,
        silenceTimeoutSeconds: settings.silenceTimeoutSeconds,
        recordingEnabled: settings.recordCalls,
        transcriber: { language: settings.language }
      })
    });
    if (!res.ok) return { ok: false, error: `Vapi update failed: ${res.status} ${await res.text()}` };
    return { ok: true };
  } catch (err: any) {
    logger.error('vapi_sync_assistant_settings_failed', { assistantId, message: err.message });
    return { ok: false, error: err.message ?? 'Could not reach Vapi' };
  }
}

/**
 * Pushes the business's currently saved voice settings to its provisioned
 * Vapi assistant, so the change takes effect on the very next call. Call
 * this after saving to business_voice_settings.
 *
 * Requires businesses.vapi_assistant_id to be set, OR falls back to the
 * deployment-wide VAPI_ASSISTANT_ID env var — useful for staging/testing
 * with a single shared assistant before per-business provisioning exists.
 *
 * Before syncing, this re-checks the voice against the live provider
 * catalog. If it's no longer available (deleted, renamed, account changed),
 * it automatically substitutes FALLBACK_VOICE and updates
 * business_voice_settings to match, so a call is never left without a
 * valid voice configured.
 */
export async function syncAssistantVoice(
  businessId: string
): Promise<{ ok: boolean; error?: string; usedFallback?: boolean }> {
  const supabase = supabaseServiceRole();

  let assistantId: string | undefined;
  try {
    const { data: business, error } = await supabase
      .from('businesses')
      .select('vapi_assistant_id')
      .eq('id', businessId)
      .single();
    if (error) throw error;
    assistantId = business?.vapi_assistant_id ?? process.env.VAPI_ASSISTANT_ID;
  } catch (err: any) {
    logger.error('vapi_sync_supabase_lookup_failed', { businessId, message: err.message });
    return { ok: false, error: 'Could not look up the business record.' };
  }

  if (!assistantId) {
    return {
      ok: false,
      error: 'No Vapi assistant provisioned for this business yet, and no VAPI_ASSISTANT_ID fallback is set.'
    };
  }

  let voiceSettings: { voice_provider: string; voice_id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from('business_voice_settings')
      .select('voice_provider, voice_id')
      .eq('business_id', businessId)
      .single();
    if (error) throw error;
    voiceSettings = data;
  } catch (err: any) {
    logger.error('vapi_sync_voice_settings_lookup_failed', { businessId, message: err.message });
    return { ok: false, error: 'Could not load saved voice settings.' };
  }

  if (!voiceSettings) {
    return { ok: false, error: 'No voice settings saved yet.' };
  }

  let { voice_provider: provider, voice_id: voiceId } = voiceSettings;
  let usedFallback = false;

  try {
    const liveProvider = getVoiceProvider(provider);
    const catalog = await liveProvider.listVoices();
    const stillExists = catalog.some((v) => v.id === voiceId);
    if (!stillExists) {
      const previousVoiceId = voiceId;
      provider = FALLBACK_VOICE.provider;
      voiceId = FALLBACK_VOICE.voiceId;
      usedFallback = true;
      logger.warn('vapi_sync_voice_fallback_used', { businessId, previousVoiceId });
      await supabase
        .from('business_voice_settings')
        .update({ voice_provider: provider, voice_id: voiceId, voice_name: 'Fallback voice' })
        .eq('business_id', businessId);
    }
  } catch (err: any) {
    // If the catalog check itself fails (provider outage), proceed with the
    // saved voice as-is rather than blocking the sync entirely.
    logger.warn('vapi_sync_catalog_check_failed', { businessId, message: err.message });
  }

  try {
    const res = await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        voice: {
          provider,
          voiceId,
          model: 'eleven_multilingual_v2' // ignored by vendors that don't use it; keeps multilingual playback for 11labs
        }
      })
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('vapi_sync_patch_failed', { businessId, status: res.status });
      return { ok: false, error: `Vapi update failed: ${res.status} ${text}` };
    }

    return { ok: true, usedFallback };
  } catch (err: any) {
    logger.error('vapi_sync_network_error', { businessId, message: err.message });
    return { ok: false, error: 'Could not reach Vapi — check network connectivity and VAPI_API_KEY.' };
  }
}

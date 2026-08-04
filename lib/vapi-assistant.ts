import { supabaseServiceRole } from './supabase/admin';
import { getVoiceProvider, FALLBACK_VOICE } from './voice';
import { logger } from './logger';
import { VAPI_TOOLS, buildSystemPrompt } from './vapi-tools';

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
  businessId: string;
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
        // Attached to every call this assistant handles as call.metadata —
        // this is how the webhook (app/api/vapi/webhook/route.ts) knows
        // which business a live call belongs to. Previously never sent,
        // which meant call.metadata.businessId was always undefined and
        // every tool call failed with "Missing business context."
        metadata: { businessId: params.businessId },
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          messages: [{ role: 'system', content: params.systemPrompt }],
          functions: VAPI_TOOLS
        },
        voice: { provider: params.voiceProvider, voiceId: params.voiceId, model: 'eleven_multilingual_v2' },
        // Lets Ava end the call herself once she's confirmed the order/booking
        // or the caller says goodbye, instead of sitting on the line silently.
        endCallFunctionEnabled: true,
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
  businessId: string;
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
        assistantId: params.assistantId,
        // Same reasoning as createAssistant()'s metadata — belt-and-suspenders
        // in case Vapi sources call.metadata from the phone-number resource
        // rather than (or in addition to) the assistant resource.
        metadata: { businessId: params.businessId }
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

type FieldResult = { expected: unknown; applied: unknown; match: boolean };
type SyncResult = {
  ok: boolean;
  status: 'synced' | 'partial' | 'failed';
  assistantId?: string;
  mappingCorrected?: boolean;
  fieldResults?: Record<string, FieldResult>;
  error?: string;
};

type MappingResult =
  | { ok: true; assistantId: string; source: 'phone_number' | 'business_record'; corrected: boolean }
  | { ok: false; reason: string };

/**
 * Determines which Vapi assistant actually answers calls for this business,
 * treating the phone number's real, live-on-Vapi assistantId as ground
 * truth rather than trusting businesses.vapi_assistant_id blindly. If the
 * two disagree (or our record is empty), this adopts whatever Vapi's phone
 * number is really attached to and corrects our own tables to match —
 * because a caller getting the wrong assistant is a mapping bug, not a
 * reason to spin up a duplicate assistant.
 */
export async function resolveAssistantMapping(businessId: string): Promise<MappingResult> {
  const supabase = supabaseServiceRole();

  const { data: business } = await supabase.from('businesses').select('vapi_assistant_id').eq('id', businessId).single();
  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('id, vapi_phone_number_id, vapi_assistant_id')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .maybeSingle();

  if (!phoneRow?.vapi_phone_number_id) {
    if (business?.vapi_assistant_id) {
      return { ok: true, assistantId: business.vapi_assistant_id, source: 'business_record', corrected: false };
    }
    return { ok: false, reason: 'No active phone number or assistant is provisioned for this business yet.' };
  }

  try {
    const res = await fetch(`${VAPI_API_BASE}/phone-number/${phoneRow.vapi_phone_number_id}`, { headers: vapiHeaders() });
    if (!res.ok) return { ok: false, reason: `Could not read the phone number from Vapi: ${res.status} ${await res.text()}` };

    const data = await res.json();
    const liveAssistantId: string | undefined = data.assistantId;

    if (!liveAssistantId) {
      if (business?.vapi_assistant_id) {
        return { ok: true, assistantId: business.vapi_assistant_id, source: 'business_record', corrected: false };
      }
      return { ok: false, reason: 'Vapi reports no assistant attached to this phone number, and none is on record either.' };
    }

    const corrected = business?.vapi_assistant_id !== liveAssistantId || phoneRow.vapi_assistant_id !== liveAssistantId;
    if (corrected) {
      logger.warn('vapi_assistant_mapping_corrected', {
        businessId,
        previousBusinessAssistantId: business?.vapi_assistant_id,
        previousPhoneAssistantId: phoneRow.vapi_assistant_id,
        liveAssistantId
      });
      await supabase.from('businesses').update({ vapi_assistant_id: liveAssistantId }).eq('id', businessId);
      await supabase.from('phone_numbers').update({ vapi_assistant_id: liveAssistantId }).eq('id', phoneRow.id);
    }

    return { ok: true, assistantId: liveAssistantId, source: 'phone_number', corrected };
  } catch (err: any) {
    logger.error('vapi_resolve_mapping_failed', { businessId, message: err.message });
    return { ok: false, reason: err.message ?? 'Could not reach Vapi' };
  }
}

/**
 * The real gate for businesses.is_live. Onboarding's "Go live" button
 * previously set is_live=true purely because the client said it had
 * reached the final wizard step — with no server-side check that a phone
 * number or assistant actually existed, let alone that they were verified
 * connected. This requires an active phone number, a resolvable assistant,
 * and a completed sync whose read-back actually matched.
 */
export async function verifyReadyForLive(businessId: string): Promise<{ ready: true } | { ready: false; reason: string }> {
  const supabase = supabaseServiceRole();

  const mapping = await resolveAssistantMapping(businessId);
  if (!mapping.ok) {
    return { ready: false, reason: `No connected phone number and assistant yet (${mapping.reason})` };
  }

  const { data: phoneRow } = await supabase
    .from('phone_numbers')
    .select('vapi_phone_number_id')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .maybeSingle();
  if (!phoneRow?.vapi_phone_number_id) {
    return { ready: false, reason: 'No active phone number is connected to Vapi yet.' };
  }

  const { data: lastSync } = await supabase
    .from('assistant_sync_status')
    .select('status, completed_at')
    .eq('business_id', businessId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSync || lastSync.status !== 'synced') {
    return {
      ready: false,
      reason:
        lastSync?.status === 'partial'
          ? 'Your assistant settings were only partially confirmed on Vapi — open Assistant Settings and use Sync with Vapi.'
          : 'Your assistant settings have not been confirmed on Vapi yet — open Assistant Settings and save, or use Sync with Vapi.'
    };
  }

  return { ready: true };
}

/** Flattens a nested config object into dotted-path keys for comparison (arrays are left as leaf values). */
function flattenConfig(obj: Record<string, any>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenConfig(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

function compareConfigs(expected: Record<string, any>, applied: Record<string, any>): Record<string, FieldResult> {
  const flatExpected = flattenConfig(expected);
  const flatApplied = flattenConfig(applied ?? {});
  const results: Record<string, FieldResult> = {};
  for (const [key, expectedValue] of Object.entries(flatExpected)) {
    const appliedValue = flatApplied[key];
    results[key] = { expected: expectedValue, applied: appliedValue, match: JSON.stringify(expectedValue) === JSON.stringify(appliedValue) };
  }
  return results;
}

/**
 * Pushes every supported setting (assistant_settings + business_voice_settings
 * + the generated system prompt/tools) to the real Vapi assistant, then reads
 * the assistant back and compares what Vapi actually applied against what
 * was requested, field by field. An HTTP 200 from the PATCH is never treated
 * as proof the settings took — 'synced' vs 'partial' vs 'failed' is decided
 * entirely from the GET response, and every attempt is recorded in
 * assistant_sync_status (migration 0009) whether it succeeds or not.
 *
 * Nested objects (voice, model) are always sent in full, never as a partial
 * patch — e.g. changing only speaking speed still sends the full voice
 * object (provider + voiceId + speed), because Vapi's PATCH replaces a
 * nested object wholesale when the key is present; sending {speed} alone
 * would silently blank out the provider/voiceId already configured.
 */
export async function syncAssistantSettings(businessId: string): Promise<SyncResult> {
  const supabase = supabaseServiceRole();

  // Ground-truth resolution first — never blindly trust businesses.vapi_assistant_id.
  const mapping = await resolveAssistantMapping(businessId);
  if (!mapping.ok) {
    return { ok: false, status: 'failed', error: mapping.reason };
  }
  const assistantId = mapping.assistantId;
  const mappingCorrected = mapping.corrected;

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, service_area')
    .eq('id', businessId)
    .single();

  if (!business) return { ok: false, status: 'failed', error: 'Business not found.' };

  const { data: settings } = await supabase.from('assistant_settings').select('*').eq('business_id', businessId).single();
  const { data: voiceSettings } = await supabase
    .from('business_voice_settings')
    .select('voice_provider, voice_id')
    .eq('business_id', businessId)
    .single();
  const { data: routingRules } = await supabase
    .from('call_routing_rules')
    .select('transfer_on_customer_request, urgent_transfer_enabled, voicemail_fallback_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
    .eq('business_id', businessId)
    .maybeSingle();
  const { data: employeeSettings } = await supabase.from('ai_employee_settings').select('tone').eq('business_id', businessId).maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const basePrompt = buildSystemPrompt(
    business,
    {
      transferOnCustomerRequest: routingRules?.transfer_on_customer_request,
      urgentTransferEnabled: routingRules?.urgent_transfer_enabled,
      voicemailFallbackEnabled: routingRules?.voicemail_fallback_enabled,
      quietHoursEnabled: routingRules?.quiet_hours_enabled,
      quietHoursStart: routingRules?.quiet_hours_start,
      quietHoursEnd: routingRules?.quiet_hours_end
    },
    employeeSettings?.tone
  );
  const fullPrompt = settings?.system_prompt_override ? `${basePrompt}\n\n${settings.system_prompt_override}` : basePrompt;

  // First message is the one sentence Vapi actually speaks when answering.
  // The separate "greeting" field is never sent to Vapi and has no runtime
  // effect — first_message is the single source of truth for what's spoken.
  const expectedConfig: Record<string, any> = {
    name: settings?.name ?? `${business.name} Receptionist`,
    firstMessage: settings?.first_message || `Thanks for calling ${business.name} — how can I help you today?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [{ role: 'system', content: fullPrompt }],
      functions: VAPI_TOOLS
    },
    voice: {
      provider: voiceSettings?.voice_provider ?? FALLBACK_VOICE.provider,
      voiceId: voiceSettings?.voice_id ?? FALLBACK_VOICE.voiceId,
      model: 'eleven_multilingual_v2',
      speed: settings?.speaking_speed ?? 1.0
    },
    silenceTimeoutSeconds: settings?.silence_timeout_seconds ?? 10,
    maxDurationSeconds: settings?.call_timeout_seconds ?? 1800,
    recordingEnabled: settings?.record_calls ?? true,
    transcriber: { language: settings?.language ?? 'en' },
    endCallFunctionEnabled: true,
    serverUrl: `${appUrl}/api/vapi/webhook`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET ?? ''
  };

  if (settings?.voicemail_behavior === 'leave_message' && settings?.first_message) {
    expectedConfig.voicemailMessage = settings.first_message;
  }

  const { data: syncRow } = await supabase
    .from('assistant_sync_status')
    .insert({ business_id: businessId, vapi_assistant_id: assistantId, status: 'pending', expected_config: expectedConfig })
    .select('id')
    .single();

  async function fail(error: string): Promise<SyncResult> {
    if (syncRow) {
      await supabase
        .from('assistant_sync_status')
        .update({ status: 'failed', error_message: error, completed_at: new Date().toISOString() })
        .eq('id', syncRow.id);
    }
    return { ok: false, status: 'failed', error, assistantId, mappingCorrected };
  }

  try {
    const patchRes = await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: vapiHeaders(),
      body: JSON.stringify(expectedConfig)
    });

    if (!patchRes.ok) {
      return fail(`Vapi update failed: ${patchRes.status} ${await patchRes.text()}`);
    }

    // Never trust the PATCH's 200 alone — read the assistant back and
    // compare what was actually applied.
    const getRes = await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, { headers: vapiHeaders() });
    if (!getRes.ok) {
      return fail(`Settings were sent, but could not be read back to verify: ${getRes.status} ${await getRes.text()}`);
    }

    const applied = await getRes.json();
    const fieldResults = compareConfigs(expectedConfig, applied);

    // Confirm the phone number itself still points at this exact assistant —
    // a separate, explicit check rather than assuming the assistant PATCH
    // implies the phone-number-to-assistant link is also correct.
    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('vapi_phone_number_id')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle();
    if (phoneRow?.vapi_phone_number_id) {
      try {
        const phoneRes = await fetch(`${VAPI_API_BASE}/phone-number/${phoneRow.vapi_phone_number_id}`, { headers: vapiHeaders() });
        const phoneData = phoneRes.ok ? await phoneRes.json() : null;
        fieldResults['phoneNumber.assistantId'] = {
          expected: assistantId,
          applied: phoneData?.assistantId ?? null,
          match: phoneData?.assistantId === assistantId
        };
      } catch {
        fieldResults['phoneNumber.assistantId'] = { expected: assistantId, applied: null, match: false };
      }
    }

    const matches = Object.values(fieldResults).map((f) => f.match);
    const status: SyncResult['status'] = matches.every(Boolean) ? 'synced' : matches.some(Boolean) ? 'partial' : 'failed';

    if (syncRow) {
      await supabase
        .from('assistant_sync_status')
        .update({ status, applied_config: applied, field_results: fieldResults, completed_at: new Date().toISOString() })
        .eq('id', syncRow.id);
    }

    return { ok: status !== 'failed', status, assistantId, mappingCorrected, fieldResults };
  } catch (err: any) {
    logger.error('vapi_sync_assistant_settings_failed', { businessId, message: err.message });
    return fail(err.message ?? 'Could not reach Vapi');
  }
}

/**
 * Re-checks the business's saved voice against the live provider catalog
 * before syncing. If it's no longer available (deleted, renamed, account
 * changed), automatically substitutes FALLBACK_VOICE and updates
 * business_voice_settings to match, so a call is never left without a
 * valid voice configured. Then delegates the actual push-and-verify to
 * syncAssistantSettings(), which sends the full voice object (provider +
 * voiceId + speed) rather than a partial one — call this after saving to
 * business_voice_settings.
 */
export async function syncAssistantVoice(
  businessId: string
): Promise<{ ok: boolean; error?: string; usedFallback?: boolean }> {
  const supabase = supabaseServiceRole();

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

  const { voice_provider: provider, voice_id: voiceId } = voiceSettings;
  let usedFallback = false;

  try {
    const liveProvider = getVoiceProvider(provider);
    const catalog = await liveProvider.listVoices();
    const stillExists = catalog.some((v) => v.id === voiceId);
    if (!stillExists) {
      usedFallback = true;
      logger.warn('vapi_sync_voice_fallback_used', { businessId, previousVoiceId: voiceId });
      await supabase
        .from('business_voice_settings')
        .update({ voice_provider: FALLBACK_VOICE.provider, voice_id: FALLBACK_VOICE.voiceId, voice_name: 'Fallback voice' })
        .eq('business_id', businessId);
    }
  } catch (err: any) {
    // If the catalog check itself fails (provider outage), proceed with the
    // saved voice as-is rather than blocking the sync entirely.
    logger.warn('vapi_sync_catalog_check_failed', { businessId, message: err.message });
  }

  const result = await syncAssistantSettings(businessId);
  return { ok: result.ok, error: result.error, usedFallback };
}

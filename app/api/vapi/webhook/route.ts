import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { translateText } from '@/lib/language';
import { dispatchTool } from '@/lib/ava-dispatcher';
import { checkDuplicateWebhook, recordWebhookResponse } from '@/lib/webhook-dedup';
import { logger } from '@/lib/logger';

/**
 * Single webhook that Vapi (or Retell/Bland) calls for:
 *  1. Tool/function calls made mid-conversation ("check_availability", etc.)
 *  2. End-of-call reports (transcript, recording, summary)
 *
 * Verify the shared secret Vapi sends so this endpoint can't be spoofed.
 * Every delivery is deduplicated by a hash of the raw body (see
 * lib/webhook-dedup.ts) — a retried delivery replays the first response
 * rather than re-running side effects.
 */
function verifyWebhookSecret(req: NextRequest): boolean {
  const provided = req.headers.get('x-vapi-secret');
  return provided === process.env.VAPI_WEBHOOK_SECRET;
}

type ResolutionSource = 'vapi_phone_number_id' | 'vapi_assistant_id' | 'dialed_number' | 'metadata';
type BusinessResolution =
  | { businessId: string; sources: Partial<Record<ResolutionSource, string | null>> }
  | { conflict: true; sources: Partial<Record<ResolutionSource, string | null>> }
  | { businessId: null };

/**
 * Resolves which business a live call belongs to, in a fixed trust order —
 * never guessing when sources disagree:
 *   1. Vapi's own phone-number resource id (the literal resource that
 *      answered) — most authoritative.
 *   2. Vapi's assistant id.
 *   3. The literal dialed number, looked up in our own phone_numbers table.
 *   4. call.metadata.businessId — a consistency check only, never primary,
 *      since metadata correctness depends on Vapi propagating what we sent
 *      at provisioning time.
 * If two sources that both resolved disagree, this is a real configuration
 * bug (a number or assistant pointing at the wrong business) — the caller
 * must stop and surface a configuration error rather than picking one.
 */
async function resolveBusinessId(call: any, supabase: ReturnType<typeof supabaseServiceRole>): Promise<BusinessResolution> {
  const sources: Partial<Record<ResolutionSource, string | null>> = {};

  const vapiPhoneNumberId: string | undefined = call?.phoneNumberId ?? call?.phoneNumber?.id;
  if (vapiPhoneNumberId) {
    const { data } = await supabase.from('phone_numbers').select('business_id').eq('vapi_phone_number_id', vapiPhoneNumberId).maybeSingle();
    sources.vapi_phone_number_id = data?.business_id ?? null;
  }

  const vapiAssistantId: string | undefined = call?.assistantId ?? call?.assistant?.id;
  if (vapiAssistantId) {
    const { data } = await supabase.from('businesses').select('id').eq('vapi_assistant_id', vapiAssistantId).maybeSingle();
    sources.vapi_assistant_id = data?.id ?? null;
  }

  const dialedNumber: string | undefined = call?.phoneNumber?.number;
  if (dialedNumber) {
    const { data } = await supabase
      .from('phone_numbers')
      .select('business_id')
      .eq('phone_number', dialedNumber)
      .eq('status', 'active')
      .maybeSingle();
    sources.dialed_number = data?.business_id ?? null;
  }

  const metadataBusinessId: string | undefined = call?.metadata?.businessId;
  if (metadataBusinessId) sources.metadata = metadataBusinessId;

  const resolvedIds = Object.values(sources).filter((v): v is string => !!v);
  const distinctIds = Array.from(new Set(resolvedIds));

  if (distinctIds.length > 1) {
    logger.error('vapi_webhook_business_resolution_conflict', {
      vapiPhoneNumberId,
      vapiAssistantId,
      dialedNumber,
      sourcesJson: JSON.stringify(sources)
    });
    return { conflict: true, sources };
  }

  if (distinctIds.length === 1) return { businessId: distinctIds[0], sources };
  return { businessId: null };
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rawBody = await req.text();
  const body = JSON.parse(rawBody);
  const supabase = supabaseServiceRole();

  // Vapi sends { message: { type: 'function-call' | 'end-of-call-report' | ..., ... } }
  const message = body.message ?? body;
  const resolution = await resolveBusinessId(message?.call, supabase);
  const businessId = 'businessId' in resolution ? resolution.businessId : null;

  const dedup = await checkDuplicateWebhook(rawBody, message.type ?? 'unknown', businessId);
  if (dedup.isDuplicate) {
    return NextResponse.json(dedup.response.body, { status: dedup.response.status ?? 200 });
  }

  if (businessId) {
    await supabase
      .from('webhook_status')
      .upsert(
        { business_id: businessId, webhook_type: 'vapi', last_received_at: new Date().toISOString(), last_status: 'ok', failure_count: 0 },
        { onConflict: 'business_id,webhook_type' }
      );
  }

  let status = 200;
  let responseBody: any;

  if ('conflict' in resolution) {
    // Never guess: a caller getting routed to the wrong business's menu or
    // knowledge is worse than a call that fails loudly and gets escalated.
    status = 409;
    responseBody = { result: "I'm having a technical issue reaching your account — I'll have someone call you back." };
  } else {
    switch (message.type) {
      case 'function-call': {
        const outcome = await handleFunctionCall(message, businessId, supabase);
        status = outcome.status;
        responseBody = outcome.body;
        break;
      }
      case 'end-of-call-report': {
        const outcome = await handleEndOfCall(message, businessId, supabase);
        status = outcome.status;
        responseBody = outcome.body;
        break;
      }
      default:
        responseBody = { ok: true };
    }
  }

  await recordWebhookResponse(dedup.recordId, { status, body: responseBody });
  return NextResponse.json(responseBody, { status });
}

async function handleFunctionCall(
  message: any,
  businessId: string | null,
  supabase: ReturnType<typeof supabaseServiceRole>
): Promise<{ status: number; body: any }> {
  const { functionCall, call } = message;
  const name: string = functionCall?.name;
  const params = functionCall?.parameters ?? {};
  const callRowId: string | undefined = call?.metadata?.callRowId;

  if (!businessId) {
    return { status: 400, body: { result: 'Missing business context.' } };
  }

  const result = await dispatchTool(name, params, { businessId, mode: 'live', callId: callRowId ?? null, providerCallId: call?.id ?? null });
  return { status: 200, body: result };
}

async function handleEndOfCall(
  message: any,
  businessId: string | null,
  supabase: ReturnType<typeof supabaseServiceRole>
): Promise<{ status: number; body: any }> {
  const { call, transcript, recordingUrl, summary } = message;
  const callRowId: string = call?.metadata?.callRowId;

  if (!businessId) return { status: 200, body: { ok: true } };

  let finalLanguage = 'en';
  if (callRowId) {
    const { data: existing } = await supabase
      .from('calls')
      .select('active_language, detected_language')
      .eq('id', callRowId)
      .single();
    finalLanguage = existing?.active_language ?? existing?.detected_language ?? 'en';
  }

  // Vapi always sends whatever it recorded/summarized regardless of our
  // settings — collect_transcripts/generate_summaries are honored here,
  // on our side, since Vapi has no per-toggle we can confidently PATCH for
  // this without risking malforming the whole assistant config.
  const { data: settings } = await supabase
    .from('assistant_settings')
    .select('collect_transcripts, generate_summaries')
    .eq('business_id', businessId)
    .maybeSingle();
  const collectTranscripts = settings?.collect_transcripts ?? true;
  const generateSummaries = settings?.generate_summaries ?? true;

  const keptTranscript = collectTranscripts ? transcript : null;
  const translatedTranscript = keptTranscript && finalLanguage !== 'en' ? await translateText(keptTranscript, 'en') : null;

  const updatePayload = {
    status: 'completed',
    transcript: keptTranscript,
    translated_transcript: translatedTranscript,
    recording_url: recordingUrl,
    summary: generateSummaries ? summary : null,
    ended_at: new Date().toISOString()
  };

  if (callRowId) {
    await supabase.from('calls').update(updatePayload).eq('id', callRowId);
  } else {
    // Upserted on provider_call_id (unique index, migration 0020) rather
    // than a blind insert — an end-of-call-report without a callRowId
    // (metadata didn't round-trip) could otherwise create a second row
    // for a call the Twilio-forwarding fallback already logged under the
    // same provider call id. Unlike the call-start upsert, this one
    // should win on conflict — it carries the authoritative final state.
    await supabase.from('calls').upsert(
      {
        business_id: businessId,
        provider_call_id: call?.id,
        from_number: call?.customer?.number,
        to_number: call?.phoneNumber?.number,
        active_language: finalLanguage,
        ...updatePayload
      },
      { onConflict: 'provider_call_id' }
    );
  }

  return { status: 200, body: { ok: true } };
}

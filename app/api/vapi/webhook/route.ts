import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { translateText } from '@/lib/language';
import { dispatchTool } from '@/lib/ava-dispatcher';
import { checkDuplicateWebhook, recordWebhookResponse } from '@/lib/webhook-dedup';

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

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rawBody = await req.text();
  const body = JSON.parse(rawBody);
  const supabase = supabaseServiceRole();

  // Vapi sends { message: { type: 'function-call' | 'end-of-call-report' | ..., ... } }
  const message = body.message ?? body;
  const businessIdForStatus: string | undefined = message?.call?.metadata?.businessId;

  const dedup = await checkDuplicateWebhook(rawBody, message.type ?? 'unknown', businessIdForStatus ?? null);
  if (dedup.isDuplicate) {
    return NextResponse.json(dedup.response.body, { status: dedup.response.status ?? 200 });
  }

  if (businessIdForStatus) {
    await supabase
      .from('webhook_status')
      .upsert(
        { business_id: businessIdForStatus, webhook_type: 'vapi', last_received_at: new Date().toISOString(), last_status: 'ok', failure_count: 0 },
        { onConflict: 'business_id,webhook_type' }
      );
  }

  let status = 200;
  let responseBody: any;

  switch (message.type) {
    case 'function-call': {
      const outcome = await handleFunctionCall(message, supabase);
      status = outcome.status;
      responseBody = outcome.body;
      break;
    }
    case 'end-of-call-report': {
      const outcome = await handleEndOfCall(message, supabase);
      status = outcome.status;
      responseBody = outcome.body;
      break;
    }
    default:
      responseBody = { ok: true };
  }

  await recordWebhookResponse(dedup.recordId, { status, body: responseBody });
  return NextResponse.json(responseBody, { status });
}

async function handleFunctionCall(
  message: any,
  supabase: ReturnType<typeof supabaseServiceRole>
): Promise<{ status: number; body: any }> {
  const { functionCall, call } = message;
  const name: string = functionCall?.name;
  const params = functionCall?.parameters ?? {};
  const businessId: string = call?.metadata?.businessId;
  const callRowId: string | undefined = call?.metadata?.callRowId;

  if (!businessId) {
    return { status: 400, body: { result: 'Missing business context.' } };
  }

  const result = await dispatchTool(name, params, { businessId, mode: 'live', callId: callRowId ?? null });
  return { status: 200, body: result };
}

async function handleEndOfCall(
  message: any,
  supabase: ReturnType<typeof supabaseServiceRole>
): Promise<{ status: number; body: any }> {
  const { call, transcript, recordingUrl, summary } = message;
  const businessId: string = call?.metadata?.businessId;
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

  const translatedTranscript = transcript && finalLanguage !== 'en' ? await translateText(transcript, 'en') : null;

  const updatePayload = {
    status: 'completed',
    transcript,
    translated_transcript: translatedTranscript,
    recording_url: recordingUrl,
    summary,
    ended_at: new Date().toISOString()
  };

  if (callRowId) {
    await supabase.from('calls').update(updatePayload).eq('id', callRowId);
  } else {
    await supabase.from('calls').insert({
      business_id: businessId,
      provider_call_id: call?.id,
      from_number: call?.customer?.number,
      to_number: call?.phoneNumber?.number,
      active_language: finalLanguage,
      ...updatePayload
    });
  }

  return { status: 200, body: { ok: true } };
}

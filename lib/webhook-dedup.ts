import { createHash } from 'crypto';
import { supabaseServiceRole } from './supabase/admin';

/**
 * Generic webhook idempotency: Vapi (like most webhook senders) can
 * redeliver the exact same event more than once on a timeout or retry.
 * Hashes the raw request body and tries to insert a row before any
 * processing happens; a unique-constraint conflict means this exact
 * delivery was already handled, so the caller should replay the stored
 * response instead of re-running side effects (double order, double
 * knowledge-gap log, double call row).
 */
export async function checkDuplicateWebhook(
  rawBody: string,
  eventType: string,
  businessId?: string | null
): Promise<{ isDuplicate: true; response: any } | { isDuplicate: false; recordId: string }> {
  const eventHash = createHash('sha256').update(rawBody).digest('hex');
  const supabase = supabaseServiceRole();

  const { data, error } = await supabase
    .from('webhook_events')
    .insert({ event_hash: eventHash, event_type: eventType, business_id: businessId ?? null })
    .select('id')
    .single();

  if (!error && data) {
    return { isDuplicate: false, recordId: data.id };
  }

  // Unique violation (or any insert failure) — look up what was already recorded.
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, response_json')
    .eq('event_hash', eventHash)
    .maybeSingle();

  if (existing) {
    return { isDuplicate: true, response: existing.response_json ?? { ok: true } };
  }

  // Couldn't confirm either way (e.g. transient DB error) — treat as new
  // rather than silently dropping a real event.
  return { isDuplicate: false, recordId: eventHash };
}

export async function recordWebhookResponse(recordId: string, response: any): Promise<void> {
  const supabase = supabaseServiceRole();
  await supabase.from('webhook_events').update({ response_json: response }).eq('id', recordId);
}

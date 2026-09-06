import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';
import { sendSms } from './twilio';
import { syncAssistantSettings } from './vapi-assistant';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_SECONDS = 60;

export interface FailedEventRow {
  id: string;
  event_type: string;
  business_id: string | null;
  payload: Record<string, any>;
  error_message: string | null;
  attempt_count: number;
  next_retry_at: string;
  status: 'pending' | 'retrying' | 'dead' | 'resolved';
}

/** Queues a failed side effect for background retry rather than letting it silently disappear once the request that triggered it has already returned. */
export async function enqueueFailedEvent(params: { eventType: string; businessId?: string | null; payload: Record<string, any>; errorMessage?: string }): Promise<void> {
  const supabase = supabaseServiceRole();
  const { error } = await supabase.from('failed_events').insert({
    event_type: params.eventType,
    business_id: params.businessId ?? null,
    payload: params.payload,
    error_message: params.errorMessage ?? null
  });
  if (error) logger.error('dead_letter_enqueue_failed', { eventType: params.eventType, message: error.message });
}

async function markResolved(id: string): Promise<void> {
  const supabase = supabaseServiceRole();
  await supabase.from('failed_events').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', id);
}

async function markRetryFailed(row: FailedEventRow, errorMessage: string): Promise<void> {
  const supabase = supabaseServiceRole();
  const attemptCount = row.attempt_count + 1;
  const dead = attemptCount >= MAX_ATTEMPTS;
  await supabase
    .from('failed_events')
    .update({
      status: dead ? 'dead' : 'pending',
      attempt_count: attemptCount,
      error_message: errorMessage,
      next_retry_at: new Date(Date.now() + BASE_BACKOFF_SECONDS * 1000 * Math.pow(2, attemptCount - 1)).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', row.id);
  if (dead) logger.error('dead_letter_event_dead', { id: row.id, eventType: row.event_type, attemptCount });
}

/**
 * One handler per event_type — the actual replay logic for that kind of
 * failure. Kept deliberately small: only the two concrete failure modes
 * this pass wires a real producer for (an SMS that didn't send, a Vapi
 * assistant sync that came back partial/failed). Add a case here before
 * enqueueing a new event_type anywhere else, or the drain job will only
 * ever mark it dead.
 */
const HANDLERS: Record<string, (row: FailedEventRow) => Promise<void>> = {
  async resend_sms(row) {
    const result = await sendSms(row.payload.to, row.payload.body);
    if (!result.ok) throw new Error(result.error ?? 'sendSms failed again');
  },
  async retry_assistant_sync(row) {
    if (!row.business_id) throw new Error('retry_assistant_sync event missing business_id');
    const result = await syncAssistantSettings(row.business_id);
    if (result.status !== 'synced') throw new Error(result.error ?? `sync status: ${result.status}`);
  }
};

/**
 * Claims whatever's due and replays it. Safe to call as often as the
 * cron schedule likes — claim_due_failed_events (migration 0027) uses
 * `for update skip locked`, so an overlapping run can't double-process a
 * row another run already claimed.
 */
export async function processDueFailedEvents(limit = 25): Promise<{ processed: number; resolved: number; failed: number; dead: number }> {
  const supabase = supabaseServiceRole();
  const { data, error } = await supabase.rpc('claim_due_failed_events', { p_limit: limit });
  if (error) {
    logger.error('dead_letter_claim_failed', { message: error.message });
    return { processed: 0, resolved: 0, failed: 0, dead: 0 };
  }

  const rows = (data ?? []) as FailedEventRow[];
  let resolved = 0;
  let failed = 0;
  let dead = 0;

  for (const row of rows) {
    const handler = HANDLERS[row.event_type];
    if (!handler) {
      logger.error('dead_letter_no_handler', { id: row.id, eventType: row.event_type });
      await markRetryFailed(row, `No handler registered for event_type "${row.event_type}"`);
      dead += row.attempt_count + 1 >= MAX_ATTEMPTS ? 1 : 0;
      failed += 1;
      continue;
    }
    try {
      await handler(row);
      await markResolved(row.id);
      resolved += 1;
    } catch (err: any) {
      await markRetryFailed(row, err?.message ?? String(err));
      failed += 1;
      if (row.attempt_count + 1 >= MAX_ATTEMPTS) dead += 1;
    }
  }

  return { processed: rows.length, resolved, failed, dead };
}

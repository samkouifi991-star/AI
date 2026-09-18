import { supabaseServiceRole } from '../../lib/supabase/admin';
import { logger } from '../../lib/logger';

/**
 * Upserts the `calls` row for a direct-runtime call, reusing the exact
 * idempotency guarantee Reliability Phase 0 built for this table
 * (migration 0020's unique index on provider_call_id): a redelivered or
 * duplicate "start" for the same Twilio callSid updates the existing row
 * instead of creating a second one. Returns the row's id, used as
 * ctx.callId for every dispatchTool() call this session makes — nothing
 * before this point has a real call to attach knowledge-gap lookups,
 * language events, etc. to.
 */
export async function upsertCallStart(params: { businessId: string; providerCallId: string; fromNumber?: string; toNumber?: string }): Promise<string | null> {
  const supabase = supabaseServiceRole();
  const { data, error } = await supabase
    .from('calls')
    .upsert(
      {
        business_id: params.businessId,
        provider_call_id: params.providerCallId,
        from_number: params.fromNumber ?? null,
        to_number: params.toNumber ?? null,
        status: 'in_progress'
      },
      { onConflict: 'provider_call_id' }
    )
    .select('id')
    .single();

  if (error || !data) {
    logger.error('call_lifecycle_start_upsert_failed', { businessId: params.businessId, providerCallId: params.providerCallId, errorMessage: error?.message });
    return null;
  }
  return data.id;
}

export async function markCallEnded(callId: string, transcript?: string | null): Promise<void> {
  const supabase = supabaseServiceRole();
  const update: Record<string, unknown> = { status: 'completed', ended_at: new Date().toISOString() };
  // Only overwrite the existing transcript column when this call actually
  // produced one — markCallEnded is also called as a safety net on an
  // unclean disconnect (see call-session.ts), where a second call with no
  // transcript should never blank out one a first call already saved.
  if (transcript) update.transcript = transcript;
  const { error } = await supabase.from('calls').update(update).eq('id', callId);
  if (error) {
    logger.error('call_lifecycle_end_update_failed', { callId, errorMessage: error.message });
  }
}

import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';

export interface HumanFallbackParams {
  businessId: string;
  callId?: string | null;
  practiceSessionId?: string | null;
  actionAttempted: string;
  errorDetail?: string;
  transferNumber?: string | null;
}

export interface HumanFallbackResult {
  result: string;
  transferTo?: string;
}

/**
 * The single place a tool call goes once it's determined it cannot
 * safely confirm a customer-facing action (an order, a booking, a
 * payment link) after exhausting whatever retry budget applied. Never
 * invents success — always tells the caller the truth, logs an incident
 * row for later review, and offers a transfer when one is configured for
 * this business rather than a one-size "someone will follow up."
 */
export async function handleUnsafeAction(params: HumanFallbackParams): Promise<HumanFallbackResult> {
  const supabase = supabaseServiceRole();
  const resolution = params.transferNumber ? 'transferred' : 'callback_offered';

  const { error } = await supabase.from('incidents').insert({
    business_id: params.businessId,
    call_id: params.callId ?? null,
    practice_session_id: params.practiceSessionId ?? null,
    action_attempted: params.actionAttempted,
    error_detail: params.errorDetail ?? null,
    resolution
  });
  if (error) {
    logger.error('incident_log_failed', { businessId: params.businessId, action: params.actionAttempted, message: error.message });
  }

  if (params.transferNumber) {
    return {
      result: "I'm not able to confirm that right now — let me transfer you to someone who can help.",
      transferTo: params.transferNumber
    };
  }

  return {
    result: "I'm not able to confirm that right now — I'll have someone from the team follow up with you directly."
  };
}

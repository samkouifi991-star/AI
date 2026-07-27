import { supabaseServiceRole } from './supabase/admin';
import { redactSensitive } from './redact';

/**
 * Matches "let me talk to a person" style requests, which the assistant
 * routes to transfer_call — never a knowledge gap. This is a defensive
 * backstop only: get_business_knowledge and transfer_call are already
 * separate tools in lib/vapi-tools.ts, so a well-behaved model routes these
 * correctly on its own. This just stops a stray human-handoff phrase from
 * ending up in Teach Ava if a question happens to get routed here anyway.
 */
const HUMAN_HANDOFF_PATTERN =
  /\b(speak (to|with)|talk (to|with)|connect me (to|with)|transfer (me )?to|real person|human|manager|representative|someone else)\b/i;

export function isHumanHandoffRequest(question: string): boolean {
  return HUMAN_HANDOFF_PATTERN.test(question);
}

type RecordGapParams = {
  businessId: string;
  question: string;
  callId?: string | null;
  source?: 'live' | 'practice';
  practiceSessionId?: string | null;
};

/**
 * Logs a knowledge gap for later review in /teach — but only for genuine
 * "Ava didn't know" cases, never for requests to speak with a human.
 * Redacts card numbers/passwords/credentials before the question is ever
 * written to the database. Returns null when the question was filtered out
 * (human handoff) rather than actually logged.
 */
export async function recordKnowledgeGap(
  params: RecordGapParams
): Promise<{ id: string } | null> {
  if (isHumanHandoffRequest(params.question)) return null;

  const { text: safeQuestion, redacted } = redactSensitive(params.question);
  const supabase = supabaseServiceRole();

  const { data, error } = await supabase
    .from('knowledge_gaps')
    .insert({
      business_id: params.businessId,
      call_id: params.callId ?? null,
      practice_session_id: params.practiceSessionId ?? null,
      source: params.source ?? 'live',
      question: safeQuestion,
      redacted,
      status: 'open'
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return { id: data.id };
}

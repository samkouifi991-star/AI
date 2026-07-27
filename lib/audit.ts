import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';

export type AuditAction =
  | 'number_purchased'
  | 'number_released'
  | 'number_renamed'
  | 'credential_connected'
  | 'credential_disconnected'
  | 'routing_changed'
  | 'refund_issued'
  | 'assistant_settings_changed'
  | 'onboarding_stage_completed'
  | 'business_went_live';

/**
 * Records a sensitive action to audit_log. `metadata` is for context that
 * helps a human reviewing the log (e.g. a phone number, a routing mode,
 * an amount) — NEVER pass a secret, token, or credential value into it,
 * encrypted or not. If you're tempted to log a credential "just the fact
 * that it changed" is enough; the value itself never belongs here.
 */
export async function logAudit(params: {
  businessId: string;
  actorUserId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  try {
    const supabase = supabaseServiceRole();
    await supabase.from('audit_log').insert({
      business_id: params.businessId,
      actor_user_id: params.actorUserId ?? null,
      action: params.action,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      metadata: params.metadata ?? {}
    });
  } catch (err: any) {
    // Audit logging failing should never block the actual operation — log
    // the failure itself and move on.
    logger.error('audit_log_write_failed', { action: params.action, message: err.message });
  }
}

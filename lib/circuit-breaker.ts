import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerPolicy {
  /** Failures within this rolling window count toward the threshold. */
  windowSeconds: number;
  /** Failures within the window that trip the breaker open. */
  threshold: number;
  /** How long the breaker stays open before allowing one probe request. */
  cooldownSeconds: number;
}

/**
 * Vapi, OpenAI, Twilio, and Stripe only — the four providers explicitly
 * in scope for circuit breaking. Deliberately excludes Supabase (a
 * database outage is handled by graceful degradation, not a breaker —
 * there's no "try a different database") and the not-yet-built direct
 * voice runtime's realtime provider.
 */
export const CIRCUIT_BREAKER_POLICIES: Record<'twilio' | 'vapi' | 'openai' | 'stripe', CircuitBreakerPolicy> = {
  twilio: { windowSeconds: 60, threshold: 5, cooldownSeconds: 30 },
  vapi: { windowSeconds: 60, threshold: 5, cooldownSeconds: 30 },
  openai: { windowSeconds: 60, threshold: 5, cooldownSeconds: 30 },
  stripe: { windowSeconds: 60, threshold: 5, cooldownSeconds: 30 }
};

export class CircuitOpenError extends Error {
  constructor(public provider: string) {
    super(`${provider} circuit breaker is open — skipping the call rather than adding more load to a provider that's already failing`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Throws CircuitOpenError if the breaker is tripped and still cooling
 * down. A 'half_open' result means the database function itself already
 * flipped the state and is allowing exactly this one call through as a
 * recovery probe — the caller proceeds normally either way once this
 * returns without throwing.
 */
export async function assertCircuitClosed(provider: keyof typeof CIRCUIT_BREAKER_POLICIES): Promise<void> {
  const policy = CIRCUIT_BREAKER_POLICIES[provider];
  const supabase = supabaseServiceRole();
  const { data, error } = await supabase.rpc('check_provider_circuit', { p_provider: provider, p_cooldown_seconds: policy.cooldownSeconds });

  if (error) {
    // Can't confirm the provider's health either way — fail open (allow
    // the call) rather than let a circuit-breaker-table hiccup take down
    // every call to every provider.
    logger.error('circuit_breaker_check_failed', { provider, message: error.message });
    return;
  }

  if (data === 'open') {
    throw new CircuitOpenError(provider);
  }
}

export async function recordCircuitFailure(provider: keyof typeof CIRCUIT_BREAKER_POLICIES): Promise<void> {
  const policy = CIRCUIT_BREAKER_POLICIES[provider];
  const supabase = supabaseServiceRole();
  const { data, error } = await supabase.rpc('record_provider_failure', {
    p_provider: provider,
    p_window_seconds: policy.windowSeconds,
    p_threshold: policy.threshold
  });
  if (error) {
    logger.error('circuit_breaker_record_failure_failed', { provider, message: error.message });
    return;
  }
  if (data === 'open') {
    logger.warn('circuit_breaker_opened', { provider });
  }
}

export async function recordCircuitSuccess(provider: keyof typeof CIRCUIT_BREAKER_POLICIES): Promise<void> {
  const supabase = supabaseServiceRole();
  const { error } = await supabase.rpc('record_provider_success', { p_provider: provider });
  if (error) logger.error('circuit_breaker_record_success_failed', { provider, message: error.message });
}

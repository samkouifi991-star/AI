import { logger } from './logger';

export interface RetryPolicy {
  /** How many attempts total, including the first — not "extra" retries. */
  attempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  /** Per-attempt timeout — a hung request is treated as a failed one. */
  timeoutMs: number;
  /** Random +/- fraction applied to each delay so many callers don't retry in lockstep. */
  jitterFraction: number;
  /** Returns true if this error is worth retrying. Defaults to isRetryableHttpError. */
  isRetryable?: (err: any) => boolean;
}

/**
 * True for the failure shapes worth retrying — a transient network error,
 * a request that never got a response, or an HTTP 429/5xx. False for
 * anything that means "this exact request is wrong" (400/401/403/404) —
 * retrying those wastes the caller's retry budget on a request that will
 * never succeed. Inspects the handful of shapes the SDKs actually used
 * here surface a status under (Twilio/Stripe/OpenAI/fetch all differ).
 */
export function isRetryableHttpError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.response?.statusCode;
  if (status === undefined || status === null) {
    // No status at all usually means the request never reached the
    // provider (DNS, connection reset, timeout) — worth retrying.
    return true;
  }
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

/**
 * Per-provider retry policies. Deliberately conservative — a live phone
 * call is waiting on most of these, so "retry until it works" is never
 * the right instinct; each policy caps both how many attempts happen and
 * how long the caller waits before giving up and falling back to an
 * honest "I can't confirm that right now" (see lib/human-fallback.ts).
 */
export const RETRY_POLICIES: Record<'twilio' | 'vapi' | 'openai' | 'openaiRealtime' | 'stripe' | 'supabase', RetryPolicy> = {
  twilio: { attempts: 3, baseDelayMs: 500, backoffMultiplier: 4, timeoutMs: 10_000, jitterFraction: 0.2 },
  vapi: { attempts: 3, baseDelayMs: 1_000, backoffMultiplier: 4, timeoutMs: 15_000, jitterFraction: 0.2 },
  openai: { attempts: 3, baseDelayMs: 250, backoffMultiplier: 2, timeoutMs: 30_000, jitterFraction: 0.2 },
  openaiRealtime: { attempts: 2, baseDelayMs: 250, backoffMultiplier: 2, timeoutMs: 8_000, jitterFraction: 0.2 },
  stripe: { attempts: 3, baseDelayMs: 1_000, backoffMultiplier: 3, timeoutMs: 15_000, jitterFraction: 0.2 },
  supabase: { attempts: 2, baseDelayMs: 200, backoffMultiplier: 4, timeoutMs: 5_000, jitterFraction: 0.2 }
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms: number, jitterFraction: number): number {
  const jitter = ms * jitterFraction * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(ms + jitter));
}

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs))
  ]);
}

/**
 * Runs fn() under a named provider's retry policy: bounded attempts,
 * exponential backoff with jitter, a hard per-attempt timeout, and a
 * caller-supplied (or default HTTP-status-based) rule for which failures
 * are even worth retrying. Throws the last error once attempts are
 * exhausted — callers are expected to catch that and fall back honestly
 * (see lib/human-fallback.ts) rather than let it surface as a generic
 * failure.
 */
export async function withRetry<T>(
  provider: keyof typeof RETRY_POLICIES,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const policy = RETRY_POLICIES[provider];
  const isRetryable = policy.isRetryable ?? isRetryableHttpError;

  let lastError: any;
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      return await withTimeout(fn, policy.timeoutMs);
    } catch (err: any) {
      lastError = err;
      const attemptsLeft = policy.attempts - attempt;
      const retryable = isRetryable(err);

      logger.warn('provider_call_failed', {
        provider,
        operation,
        attempt,
        attemptsLeft,
        retryable,
        message: err?.message ?? String(err)
      });

      if (!retryable || attemptsLeft === 0) break;

      await delay(withJitter(policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1), policy.jitterFraction));
    }
  }
  throw lastError;
}

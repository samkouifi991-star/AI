import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';

/**
 * Rate limits a sensitive action using a Postgres-backed sliding window
 * (see migration 0007's increment_rate_limit function) — no Redis or other
 * external dependency required. Fails open (allows the request) if the
 * rate-limit check itself errors, so a database hiccup never becomes an
 * outage for legitimate users; the tradeoff is logged so it's visible.
 *
 * Usage in a route handler:
 *   const allowed = await checkRateLimit(`phone-purchase:${businessId}`, 5, 3600);
 *   if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const supabase = supabaseServiceRole();
    const { data, error } = await supabase.rpc('increment_rate_limit', { p_key: key, p_window_seconds: windowSeconds });
    if (error) throw error;
    return (data as number) <= limit;
  } catch (err: any) {
    logger.error('rate_limit_check_failed', { key, message: err.message });
    return true; // fail open
  }
}

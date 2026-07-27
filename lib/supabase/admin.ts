import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS entirely using
 * SUPABASE_SERVICE_ROLE_KEY — use ONLY in trusted server-side code that
 * authenticates callers itself (Vapi/Twilio/Stripe webhooks verified by
 * shared secret or signature, the health check, scheduled/lazy jobs like
 * releaseExpiredHolds). Never import this file from a client component,
 * and never return its data directly to the browser without checking the
 * caller is actually authorized — RLS isn't there to save you here.
 */
export function supabaseServiceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

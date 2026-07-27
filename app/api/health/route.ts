import { NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { getVoiceProvider } from '@/lib/voice';
import { isStripeTestMode, stripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';

interface CheckResult {
  ok: boolean;
  message: string;
}

/**
 * Races a promise against a timeout, preserving the resolved value's real
 * type. Takes PromiseLike<T> rather than Promise<T> specifically because
 * Supabase query builders (e.g. `supabase.from(...).select(...)`) are
 * thenables, not native Promises — passing one directly into
 * Promise.race([...]) can make TypeScript's Awaited<T> fail to unwrap the
 * builder's `.then()` signature and fall back to `unknown`. Normalizing
 * with Promise.resolve() first guarantees Promise.race is always racing
 * two real Promise<T> values, so T (the Supabase response shape, or
 * whatever else is passed) comes through intact on the other side.
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))
  ]);
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const supabase = supabaseServiceRole();
    const { error } = await withTimeout(
      supabase.from('businesses').select('id', { count: 'exact', head: true }),
      3000
    );
    if (error) throw error;
    return { ok: true, message: 'Connected' };
  } catch (err: any) {
    logger.error('health_check_database_failed', { message: err.message });
    return { ok: false, message: 'Unreachable — check Supabase credentials.' };
  }
}

async function checkElevenLabs(): Promise<CheckResult> {
  if (!process.env.ELEVENLABS_API_KEY) {
    return { ok: false, message: 'ELEVENLABS_API_KEY is not set.' };
  }
  try {
    const provider = getVoiceProvider('elevenlabs');
    if (!provider.testConnection) return { ok: true, message: 'Key present (no test endpoint available).' };
    const result = await withTimeout(provider.testConnection(), 4000);
    return { ok: result.ok, message: result.message };
  } catch (err: any) {
    logger.error('health_check_elevenlabs_failed', { message: err.message });
    return { ok: false, message: 'Could not verify — check ELEVENLABS_API_KEY.' };
  }
}

async function checkVapi(): Promise<CheckResult> {
  if (!process.env.VAPI_API_KEY) {
    return { ok: false, message: 'VAPI_API_KEY is not set.' };
  }
  try {
    const res = await withTimeout(
      fetch('https://api.vapi.ai/assistant', {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
      }),
      4000
    );
    if (res.status === 401) return { ok: false, message: 'Invalid VAPI_API_KEY.' };
    return { ok: res.ok, message: res.ok ? 'Connected' : `Vapi returned ${res.status}` };
  } catch (err: any) {
    logger.error('health_check_vapi_failed', { message: err.message });
    return { ok: false, message: 'Could not reach Vapi.' };
  }
}

function checkStripe(): CheckResult & { mode?: 'test' | 'live' } {
  if (!stripeConfigured()) {
    return { ok: false, message: 'STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set.' };
  }
  return {
    ok: true,
    message: 'Configured',
    mode: isStripeTestMode() ? 'test' : 'live'
  };
}

function checkTwilio(): CheckResult {
  const ready = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
  );
  return { ok: ready, message: ready ? 'Configured' : 'Missing Twilio environment variables.' };
}

// GET /api/health — safe to expose publicly (used by uptime monitors and
// the Hostinger deployment checklist), since it never returns secret
// values, only booleans/short status messages.
export async function GET() {
  const [database, elevenlabs, vapi] = await Promise.all([checkDatabase(), checkElevenLabs(), checkVapi()]);
  const stripe = checkStripe();
  const twilio = checkTwilio();

  const checks = { database, elevenlabs, vapi, stripe, twilio };
  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    },
    { status: allOk ? 200 : 503 }
  );
}

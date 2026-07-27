import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { twilioClientForConnection } from '@/lib/twilio';
import { encryptSecret, redact } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/phone/twilio-connect  { accountSid, authToken }
 *
 * Twilio doesn't offer a universal OAuth flow for third-party apps to
 * connect a customer's account the way, say, Stripe Connect does — the
 * standard integration pattern is Account SID + Auth Token entry. Given
 * that constraint, this route does the next best thing: the auth token is
 * verified with a real API call immediately, encrypted before it touches
 * the database, and the decrypted plaintext never leaves this function —
 * it is not returned in the response, not logged, and not held in any
 * variable beyond this request's lifetime.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const allowed = await checkRateLimit(`twilio-connect:${business.id}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many connection attempts — try again later.' }, { status: 429 });

  const { accountSid, authToken } = await req.json();
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'accountSid and authToken are required' }, { status: 400 });
  }

  await supabase
    .from('provider_connections')
    .upsert({ business_id: business.id, provider: 'twilio', mode: 'byo', account_sid: accountSid, status: 'connecting' }, { onConflict: 'business_id,provider' });

  try {
    const encryptedAuthToken = encryptSecret(authToken);
    const client = twilioClientForConnection(accountSid, encryptedAuthToken);
    // Real verification call — confirms the credentials actually work
    // before we ever store them as "connected".
    await client.api.v2010.accounts(accountSid).fetch();

    await supabase
      .from('provider_connections')
      .update({ encrypted_auth_token: encryptedAuthToken, status: 'connected', last_verified_at: new Date().toISOString(), error_message: null })
      .eq('business_id', business.id)
      .eq('provider', 'twilio');

    logger.info('twilio_byo_connected', { businessId: business.id, accountSid: redact(accountSid) });
    await logAudit({ businessId: business.id, actorUserId: user.id, action: 'credential_connected', resourceType: 'provider_connection', metadata: { provider: 'twilio', accountSid: redact(accountSid) } });
    return NextResponse.json({ ok: true, status: 'connected' });
  } catch (err: any) {
    logger.error('twilio_byo_connect_failed', { businessId: business.id, accountSid: redact(accountSid), message: err.message });
    await supabase
      .from('provider_connections')
      .update({ status: 'error', error_message: 'Could not verify these credentials with Twilio.' })
      .eq('business_id', business.id)
      .eq('provider', 'twilio');
    return NextResponse.json({ error: 'Could not verify these credentials with Twilio.' }, { status: 400 });
  }
}

export async function GET() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ connection: null });

  // Explicitly exclude encrypted_auth_token from the select — this
  // endpoint's response goes to the browser, and that column must never
  // appear there even encrypted.
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('provider, mode, account_sid, status, last_verified_at, error_message')
    .eq('business_id', business.id)
    .eq('provider', 'twilio')
    .single();

  return NextResponse.json({ connection: connection ?? null });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error');
  if (oauthError || !code) {
    return NextResponse.redirect(new URL('/phone?error=stripe_connect_denied', req.url));
  }

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.redirect(new URL('/onboarding', req.url));

  try {
    const res = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_secret: process.env.STRIPE_SECRET_KEY ?? '',
        code,
        grant_type: 'authorization_code'
      })
    });

    if (!res.ok) throw new Error(`Stripe token exchange failed: ${res.status}`);
    const data = await res.json();
    // data.stripe_user_id is the connected account id (acct_...) — not
    // secret, safe to store in the clear, same treatment as a Twilio
    // Account SID. data.access_token IS secret and is encrypted before
    // it touches the database.
    const encryptedAccessToken = encryptSecret(data.access_token);

    await supabase.from('provider_connections').upsert(
      {
        business_id: business.id,
        provider: 'stripe',
        mode: 'byo',
        account_sid: data.stripe_user_id,
        encrypted_auth_token: encryptedAccessToken,
        status: 'connected',
        last_verified_at: new Date().toISOString(),
        error_message: null
      },
      { onConflict: 'business_id,provider' }
    );

    await logAudit({
      businessId: business.id,
      actorUserId: user.id,
      action: 'credential_connected',
      resourceType: 'provider_connection',
      metadata: { provider: 'stripe' }
    });

    return NextResponse.redirect(new URL('/phone?stripe_connected=1', req.url));
  } catch (err: any) {
    logger.error('stripe_connect_callback_failed', { businessId: business.id, message: err.message });
    await supabase
      .from('provider_connections')
      .upsert(
        { business_id: business.id, provider: 'stripe', mode: 'byo', status: 'error', error_message: 'Could not complete Stripe connection.' },
        { onConflict: 'business_id,provider' }
      );
    return NextResponse.redirect(new URL('/phone?error=stripe_connect_failed', req.url));
  }
}

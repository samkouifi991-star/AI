import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/payments/stripe-connect
 * Redirects to Stripe's real OAuth authorize screen — this is what makes
 * "Connect Stripe" a genuine one-click flow rather than a form asking for
 * secret keys. Requires STRIPE_CONNECT_CLIENT_ID (from the Stripe
 * dashboard's Connect settings — distinct from the regular API keys).
 */
export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  if (!process.env.STRIPE_CONNECT_CLIENT_ID) {
    return NextResponse.redirect(new URL('/phone?error=stripe_connect_not_configured', req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: `${appUrl}/api/payments/stripe-connect/callback`
  });

  return NextResponse.redirect(`https://connect.stripe.com/oauth/authorize?${params.toString()}`);
}

import { NextRequest, NextResponse } from 'next/server';
import { googleOAuthClient } from '@/lib/calendar';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/calendar?error=missing_code', req.url));
  }

  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .single();
  if (!business) return NextResponse.redirect(new URL('/onboarding', req.url));

  const client = googleOAuthClient();
  const { tokens } = await client.getToken(code);

  await supabase.from('calendar_connections').upsert({
    business_id: business.id,
    provider: 'google',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    calendar_id: 'primary',
    connected_at: new Date().toISOString()
  });

  return NextResponse.redirect(new URL('/calendar?connected=1', req.url));
}

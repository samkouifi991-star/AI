import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/calendar';

// Redirects the business owner to Google's consent screen. If the OAuth
// client isn't fully configured, generateAuthUrl() would still return a
// URL — just one missing redirect_uri — which Google then rejects with a
// raw, confusing "Access blocked: Authorization Error" page. Catch that
// here and send the owner back to a page they control instead.
export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return NextResponse.redirect(new URL('/calendar?error=google_not_configured', req.url));
  }
  return NextResponse.redirect(getAuthUrl());
}

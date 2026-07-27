import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/calendar';

// Redirects the business owner to Google's consent screen.
export async function GET() {
  return NextResponse.redirect(getAuthUrl());
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { claimSessionApplications } from '@/lib/applications'

// Handles both the Google OAuth redirect and the "confirm your email" link
// Supabase sends after signup — both arrive here as `?code=...` under the
// PKCE flow.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await claimSessionApplications(data.user.id)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}

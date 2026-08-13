import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

const COOKIE_NAME = 'suv_session'

// Anonymous applications (Start Free, before account creation) are tied to
// this httpOnly cookie rather than a Supabase user id. It is never read by
// client-side JS and never sent to Supabase directly — only server Route
// Handlers compare it against applications.session_token using the
// service-role client. On signup, claimApplication() links the row to the
// new user_id and the cookie stops being used for that application.
export function getOrCreateSessionToken(): string {
  const store = cookies()
  const existing = store.get(COOKIE_NAME)?.value
  if (existing) return existing

  const token = randomUUID()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return token
}

export function readSessionToken(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null
}

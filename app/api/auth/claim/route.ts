import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { claimSessionApplications } from '@/lib/applications'

// Called right after a successful client-side sign-in/sign-up so any
// application started anonymously (Start Free, before an account existed)
// gets linked to the account instead of orphaned. Idempotent — running it
// with no unclaimed applications is a harmless no-op.
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  await claimSessionApplications(user.id)
  return NextResponse.json({ ok: true })
}

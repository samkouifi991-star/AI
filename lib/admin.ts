import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Every /admin page and admin server action calls this first. Redundant
// with the RBAC check already in middleware.ts (belt-and-suspenders) —
// this one also hands back the resolved user/profile so pages don't need
// a second round trip.
export async function requireStaff() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/admin')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'support'].includes(profile.role)) redirect('/dashboard')

  return { supabase, user, profile }
}

export async function requireAdmin() {
  const ctx = await requireStaff()
  if (ctx.profile.role !== 'admin') redirect('/admin')
  return ctx
}

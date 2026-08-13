import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSessionToken } from '@/lib/session'
import { getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { calculateProgress } from '@/lib/engine/progress'
import type { Application } from '@/lib/supabase/types'

export class AccessDeniedError extends Error {
  constructor() {
    super('You do not have access to this application.')
  }
}

// Resolves which Supabase client a request is allowed to act through for a
// given application: a signed-in user goes through the RLS-scoped server
// client (owner-only by policy); an anonymous pre-account applicant is
// verified against the httpOnly session cookie using the service-role
// client, since RLS grants anonymous requests no access to `applications`
// at all (see 0002_rls_policies.sql).
export async function getAccessibleApplication(applicationId: string) {
  const server = createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()

  if (user) {
    const { data, error } = await server.from('applications').select('*').eq('id', applicationId).single()
    if (error || !data) throw new AccessDeniedError()
    return { application: data as Application, supabase: server, userId: user.id }
  }

  const token = readSessionToken()
  if (!token) throw new AccessDeniedError()

  const admin = createAdminClient()
  const { data, error } = await admin.from('applications').select('*').eq('id', applicationId).single()
  if (error || !data) throw new AccessDeniedError()
  if (data.user_id !== null || data.session_token !== token) throw new AccessDeniedError()

  return { application: data as Application, supabase: admin, userId: null as string | null }
}

// Links every session-token-owned, not-yet-claimed application to the
// newly created account. Called right after signup so nothing the user
// already answered is ever lost.
export async function claimSessionApplications(userId: string) {
  const token = readSessionToken()
  if (!token) return
  const admin = createAdminClient()
  await admin
    .from('applications')
    .update({ user_id: userId, session_token: null })
    .eq('session_token', token)
    .is('user_id', null)
}

export async function recalculateProgress(supabase: SupabaseClient, applicationId: string) {
  const { data: application, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .single()
  if (error || !application) throw error ?? new Error('Application not found')

  const schema = await getFullSchema(supabase, application.application_type_id)
  const answers = await getAnswersBundle(supabase, applicationId, schema)
  const percent = calculateProgress(schema, answers)

  await supabase.from('applications').update({ progress_percent: percent }).eq('id', applicationId)
  return percent
}

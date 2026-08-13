'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getOrCreateSessionToken } from '@/lib/session'

// "Start Application" always creates a real applications row immediately —
// signed in or not. Anonymous visitors are tracked by an httpOnly session
// cookie (see lib/session.ts) and claimed into their account at signup, so
// nothing answered before creating an account is ever lost.
export async function startApplication(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  if (!slug) throw new Error('Missing application slug')

  const admin = createAdminClient()
  const { data: applicationType, error: typeErr } = await admin
    .from('application_types')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  if (typeErr || !applicationType) throw new Error('Unknown application type')

  const server = createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()

  const insertPayload: Record<string, unknown> = {
    application_type_id: applicationType.id,
    status: 'eligibility',
  }

  if (user) {
    insertPayload.user_id = user.id
  } else {
    insertPayload.session_token = getOrCreateSessionToken()
  }

  const { data: application, error: insertErr } = await admin
    .from('applications')
    .insert(insertPayload)
    .select('id')
    .single()
  if (insertErr || !application) throw insertErr ?? new Error('Could not start application')

  await admin.from('audit_logs').insert({
    actor_id: user?.id ?? null,
    action: 'application.started',
    entity_type: 'application',
    entity_id: application.id,
    metadata: { slug },
  })

  redirect(`/application/${application.id}/eligibility`)
}

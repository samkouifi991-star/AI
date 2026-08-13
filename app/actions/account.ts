'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'

export async function updateProfile(formData: FormData) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const fullName = String(formData.get('fullName') ?? '').trim()
  await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  revalidatePath('/account')
}

export async function deleteAccount() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  await logAudit({ actorId: user.id, action: 'account.deleted', entityType: 'user', entityId: user.id })
  // Cascades to applications, answers, documents, payments, etc. via
  // `on delete cascade` foreign keys in 0001_core_schema.sql.
  await admin.auth.admin.deleteUser(user.id)
  await supabase.auth.signOut()
  redirect('/')
}

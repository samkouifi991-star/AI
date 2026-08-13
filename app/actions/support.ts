'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { supportRequestSchema } from '@/lib/validation-schemas'
import { sendSupportAcknowledgementEmail } from '@/lib/email'

export type SubmitSupportState = { ok: boolean; message: string }

export async function submitSupportRequest(
  _prevState: SubmitSupportState,
  formData: FormData
): Promise<SubmitSupportState> {
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await rateLimit(`ratelimit:support:${ip}`, 5, 300)
  if (!rl.allowed) return { ok: false, message: 'Too many messages sent — please try again in a few minutes.' }

  const parsed = supportRequestSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    subject: String(formData.get('subject') ?? '').trim(),
    message: String(formData.get('message') ?? '').trim(),
  })
  if (!parsed.success) {
    return { ok: false, message: 'Please fill in every field with a valid email address.' }
  }

  const server = createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()

  const admin = createAdminClient()
  const { error } = await admin.from('support_requests').insert({
    user_id: user?.id ?? null,
    ...parsed.data,
  })

  if (error) return { ok: false, message: 'Something went wrong sending your message. Please try again.' }
  await sendSupportAcknowledgementEmail(parsed.data.email, parsed.data.subject)
  return { ok: true, message: "Thanks — we've received your message and will respond within 2 business days." }
}

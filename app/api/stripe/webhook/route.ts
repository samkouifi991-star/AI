import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePackage } from '@/lib/pdf/generate'
import { logAudit } from '@/lib/audit'
import { sendPackageReadyEmail } from '@/lib/email'
import type Stripe from 'stripe'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })

  const rawBody = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 })
  }

  const admin = createAdminClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const type = session.metadata?.type

    if (type === 'application') {
      const applicationId = session.metadata!.applicationId
      await admin
        .from('payments')
        .update({ status: 'succeeded', stripe_payment_intent_id: String(session.payment_intent ?? '') })
        .eq('stripe_checkout_session_id', session.id)
      await admin.from('applications').update({ status: 'paid' }).eq('id', applicationId)
      await logAudit({ action: 'payment.succeeded', entityType: 'application', entityId: applicationId })

      const translationPackageId = session.metadata?.translationPackageId
      if (translationPackageId) {
        await admin
          .from('application_translation_packages')
          .update({
            payment_status: 'paid',
            purchased_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: String(session.payment_intent ?? ''),
          })
          .eq('id', translationPackageId)
        await logAudit({ action: 'translation_package.paid', entityType: 'application_translation_package', entityId: translationPackageId })
      }

      try {
        await generatePackage(applicationId)
        await logAudit({ action: 'package.generated', entityType: 'application', entityId: applicationId })

        const { data: app } = await admin.from('applications').select('user_id, application_type_id').eq('id', applicationId).single()
        const { data: appType } = await admin.from('application_types').select('form_code').eq('id', app?.application_type_id).single()
        const { data: profile } = app?.user_id
          ? await admin.from('profiles').select('email').eq('id', app.user_id).single()
          : { data: null }
        if (profile?.email) {
          const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
          await sendPackageReadyEmail(profile.email, appType?.form_code ?? 'application', `${origin}/application/${applicationId}/package`)
        }
      } catch (err) {
        console.error('Package generation failed', err)
        await logAudit({ action: 'package.generation_failed', entityType: 'application', entityId: applicationId, metadata: { error: String(err) } })
      }
    }

  }

  return NextResponse.json({ received: true })
}

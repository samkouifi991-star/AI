import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'translation-checkout'), 10, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const server = createClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const admin = createAdminClient()
  const { data: translation, error } = await admin
    .from('translations')
    .select('*, application_documents!inner(application_id, applications!inner(user_id))')
    .eq('id', params.id)
    .single()

  if (error || !translation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ownerId = translation.application_documents.applications.user_id
  if (ownerId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const origin = new URL(request.url).origin
  const applicationId = translation.application_documents.application_id

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `Certified translation (${translation.source_language})` },
          unit_amount: translation.price_cents,
        },
        quantity: 1,
      },
    ],
    metadata: { type: 'translation', translationId: translation.id, applicationId },
    success_url: `${origin}/application/${applicationId}/documents?translation=paid`,
    cancel_url: `${origin}/application/${applicationId}/documents?translation=cancelled`,
  })

  await admin.from('translations').update({ status: 'awaiting_payment' }).eq('id', translation.id)

  return NextResponse.json({ url: session.url })
}

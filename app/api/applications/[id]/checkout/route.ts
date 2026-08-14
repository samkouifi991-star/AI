import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { checkoutSchema } from '@/lib/validation-schemas'
import { getPricingForApplicationType, effectiveServiceFeeCents } from '@/lib/engine/pricing'
import { getPackageForApplication } from '@/lib/engine/translation-package'
import { getStripe } from '@/lib/stripe'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'checkout'), 10, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase, userId } = accessible
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = checkoutSchema.safeParse({ applicationId: application.id, ...body })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { pricing } = await getPricingForApplicationType(supabase, application.application_type_id)
  const serviceFeeCents = effectiveServiceFeeCents(pricing)

  const lineItems: { price_data: any; quantity: number }[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: 'Smart USA Visa preparation service' },
        unit_amount: serviceFeeCents,
      },
      quantity: 1,
    },
  ]

  if (parsed.data.includePrintMail) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Print & mail service' },
        unit_amount: pricing.print_mail_fee_cents,
      },
      quantity: 1,
    })
  }

  // The translation package is a single line item here — never one per
  // document — and only appears once (pending payment); a second checkout
  // attempt after it's already paid won't add it again.
  const translationPackage = await getPackageForApplication(supabase, application.id)
  if (translationPackage && translationPackage.payment_status === 'pending') {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Certified Document Translation Package' },
        unit_amount: translationPackage.price_cents,
      },
      quantity: 1,
    })
  }

  const origin = new URL(request.url).origin
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: {
      type: 'application',
      applicationId: application.id,
      translationPackageId: translationPackage?.payment_status === 'pending' ? translationPackage.id : '',
    },
    success_url: `${origin}/application/${application.id}/package?paid=1`,
    cancel_url: `${origin}/application/${application.id}/checkout?cancelled=1`,
  })

  const totalCents = lineItems.reduce((sum, i) => sum + i.price_data.unit_amount, 0)
  await supabase.from('payments').insert({
    application_id: application.id,
    stripe_checkout_session_id: session.id,
    amount_cents: totalCents,
    status: 'pending',
    line_items: lineItems.map((i) => ({ label: i.price_data.product_data.name, amount_cents: i.price_data.unit_amount })),
  })

  return NextResponse.json({ url: session.url })
}

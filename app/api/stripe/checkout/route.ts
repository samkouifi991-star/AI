import { NextRequest, NextResponse } from 'next/server';
import { stripeClient } from '@/lib/stripe';
import { supabaseServer } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Creates a Stripe Checkout session for a deposit, estimate fee, or
 * restaurant order total. Returns a hosted payment URL suitable for sending
 * by SMS (see lib/twilio.ts) or email. The resulting session's metadata
 * carries businessId + a reference (lead/appointment/order id) so the
 * webhook can attribute the payment correctly when it completes.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const { amountUsd, description, referenceId, referenceType } = await req.json();

  if (!amountUsd || amountUsd <= 0) {
    return NextResponse.json({ error: 'amountUsd must be greater than 0' }, { status: 400 });
  }

  try {
    const stripe = stripeClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: description ?? `Payment to ${business.name}` },
            unit_amount: Math.round(amountUsd * 100)
          },
          quantity: 1
        }
      ],
      metadata: {
        businessId: business.id,
        referenceId: referenceId ?? '',
        referenceType: referenceType ?? ''
      },
      success_url: `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pay/cancelled`
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    logger.error('stripe_checkout_creation_failed', { businessId: business.id, message: err.message });
    return NextResponse.json({ error: 'Could not create payment link. Check Stripe configuration.' }, { status: 502 });
  }
}

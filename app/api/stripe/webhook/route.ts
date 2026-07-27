import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeWebhook, isStripeTestMode } from '@/lib/stripe';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// Stripe webhooks require the raw request body for signature verification —
// Next.js route handlers give us that via req.text() as long as we don't
// parse it as JSON first.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (err: any) {
    // Always 400 on bad signature — never 500. A 500 here would make Stripe
    // retry indefinitely for what's actually a config/auth problem.
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const supabase = supabaseServiceRole();

  try {
    const relevantTypes = [
      'checkout.session.completed',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'charge.refunded'
    ];

    if (!relevantTypes.includes(event.type)) {
      // Acknowledge receipt of event types we don't act on yet, so Stripe
      // doesn't keep retrying them.
      return NextResponse.json({ received: true, ignored: event.type });
    }

    const obj: any = event.data.object;
    const businessId: string | null = obj.metadata?.businessId ?? null;

    const { error } = await supabase.from('payments').insert({
      business_id: businessId,
      stripe_event_id: event.id,
      stripe_object_id: obj.id,
      type: event.type,
      amount: obj.amount_total ? obj.amount_total / 100 : obj.amount ? obj.amount / 100 : null,
      currency: obj.currency ?? 'usd',
      status: event.type.includes('failed') ? 'failed' : 'processed',
      is_test: isStripeTestMode(),
      raw_payload: obj
    });

    if (error) {
      // Unique constraint on stripe_event_id makes this safe to ignore on
      // Stripe's automatic retries of an already-processed event.
      if (!error.message.includes('duplicate key')) {
        logger.error('stripe_webhook_db_insert_failed', { eventId: event.id, message: error.message });
      }
    }

    // Attribute the payment to whatever it was for (order, appointment
    // deposit, invoice, ...) via the metadata set when the Checkout session
    // was created — see lib/orders.ts createOrderPaymentLink() and
    // /api/stripe/checkout. This is what actually moves a restaurant order
    // from "Pending Payment" to "Paid" and into the restaurant's dashboard;
    // nothing else marks an order paid.
    const referenceType: string | null = obj.metadata?.referenceType ?? null;
    const referenceId: string | null = obj.metadata?.referenceId ?? null;

    if (referenceType === 'order' && referenceId) {
      if (event.type === 'checkout.session.completed') {
        await supabase
          .from('orders')
          .update({ status: 'paid', stripe_payment_intent_id: obj.payment_intent ?? null, updated_at: new Date().toISOString() })
          .eq('id', referenceId)
          .eq('status', 'pending_payment'); // don't resurrect a cancelled/expired order on a late webhook
      } else if (event.type === 'charge.refunded') {
        await supabase.from('orders').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', referenceId);
      } else if (event.type === 'payment_intent.payment_failed') {
        logger.warn('order_payment_failed', { orderId: referenceId, eventId: event.id });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    logger.error('stripe_webhook_processing_failed', { eventId: event?.id, message: err.message });
    // Still 200 here: we've already verified and logged the event; a 500
    // would cause Stripe to retry a webhook whose failure is on our side
    // and unlikely to be transient (bad payload shape, etc.) — visibility
    // via logs is safer than a retry storm. Adjust if you add processing
    // steps that ARE worth retrying (e.g. a flaky downstream call).
    return NextResponse.json({ received: true, warning: 'processed with errors, see logs' });
  }
}

import { supabaseServiceRole } from './supabase/admin';
import { stripeClient } from './stripe';
import { logger } from './logger';
import { withRetry } from './provider-retry';

export interface OrderItemInput {
  menu_item_id: string;
  name_snapshot: string;
  size_label?: string | null;
  unit_price: number;
  quantity: number;
  modifiers?: { label: string; price_delta: number }[];
  special_instructions?: string | null;
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  tip: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineTotal(item: OrderItemInput): number {
  const modifierTotal = (item.modifiers ?? []).reduce((sum, m) => sum + m.price_delta, 0);
  return round2((item.unit_price + modifierTotal) * item.quantity);
}

/**
 * Computes the full order breakdown — subtotal, tax, delivery fee, discount,
 * tip, total — from line items plus the business's restaurant_settings.
 * This is the single source of truth used both by the "repeat the order
 * back" webhook function and by confirm_order when generating the payment
 * link, so the two can never disagree.
 */
export function computeOrderTotals(params: {
  items: OrderItemInput[];
  orderType: 'pickup' | 'delivery';
  tipPercent?: number;
  discountCode?: string;
  settings: {
    tax_rate: number;
    delivery_fee: number;
    discount_code: string | null;
    discount_percent: number | null;
  };
}): OrderTotals {
  const subtotal = round2(params.items.reduce((sum, i) => sum + lineTotal(i), 0));
  const deliveryFee = params.orderType === 'delivery' ? params.settings.delivery_fee ?? 0 : 0;

  let discount = 0;
  if (
    params.discountCode &&
    params.settings.discount_code &&
    params.discountCode.trim().toUpperCase() === params.settings.discount_code.trim().toUpperCase() &&
    params.settings.discount_percent
  ) {
    discount = round2(subtotal * (params.settings.discount_percent / 100));
  }

  const taxableBase = Math.max(0, subtotal - discount);
  const tax = round2(taxableBase * ((params.settings.tax_rate ?? 0) / 100));
  const tip = params.tipPercent ? round2((subtotal - discount) * (params.tipPercent / 100)) : 0;

  const total = round2(subtotal - discount + tax + deliveryFee + tip);

  return { subtotal, tax, deliveryFee, discount, tip, total };
}

/**
 * Creates a Stripe Checkout session for a finalized order and stores the
 * session id on the order row. Used by the confirm_order function in the
 * Vapi webhook — the resulting URL is what gets texted to the customer.
 *
 * Idempotent by construction, not just by convention — a retried
 * confirm_order (a webhook redelivery, or the model re-invoking the tool
 * after not hearing its own result) must never produce a second Checkout
 * session, and therefore a second "pay here" text, for the same order:
 *   1. If the order already has a session that's still open, reuse it —
 *      no Stripe call at all.
 *   2. Otherwise, create one with a Stripe Idempotency-Key scoped to this
 *      order AND to whatever session (if any) it's replacing. Two racing
 *      calls that both miss guard #1 read the same prior-session value and
 *      so land on the same key, meaning Stripe itself collapses them into
 *      one session rather than two — this holds even if the DB read in
 *      guard #1 and the DB write below race each other.
 */
export async function createOrderPaymentLink(orderId: string): Promise<{ url: string } | { error: string }> {
  const supabase = supabaseServiceRole();

  const { data: order, error } = await supabase.from('orders').select('*, businesses(name)').eq('id', orderId).single();
  if (error || !order) return { error: 'Order not found' };

  const stripe = stripeClient();

  if (order.stripe_checkout_session_id) {
    try {
      const existing = await withRetry('stripe', 'checkout_session_retrieve', () => stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id));
      if (existing.status === 'open' && existing.url) {
        return { url: existing.url };
      }
      // Expired or already completed — fall through and mint a fresh one.
    } catch (err: any) {
      logger.warn('order_payment_link_retrieve_failed', { orderId, message: err.message });
      // Couldn't confirm the old session either way — fall through rather
      // than leaving the order stuck with no way to pay.
    }
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const idempotencyKey = `order_payment_link:${orderId}:${order.stripe_checkout_session_id ?? 'none'}`;

    // Safe to retry under load — a retry reuses idempotencyKey, so Stripe
    // itself collapses it with the original attempt rather than minting a
    // second session.
    const session = await withRetry('stripe', 'checkout_session_create', () =>
      stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: `Order from ${(order as any).businesses?.name ?? 'restaurant'}` },
                unit_amount: Math.round(order.total * 100)
              },
              quantity: 1
            }
          ],
          metadata: {
            businessId: order.business_id,
            referenceId: order.id,
            referenceType: 'order'
          },
          success_url: `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/pay/cancelled`
        },
        { idempotencyKey }
      )
    );

    await supabase
      .from('orders')
      .update({
        status: 'pending_payment',
        stripe_checkout_session_id: session.id,
        payment_hold_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
      .eq('id', orderId);

    return { url: session.url! };
  } catch (err: any) {
    logger.error('order_payment_link_failed', { orderId, message: err.message });
    return { error: 'Could not create payment link' };
  }
}

/**
 * Lazily releases orders whose payment hold has expired. There's no cron
 * job in this deployment (not guaranteed available on all Node hosts), so
 * this is called opportunistically — from the orders dashboard page load,
 * and from the webhook before creating a new hold for the same business —
 * rather than on a fixed schedule. Good enough for the actual guarantee
 * that matters here: an expired hold is never still blocking a real
 * booking by the time anyone looks at it.
 */
export async function releaseExpiredHolds(businessId: string): Promise<number> {
  const supabase = supabaseServiceRole();
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('business_id', businessId)
    .eq('status', 'pending_payment')
    .lt('payment_hold_expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    logger.error('release_expired_holds_failed', { businessId, message: error.message });
    return 0;
  }
  return data?.length ?? 0;
}

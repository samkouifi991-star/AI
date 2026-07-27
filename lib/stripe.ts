import Stripe from 'stripe';
import { logger } from './logger';

let cachedClient: Stripe | null = null;

/** Lazily-constructed Stripe client, reused across requests in the same
 * server process. Throws a clear error if the secret key isn't configured,
 * rather than silently returning an unusable client. */
export function stripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  cachedClient = new Stripe(key, { apiVersion: '2024-06-20' });
  return cachedClient;
}

/** True when STRIPE_SECRET_KEY is a test-mode key (sk_test_...). Use this to
 * mark orders/payments/invoices as test records, and to show a staging
 * banner in the dashboard — see HOSTINGER_DEPLOYMENT.md "Staging mode". */
export function isStripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_test_');
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/** Verifies a Stripe webhook signature and returns the parsed event, or
 * throws with a clear message. Callers should catch and return 400. */
export function verifyStripeWebhook(rawBody: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error('Missing Stripe-Signature header');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  try {
    return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    logger.error('stripe_webhook_signature_invalid', { message: err.message });
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
}

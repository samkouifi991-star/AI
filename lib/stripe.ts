import Stripe from 'stripe'

let stripeClient: Stripe | null = null

// Lazily constructed so the module can be imported (e.g. by type-checking
// or by routes that don't need it yet) without a STRIPE_SECRET_KEY set.
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' })
  }
  return stripeClient
}

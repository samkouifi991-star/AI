import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pricing, GovernmentFee } from '@/lib/supabase/types'

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export async function getPricingForApplicationType(supabase: SupabaseClient, applicationTypeId: string) {
  const [{ data: pricing, error: pricingErr }, { data: fees, error: feesErr }] = await Promise.all([
    supabase.from('pricing').select('*').eq('application_type_id', applicationTypeId).single(),
    supabase.from('government_fees').select('*').eq('application_type_id', applicationTypeId),
  ])
  if (pricingErr) throw pricingErr
  if (feesErr) throw feesErr

  return {
    pricing: pricing as Pricing,
    governmentFees: (fees ?? []) as GovernmentFee[],
  }
}

export function effectiveServiceFeeCents(pricing: Pricing): number {
  return pricing.promo_active && pricing.promo_fee_cents != null ? pricing.promo_fee_cents : pricing.service_fee_cents
}

export type CheckoutLineItem = { label: string; amount_cents: number; note?: string }

// Line items shown at checkout. Government fees are itemized separately
// and clearly marked as NOT collected by Smart USA Visa — see checkout UI
// copy for the disclaimer this powers.
export function buildCheckoutLineItems(params: {
  pricing: Pricing
  governmentFees: GovernmentFee[]
  translationCents: number
  includePrintMail: boolean
}): { serviceLineItems: CheckoutLineItem[]; governmentFeeItems: CheckoutLineItem[]; totalChargedCents: number } {
  const serviceLineItems: CheckoutLineItem[] = [
    { label: 'Smart USA Visa preparation service', amount_cents: effectiveServiceFeeCents(params.pricing) },
  ]
  if (params.translationCents > 0) {
    serviceLineItems.push({ label: 'Certified document translation', amount_cents: params.translationCents })
  }
  if (params.includePrintMail) {
    serviceLineItems.push({ label: 'Print & mail service', amount_cents: params.pricing.print_mail_fee_cents })
  }

  const governmentFeeItems: CheckoutLineItem[] = params.governmentFees
    .filter((f) => f.amount_cents > 0)
    .map((f) => ({
      label: f.label,
      amount_cents: f.amount_cents,
      note: 'Paid by you directly to USCIS — not collected by Smart USA Visa.',
    }))

  const totalChargedCents = serviceLineItems.reduce((sum, i) => sum + i.amount_cents, 0)

  return { serviceLineItems, governmentFeeItems, totalChargedCents }
}

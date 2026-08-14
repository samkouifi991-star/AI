import type { SupabaseClient } from '@supabase/supabase-js'
import type { TranslationPackage, TranslationPackageDisplayStatus, Translation } from '@/lib/supabase/types'

export type { TranslationPackage, TranslationPackageDisplayStatus, Translation } from '@/lib/supabase/types'

export async function getFlatFeeCents(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('translation_pricing').select('flat_fee_cents').limit(1).maybeSingle()
  return data?.flat_fee_cents ?? 7500
}

export async function getPackageForApplication(supabase: SupabaseClient, applicationId: string): Promise<TranslationPackage | null> {
  const { data } = await supabase
    .from('application_translation_packages')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle()
  return (data as TranslationPackage) ?? null
}

// Idempotent "add to cart" — one package per application, ever. Calling
// this twice for the same application returns the same row rather than
// creating (or charging for) a second one; this is the structural
// guarantee behind "$75 per application, never per document."
export async function getOrCreatePackage(
  supabase: SupabaseClient,
  applicationId: string,
  userId: string | null,
  priceCents: number
): Promise<TranslationPackage> {
  const existing = await getPackageForApplication(supabase, applicationId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('application_translation_packages')
    .insert({ application_id: applicationId, user_id: userId, price_cents: priceCents, payment_status: 'pending' })
    .select()
    .single()

  if (error) {
    // Unique-violation on a race (two tabs clicking "Add" at once) —
    // someone else's insert won, so just return theirs.
    if (error.code === '23505') {
      const row = await getPackageForApplication(supabase, applicationId)
      if (row) return row
    }
    throw error
  }
  return data as TranslationPackage
}

export function computePackageDisplayStatus(
  pkg: TranslationPackage | null,
  jobs: Pick<Translation, 'status' | 'self_provided'>[]
): TranslationPackageDisplayStatus {
  if (!pkg) return 'not_purchased'
  if (pkg.payment_status !== 'paid') return 'added_to_checkout'

  const paidJobs = jobs.filter((j) => !j.self_provided)
  if (paidJobs.length === 0) return 'in_progress'
  if (paidJobs.every((j) => j.status === 'completed')) return 'completed'
  if (paidJobs.some((j) => j.status === 'completed')) return 'partially_completed'
  return 'in_progress'
}

export const packageStatusLabel: Record<TranslationPackageDisplayStatus, string> = {
  not_purchased: 'Not Purchased',
  added_to_checkout: 'Added to Checkout',
  in_progress: 'In Progress',
  partially_completed: 'Partially Completed',
  completed: 'Completed',
}

export const jobStatusLabel: Record<Translation['status'], string> = {
  required: 'Translation Required',
  awaiting_upload: 'Awaiting Upload',
  submitted: 'Submitted',
  in_progress: 'In Progress',
  completed: 'Completed',
  needs_attention: 'Needs Attention',
}

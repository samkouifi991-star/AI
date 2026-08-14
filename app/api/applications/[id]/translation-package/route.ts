import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getFlatFeeCents, getOrCreatePackage } from '@/lib/engine/translation-package'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

// "Add Translation Package — $75" — adds the one flat-fee package to the
// application (idempotent: a second call for the same application returns
// the existing package instead of creating another). Payment itself
// happens at the main application checkout, where this package appears as
// a single line item alongside the preparation fee.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'translation-package'), 20, 60)
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

  const flatFeeCents = await getFlatFeeCents(supabase)
  const pkg = await getOrCreatePackage(supabase, application.id, userId, flatFeeCents)

  // Every existing job that needs translation and isn't self-provided is
  // now covered by this package — flip them from "required" (no package
  // yet) to "submitted" (covered, queued). Jobs created after this point
  // pick up the package directly (see language-status route).
  await supabase
    .from('translations')
    .update({ translation_package_id: pkg.id, status: 'submitted' })
    .eq('application_id', application.id)
    .eq('self_provided', false)
    .eq('status', 'required')

  await logAudit({
    actorId: userId,
    action: 'translation_package.added',
    entityType: 'application_translation_package',
    entityId: pkg.id,
    metadata: { applicationId: application.id, priceCents: pkg.price_cents },
  })

  return NextResponse.json({ package: pkg })
}

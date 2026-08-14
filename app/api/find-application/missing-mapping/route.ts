import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'

// The Find My Application wizard resolves to a form_code, then looks that
// form_code up against the real application_types loaded from the
// database. If a form_code the decision tree can produce doesn't exist (or
// isn't active) in the catalog, the wizard shows a safe fallback instead of
// a dead link — and reports it here so the mismatch is visible without a
// customer having to notice a 404.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const formCode = typeof body.formCode === 'string' ? body.formCode.slice(0, 50) : 'unknown'

  await logAudit({
    action: 'find_application.unmapped_recommendation',
    entityType: 'application_type',
    metadata: { formCode },
  })

  return NextResponse.json({ ok: true })
}

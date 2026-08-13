'use server'

import { revalidatePath } from 'next/cache'
import { getAccessibleApplication } from '@/lib/applications'
import { generatePackage } from '@/lib/pdf/generate'

// Regenerates the filing package on demand. Normally the Stripe webhook
// triggers this the moment payment succeeds; this manual trigger exists so
// an owner can (re)generate after answer corrections, or so the flow keeps
// working in local development where a webhook tunnel may not be running.
// Guarded the same way every other mutation is — getAccessibleApplication
// throws unless the caller owns the application.
export async function regeneratePackage(formData: FormData) {
  const applicationId = String(formData.get('applicationId') ?? '')
  const { application } = await getAccessibleApplication(applicationId)
  if (application.status !== 'paid' && application.status !== 'package_ready') {
    throw new Error('Payment has not completed yet.')
  }
  await generatePackage(applicationId)
  revalidatePath(`/application/${applicationId}/package`)
}

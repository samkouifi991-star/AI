import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FindApplicationWizard } from '@/components/marketing/FindApplicationWizard'

export const metadata = { title: 'Find My Application' }

export default async function FindMyApplicationPage() {
  const supabase = createClient()
  // The wizard's decision tree only ever resolves to a form_code — it
  // looks the destination slug up against this real, current catalog
  // rather than guessing a URL, so a rename here can never produce a
  // recommendation link that 404s.
  const { data: applications } = await supabase
    .from('application_types')
    .select('slug, form_code, name, summary')
    .eq('is_active', true)

  return (
    <div className="container-page py-14">
      <Suspense fallback={null}>
        <FindApplicationWizard applications={applications ?? []} />
      </Suspense>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { ApplicationsDirectory } from '@/components/marketing/ApplicationsDirectory'

export const metadata = { title: 'All Applications' }

export default async function AllApplicationsPage({
  searchParams,
}: {
  searchParams: { goal?: string }
}) {
  const supabase = createClient()
  const { data: applications } = await supabase
    .from('application_types')
    .select('slug, form_code, name, short_name, summary, goal_categories')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="container-page py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">All Applications</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        Every immigration application Smart USA Visa supports, organized by goal or searchable by
        USCIS form number.
      </p>
      <div className="mt-8">
        <ApplicationsDirectory applications={applications ?? []} initialGoal={searchParams.goal} />
      </div>
    </div>
  )
}

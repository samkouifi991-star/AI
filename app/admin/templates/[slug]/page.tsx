import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin'
import { updateApplicationType, updateQuestion, createQuestion } from '@/app/actions/admin'

export default async function AdminTemplateDetailPage({ params }: { params: { slug: string } }) {
  const { supabase, profile } = await requireStaff()
  const { data: applicationType } = await supabase.from('application_types').select('*').eq('slug', params.slug).single()
  if (!applicationType) notFound()

  const { data: sections } = await supabase
    .from('sections')
    .select('*, questions(*)')
    .eq('application_type_id', applicationType.id)
    .order('sort_order')

  const canEdit = profile.role === 'admin'

  return (
    <div>
      <h1 className="text-2xl font-bold">{applicationType.form_code} — {applicationType.name}</h1>

      <div className="card mt-6">
        <h2 className="font-heading font-semibold">Content</h2>
        <form action={updateApplicationType} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={applicationType.id} />
          <div>
            <label className="field-label">Name</label>
            <input name="name" defaultValue={applicationType.name} className="field-input" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Summary</label>
            <textarea name="summary" defaultValue={applicationType.summary} rows={2} className="field-input" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Who it's for</label>
            <textarea name="who_its_for" defaultValue={applicationType.who_its_for} rows={2} className="field-input" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Eligibility overview</label>
            <textarea name="eligibility_overview" defaultValue={applicationType.eligibility_overview} rows={2} className="field-input" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Workflow overview</label>
            <textarea name="workflow_overview" defaultValue={applicationType.workflow_overview} rows={2} className="field-input" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Goal categories (comma-separated)</label>
            <input name="goal_categories" defaultValue={(applicationType.goal_categories ?? []).join(', ')} className="field-input" disabled={!canEdit} />
            <p className="field-help">Controls which /applications?goal= filters this shows under. An application can belong to more than one, e.g. &quot;family, fiance&quot;.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">CTA button text</label>
              <input name="cta_text" defaultValue={applicationType.cta_text ?? ''} placeholder={`Start My ${applicationType.form_code}`} className="field-input" disabled={!canEdit} />
            </div>
            <div>
              <label className="field-label">Estimated minutes</label>
              <input type="number" name="estimated_minutes" defaultValue={applicationType.estimated_minutes ?? ''} className="field-input" disabled={!canEdit} />
            </div>
          </div>
          <div>
            <label className="field-label">FAQs (JSON array of {'{'}question, answer{'}'})</label>
            <textarea name="faqs" defaultValue={JSON.stringify(applicationType.faqs ?? [], null, 2)} rows={6} className="field-input font-mono text-xs" disabled={!canEdit} />
          </div>
          <div>
            <label className="field-label">Associated forms (JSON array of {'{'}form_code, label, note{'}'})</label>
            <textarea name="associated_forms" defaultValue={JSON.stringify(applicationType.associated_forms ?? [], null, 2)} rows={4} className="field-input font-mono text-xs" disabled={!canEdit} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={applicationType.is_active} disabled={!canEdit} />
              Active (visible to customers)
            </label>
            <label className="flex items-center gap-2 text-sm">
              Sort order
              <input type="number" name="sort_order" defaultValue={applicationType.sort_order} className="field-input w-20" disabled={!canEdit} />
            </label>
          </div>
          {canEdit && <button type="submit" className="btn-primary">Save</button>}
        </form>
      </div>

      <div className="mt-8 space-y-6">
        {(sections ?? []).map((section: any) => (
          <div key={section.id} className="card">
            <h2 className="font-heading font-semibold">{section.title}</h2>
            <div className="mt-4 space-y-4">
              {section.questions
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((q: any) => (
                  <form key={q.id} action={updateQuestion} className="grid gap-3 border-b border-ink-100 pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="slug" value={params.slug} />
                    <div>
                      <label className="field-label">Prompt ({q.key})</label>
                      <input name="prompt" defaultValue={q.prompt} className="field-input" disabled={!canEdit} />
                      <label className="field-label mt-2">Help text</label>
                      <input name="help_text" defaultValue={q.help_text ?? ''} className="field-input" disabled={!canEdit} />
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="required" defaultChecked={q.required} disabled={!canEdit} />
                        Required
                      </label>
                      {canEdit && <button type="submit" className="btn-outline">Save</button>}
                    </div>
                  </form>
                ))}
            </div>

            {canEdit && (
              <form action={createQuestion} className="mt-4 grid gap-3 rounded-xl bg-ink-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="section_id" value={section.id} />
                <input type="hidden" name="slug" value={params.slug} />
                <input name="key" placeholder="question_key" className="field-input" required />
                <input name="prompt" placeholder="Prompt text" className="field-input" required />
                <button type="submit" className="btn-outline">+ Add Question</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

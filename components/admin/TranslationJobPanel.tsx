'use client'

import { useState } from 'react'
import { updateTranslationJob } from '@/app/actions/admin'
import { TranslationUpload } from './TranslationUpload'

const statusActions: { status: string; label: string }[] = [
  { status: 'in_progress', label: 'Mark In Progress' },
  { status: 'needs_attention', label: 'Needs Attention' },
  { status: 'completed', label: 'Mark Completed' },
]

async function viewFile(translationId: string, type: 'original' | 'translated' | 'certification') {
  const res = await fetch(`/api/admin/translations/${translationId}/file?type=${type}`)
  if (!res.ok) return
  const { url } = await res.json()
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

export function TranslationJobPanel({
  job,
  packageId,
}: {
  job: { id: string; document_label: string | null; source_language: string; status: string; provider_name: string | null }
  packageId: string
}) {
  const [translatorInput, setTranslatorInput] = useState(job.provider_name ?? '')

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-heading font-semibold">{job.document_label ?? 'Document'}</p>
          <p className="text-sm text-ink-500">{job.source_language} → English</p>
        </div>
        <span className="badge-neutral capitalize">{job.status.replace('_', ' ')}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button type="button" className="btn-ghost" onClick={() => viewFile(job.id, 'original')}>View Original</button>
        <button type="button" className="btn-ghost" onClick={() => viewFile(job.id, 'translated')}>View Translation</button>
        <button type="button" className="btn-ghost" onClick={() => viewFile(job.id, 'certification')}>View Certification</button>
      </div>

      <form action={updateTranslationJob} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={job.id} />
        <input type="hidden" name="package_id" value={packageId} />
        <label className="text-sm text-ink-500">Assigned translator</label>
        <input
          name="provider_name"
          value={translatorInput}
          onChange={(e) => setTranslatorInput(e.target.value)}
          placeholder="Translator or provider name"
          className="field-input w-auto flex-1 py-1.5"
        />
        <button type="submit" className="btn-outline">Save</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {statusActions.map((a) => (
          <form key={a.status} action={updateTranslationJob}>
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="package_id" value={packageId} />
            <input type="hidden" name="status" value={a.status} />
            <button type="submit" className={a.status === job.status ? 'btn-primary' : 'btn-outline'}>{a.label}</button>
          </form>
        ))}
      </div>

      <TranslationUpload translationId={job.id} />
    </div>
  )
}

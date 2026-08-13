'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type ChecklistItem = {
  id: string // application_document id
  label: string
  category: string
  description?: string | null
  status: 'missing' | 'uploaded' | 'accepted' | 'rejected'
  originalFilename?: string | null
  translation?: {
    id: string
    status: string
    sourceLanguage: string
    priceCents: number
  } | null
}

const categoryLabels: Record<string, string> = {
  identity: 'Identity',
  immigration: 'Immigration',
  relationship: 'Relationship',
  financial: 'Financial',
  other: 'Other',
}

const statusBadge: Record<ChecklistItem['status'], string> = {
  missing: 'badge-neutral',
  uploaded: 'badge-warning',
  accepted: 'badge-success',
  rejected: 'badge-danger',
}

const statusLabel: Record<ChecklistItem['status'], string> = {
  missing: 'Missing',
  uploaded: 'Uploaded — pending review',
  accepted: 'Accepted',
  rejected: 'Replace',
}

function DocumentRow({ applicationId, item }: { applicationId: string; item: ChecklistItem }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [language, setLanguage] = useState('')
  const [pages, setPages] = useState(1)
  const [requesting, setRequesting] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/applications/${applicationId}/documents/${item.id}/upload`, { method: 'POST', body: formData })
    setUploading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Upload failed')
      return
    }
    router.refresh()
  }

  async function handleView() {
    const res = await fetch(`/api/applications/${applicationId}/documents/${item.id}/signed-url`)
    if (!res.ok) return
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function requestTranslation() {
    if (!language.trim()) return
    setRequesting(true)
    const res = await fetch(`/api/applications/${applicationId}/documents/${item.id}/translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceLanguage: language, pageCount: pages }),
    })
    setRequesting(false)
    if (res.ok) {
      setShowTranslation(false)
      router.refresh()
    }
  }

  async function payForTranslation(translationId: string) {
    const res = await fetch(`/api/translations/${translationId}/checkout`, { method: 'POST' })
    if (!res.ok) return
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  return (
    <div className="rounded-xl border border-ink-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink-900">{item.label}</p>
          {item.description && <p className="mt-1 text-sm text-ink-500">{item.description}</p>}
          {item.originalFilename && <p className="mt-1 text-xs text-ink-400">{item.originalFilename}</p>}
        </div>
        <span className={statusBadge[item.status]}>{statusLabel[item.status]}</span>
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
        <button type="button" className="btn-outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? 'Uploading…' : item.status === 'missing' ? 'Upload Document' : 'Replace File'}
        </button>
        {item.status !== 'missing' && (
          <button type="button" className="btn-ghost" onClick={handleView}>View</button>
        )}
        {item.status !== 'missing' && !item.translation && (
          <button type="button" className="btn-ghost" onClick={() => setShowTranslation((v) => !v)}>
            Needs translation?
          </button>
        )}
      </div>

      {showTranslation && (
        <div className="mt-3 rounded-lg bg-ink-50 p-3">
          <p className="text-sm font-medium text-ink-800">Request a certified translation</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              placeholder="Document language (e.g. Spanish)"
              className="field-input flex-1"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
            <input
              type="number"
              min={1}
              className="field-input w-24"
              value={pages}
              onChange={(e) => setPages(Number(e.target.value) || 1)}
            />
            <button type="button" className="btn-primary" disabled={requesting} onClick={requestTranslation}>
              Get Price
            </button>
          </div>
        </div>
      )}

      {item.translation && (
        <div className="mt-3 rounded-lg bg-harbor-50 p-3 text-sm">
          <p className="font-medium text-ink-800">
            Certified translation ({item.translation.sourceLanguage}) — {(item.translation.priceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
          <p className="mt-1 text-ink-600 capitalize">Status: {item.translation.status.replace('_', ' ')}</p>
          {item.translation.status === 'requested' && (
            <button type="button" className="btn-primary mt-2" onClick={() => payForTranslation(item.translation!.id)}>
              Pay &amp; Request Certified Translation
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function DocumentChecklist({ applicationId, items }: { applicationId: string; items: ChecklistItem[] }) {
  const categories = Array.from(new Set(items.map((i) => i.category)))

  if (items.length === 0) {
    return <p className="text-ink-600">No documents are required for this application based on your answers so far.</p>
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <div key={category}>
          <h2 className="font-heading text-lg font-semibold">{categoryLabels[category] ?? category}</h2>
          <div className="mt-3 space-y-3">
            {items.filter((i) => i.category === category).map((item) => (
              <DocumentRow key={item.id} applicationId={applicationId} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

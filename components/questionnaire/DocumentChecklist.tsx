'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type TranslationInfo = {
  id: string
  status: string
  sourceLanguage: string
  selfProvided: boolean
  hasTranslatedFile: boolean
  hasCertificationFile: boolean
}

type ChecklistItem = {
  id: string // application_document id
  label: string
  category: string
  description?: string | null
  status: 'missing' | 'uploaded' | 'accepted' | 'rejected'
  originalFilename?: string | null
  needsTranslation: boolean
  translation: TranslationInfo | null
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

const jobStatusLabel: Record<string, string> = {
  required: 'Translation required',
  awaiting_upload: 'Awaiting your upload',
  submitted: 'Submitted — queued for translation',
  in_progress: 'Translation in progress',
  completed: 'Translation completed',
  needs_attention: 'Needs attention',
}

const LANGUAGES = [
  'Spanish', 'Arabic', 'French', 'Chinese', 'Russian', 'Ukrainian', 'Portuguese',
  'Korean', 'Vietnamese', 'Farsi/Persian', 'Turkish', 'German', 'Italian', 'Other',
]

function DocumentRow({
  applicationId,
  item,
  hasPackage,
  flatFeeCents,
}: {
  applicationId: string
  item: ChecklistItem
  hasPackage: boolean
  flatFeeCents: number
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const translatedInput = useRef<HTMLInputElement>(null)
  const certInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<'needs_translation' | 'self_provided' | null>(null)
  const [language, setLanguage] = useState('Spanish')
  const [customLanguage, setCustomLanguage] = useState('')
  const [busy, setBusy] = useState(false)

  const languageChoice: 'english' | 'needs_translation' | 'self_provided' | null = item.translation
    ? item.translation.selfProvided
      ? 'self_provided'
      : 'needs_translation'
    : item.needsTranslation === false && item.status !== 'missing'
      ? 'english'
      : null

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

  async function setLanguageStatus(languageStatus: 'english' | 'needs_translation' | 'self_provided') {
    setBusy(true)
    setError(null)
    const sourceLanguage = language === 'Other' ? customLanguage.trim() : language
    const res = await fetch(`/api/applications/${applicationId}/documents/${item.id}/language-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageStatus, sourceLanguage: languageStatus === 'english' ? undefined : sourceLanguage }),
    })
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not save your answer')
      return
    }
    setPendingChoice(null)
    router.refresh()
  }

  async function addPackage() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/applications/${applicationId}/translation-package`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not add the translation package')
      return
    }
    router.refresh()
  }

  async function handleSelfTranslationUpload() {
    const translatedFile = translatedInput.current?.files?.[0]
    if (!translatedFile) {
      setError('Choose your translated file first.')
      return
    }
    setBusy(true)
    setError(null)
    const formData = new FormData()
    formData.append('translatedFile', translatedFile)
    const certFile = certInput.current?.files?.[0]
    if (certFile) formData.append('certificationFile', certFile)
    const res = await fetch(`/api/applications/${applicationId}/documents/${item.id}/self-translation-upload`, {
      method: 'POST',
      body: formData,
    })
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Upload failed')
      return
    }
    router.refresh()
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
      </div>

      {item.status !== 'missing' && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          {languageChoice === null && !pendingChoice && (
            <div>
              <p className="text-sm font-medium text-ink-800">Is this document in English?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <button type="button" className="select-card py-2 text-sm" disabled={busy} onClick={() => setLanguageStatus('english')}>
                  Yes, it&apos;s already in English
                </button>
                <button type="button" className="select-card py-2 text-sm" disabled={busy} onClick={() => setPendingChoice('needs_translation')}>
                  No, it needs an English translation
                </button>
                <button type="button" className="select-card py-2 text-sm" disabled={busy} onClick={() => setPendingChoice('self_provided')}>
                  I already have an English translation
                </button>
              </div>
            </div>
          )}

          {pendingChoice && (
            <div className="rounded-lg bg-ink-50 p-3">
              <p className="text-sm font-medium text-ink-800">What language is this document written in?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="field-input w-auto py-1.5">
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                {language === 'Other' && (
                  <input
                    placeholder="Enter language"
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                    className="field-input w-auto flex-1"
                  />
                )}
                <button type="button" className="btn-primary" disabled={busy} onClick={() => setLanguageStatus(pendingChoice)}>
                  Confirm
                </button>
                <button type="button" className="btn-ghost" onClick={() => setPendingChoice(null)}>Cancel</button>
              </div>
            </div>
          )}

          {languageChoice === 'english' && (
            <p className="text-sm text-ink-500">In English — no translation needed.</p>
          )}

          {languageChoice === 'needs_translation' && item.translation && (
            <div>
              <p className="text-sm text-ink-600">Original language: {item.translation.sourceLanguage}</p>
              {hasPackage ? (
                <div className="mt-2 rounded-lg bg-success-50 p-3 text-sm text-success-600">
                  ✓ Covered by your Translation Package — {jobStatusLabel[item.translation.status] ?? item.translation.status}
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-harbor-50 p-4">
                  <p className="font-heading font-semibold text-ink-900">Need documents translated?</p>
                  <p className="mt-1 text-sm text-ink-700">
                    <strong>Certified Document Translation Package</strong> — get all required non-English
                    supporting documents for this application translated into English.
                  </p>
                  <p className="mt-1 text-sm font-semibold text-harbor-800">
                    One flat fee: {(flatFeeCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </p>
                  <button type="button" className="btn-primary mt-3" disabled={busy} onClick={addPackage}>
                    Add Translation Package — {(flatFeeCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </button>
                </div>
              )}
            </div>
          )}

          {languageChoice === 'self_provided' && item.translation && (
            <div>
              <p className="text-sm text-ink-600">Original language: {item.translation.sourceLanguage}</p>
              {item.translation.hasTranslatedFile ? (
                <p className="mt-2 text-sm text-success-600">✓ Your translation is uploaded{item.translation.hasCertificationFile ? ' with certification' : ''}.</p>
              ) : (
                <div className="mt-3 space-y-2 rounded-lg bg-ink-50 p-3 text-sm">
                  <div>
                    <label className="field-label">English translation file</label>
                    <input ref={translatedInput} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs" />
                  </div>
                  <div>
                    <label className="field-label">Translator certification (optional)</label>
                    <input ref={certInput} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs" />
                  </div>
                  <button type="button" className="btn-outline" disabled={busy} onClick={handleSelfTranslationUpload}>
                    Upload My Translation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DocumentChecklist({
  applicationId,
  items,
  hasPackage,
  flatFeeCents,
}: {
  applicationId: string
  items: ChecklistItem[]
  hasPackage: boolean
  flatFeeCents: number
}) {
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
              <DocumentRow key={item.id} applicationId={applicationId} item={item} hasPackage={hasPackage} flatFeeCents={flatFeeCents} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

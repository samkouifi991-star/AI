'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function TranslationUpload({ translationId }: { translationId: string }) {
  const router = useRouter()
  const translatedRef = useRef<HTMLInputElement>(null)
  const certRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData()
    if (translatedRef.current?.files?.[0]) formData.append('translatedFile', translatedRef.current.files[0])
    if (certRef.current?.files?.[0]) formData.append('certificationFile', certRef.current.files[0])
    await fetch(`/api/admin/translations/${translationId}/upload`, { method: 'POST', body: formData })
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <label className="text-ink-500">Translated file</label>
      <input ref={translatedRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs" />
      <label className="text-ink-500">Certification</label>
      <input ref={certRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs" />
      <button type="submit" disabled={loading} className="btn-outline">
        {loading ? 'Uploading…' : 'Deliver Translation'}
      </button>
    </form>
  )
}

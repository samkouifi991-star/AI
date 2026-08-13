'use client'

import { useState } from 'react'

export function TranslationPayButton({ translationId }: { translationId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch(`/api/translations/${translationId}/checkout`, { method: 'POST' })
    if (!res.ok) {
      setLoading(false)
      return
    }
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className="btn-primary mt-3">
      {loading ? 'Redirecting…' : 'Pay & Request Certified Translation'}
    </button>
  )
}

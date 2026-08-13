'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/engine/pricing'

export function CheckoutPanel({
  applicationId,
  serviceFeeCents,
  printMailFeeCents,
  governmentFees,
  translationLines,
}: {
  applicationId: string
  serviceFeeCents: number
  printMailFeeCents: number
  governmentFees: { label: string; amountCents: number }[]
  translationLines: { label: string; amountCents: number; status: string }[]
}) {
  const [includePrintMail, setIncludePrintMail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = serviceFeeCents + (includePrintMail ? printMailFeeCents : 0)

  async function handlePay() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/applications/${applicationId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includePrintMail }),
    })
    if (!res.ok) {
      setLoading(false)
      setError('Could not start checkout. Please try again.')
      return
    }
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  return (
    <div className="card">
      <h2 className="font-heading text-lg font-semibold">Order summary</h2>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-600">Smart USA Visa preparation service</span>
          <span className="font-medium text-ink-900">{formatCents(serviceFeeCents)}</span>
        </div>

        <label className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
          <span className="flex items-center gap-2 text-ink-700">
            <input type="checkbox" checked={includePrintMail} onChange={(e) => setIncludePrintMail(e.target.checked)} />
            Optional print &amp; mail service
          </span>
          <span className="font-medium text-ink-900">{formatCents(printMailFeeCents)}</span>
        </label>

        {translationLines.map((t, i) => (
          <div key={i} className="flex justify-between text-ink-500">
            <span>Translation ({t.label}) — {t.status.replace('_', ' ')}</span>
            <span>{formatCents(t.amountCents)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between border-t border-ink-100 pt-4 font-heading text-lg font-bold">
        <span>Charged today</span>
        <span>{formatCents(total)}</span>
      </div>

      {governmentFees.length > 0 && (
        <div className="mt-6 rounded-xl bg-warning-50 p-4 text-sm text-ink-700">
          <p className="font-semibold">Not collected by Smart USA Visa</p>
          {governmentFees.map((f, i) => (
            <div key={i} className="mt-1 flex justify-between">
              <span>{f.label}</span>
              <span>{f.amountCents > 0 ? formatCents(f.amountCents) : 'No fee'}</span>
            </div>
          ))}
          <p className="mt-2 text-xs">
            Government filing fees are paid by you directly to USCIS when you file — Smart USA Visa
            never collects them on the government's behalf.
          </p>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      <button type="button" onClick={handlePay} disabled={loading} className="btn-primary mt-6 w-full text-base">
        {loading ? 'Redirecting to payment…' : `Pay ${formatCents(total)}`}
      </button>
      <p className="mt-3 text-center text-xs text-ink-500">Secure payment powered by Stripe.</p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="card text-center">
        <h1 className="font-heading text-xl font-bold">Check your email</h1>
        <p className="mt-3 text-sm text-ink-600">
          If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h1 className="font-heading text-xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-500">We'll email you a secure link.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <p className="field-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        <Link href="/sign-in" className="font-semibold text-harbor-700">← Back to sign in</Link>
      </p>
    </div>
  )
}

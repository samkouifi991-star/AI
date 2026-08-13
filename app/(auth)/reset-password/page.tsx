'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    // The recovery link Supabase emails the user establishes a temporary
    // session automatically (detectSessionInUrl) — updateUser() here sets
    // the new password on that session.
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (done) {
    return (
      <div className="card text-center">
        <h1 className="font-heading text-xl font-bold">Password updated</h1>
        <p className="mt-3 text-sm text-ink-600">Redirecting you to your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h1 className="font-heading text-xl font-bold">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <p className="field-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="password">New password</label>
          <input id="password" type="password" required minLength={8} className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

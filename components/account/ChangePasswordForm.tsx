'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setPassword('')
    setMessage({ type: 'ok', text: 'Password updated.' })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {message && (
        <p className={message.type === 'ok' ? 'text-sm text-success-600' : 'field-error'}>{message.text}</p>
      )}
      <div>
        <label className="field-label" htmlFor="newPassword">New password</label>
        <input id="newPassword" type="password" minLength={8} required className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" disabled={loading} className="btn-outline">
        {loading ? 'Updating…' : 'Update Password'}
      </button>
    </form>
  )
}

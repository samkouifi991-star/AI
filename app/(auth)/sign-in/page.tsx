'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/GoogleButton'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (signInError) {
      setError(signInError.message === 'Invalid login credentials' ? 'Incorrect email or password.' : signInError.message)
      return
    }

    await fetch('/api/auth/claim', { method: 'POST' })
    router.push(next)
    router.refresh()
  }

  return (
    <div className="card">
      <h1 className="font-heading text-xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-500">Continue your application.</p>

      <div className="mt-6">
        <GoogleButton next={next} />
      </div>
      <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
        <div className="h-px flex-1 bg-ink-200" />
        OR
        <div className="h-px flex-1 bg-ink-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="field-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-harbor-700">Forgot password?</Link>
          </div>
          <input id="password" type="password" required className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-600">
        Don&apos;t have an account?{' '}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-harbor-700">
          Create one
        </Link>
      </p>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}

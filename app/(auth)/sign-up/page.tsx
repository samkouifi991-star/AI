'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/GoogleButton'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    if (data.session) {
      await fetch('/api/auth/claim', { method: 'POST' })
      router.push(next)
      router.refresh()
    } else {
      setNeedsVerification(true)
    }
  }

  if (needsVerification) {
    return (
      <div className="card text-center">
        <h1 className="font-heading text-xl font-bold">Check your email</h1>
        <p className="mt-3 text-sm text-ink-600">
          We sent a verification link to <strong>{email}</strong>. Click it to activate your
          account — everything you already answered will be right where you left it.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h1 className="font-heading text-xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-500">Pick up exactly where you left off.</p>

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
          <label className="field-label" htmlFor="fullName">Full name</label>
          <input id="fullName" required className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="field-help">At least 8 characters.</p>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-harbor-700">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}

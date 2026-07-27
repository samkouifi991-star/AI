'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // onboarding creates the `businesses` row for this user
    router.push('/onboarding');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <a href="/" className="text-sm text-slate-500 hover:text-ink">← Back to businesspilot.ai</a>
        </div>        <h1 className="text-2xl font-display font-semibold mb-1">Create your account</h1>
        <p className="text-slate-600 text-sm mb-6">Set up your AI receptionist in a few minutes.</p>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-slate-600 mt-4 text-center">
          Already have an account? <a href="/login" className="text-brand-600 font-medium">Log in</a>
        </p>
      </div>
    </div>
  );
}

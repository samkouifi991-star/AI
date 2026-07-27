'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const {
      data: { user: signedInUser }
    } = await supabase.auth.getUser();

    // Incomplete accounts (no business record yet, or onboarding never
    // finished) go to /onboarding; everyone else goes straight to the
    // dashboard. Checked here rather than assumed, since "log in" and
    // "just signed up" are different entry points that both land here.
    let destination = '/dashboard';
    if (signedInUser) {
      const { data: business } = await supabase
        .from('businesses')
        .select('id, is_live')
        .eq('owner_user_id', signedInUser.id)
        .single();
      if (!business || !business.is_live) destination = '/onboarding';
    }

    router.push(destination);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <a href="/" className="text-sm text-slate-500 hover:text-ink">← Back to businesspilot.ai</a>
        </div>
        <h1 className="text-2xl font-display font-semibold mb-1">Welcome back</h1>
        <p className="text-slate-600 text-sm mb-6">Log in to your Business Pilot AI dashboard.</p>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="text-sm text-slate-600 mt-4 text-center">
          Don&apos;t have an account? <a href="/signup" className="text-brand-600 font-medium">Sign up</a>
        </p>
      </div>
    </div>
  );
}

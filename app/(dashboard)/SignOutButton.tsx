'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Real sign-out: ends the Supabase session (not just a client-side route
 * change), then does a full page navigation to /login so every server
 * component re-checks auth against the now-cleared session cookie rather
 * than serving anything cached from before sign-out.
 */
export default function SignOutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  return (
    <button onClick={handleSignOut} disabled={loading} className={className}>
      {loading ? 'Signing out…' : 'Log out'}
    </button>
  );
}

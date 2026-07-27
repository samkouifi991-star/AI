import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-safe Supabase client. Import this ONLY from client components
 * ('use client'). Contains no server-only imports (no next/headers, no
 * service role key), so it can never trigger the
 * "You're importing a component that needs next/headers" build error.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

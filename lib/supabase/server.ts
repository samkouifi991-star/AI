import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-only Supabase client. Imports next/headers, so this file (and
 * anything that imports it) can ONLY be used in Server Components, Route
 * Handlers, and Server Actions — never in a file marked 'use client', and
 * never imported (even transitively) from one. Respects the logged-in
 * user's session + RLS.
 */
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        }
      }
    }
  );
}

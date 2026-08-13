import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client. SERVER-ONLY — never import this from a Client
// Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser. Used for:
// operations that must bypass RLS (webhooks, PDF generation, signed URL
// issuance, admin CRUD after an explicit role check).
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() must never be called from client code')
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

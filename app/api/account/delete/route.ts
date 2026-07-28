import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Permanently deletes the signed-in user's account. Requires the caller to
 * re-enter their current password, verified via a real sign-in attempt
 * against a throwaway (non-session-persisting) Supabase client — never
 * trusting the client to have checked this itself.
 *
 * Deleting the auth.users row cascades through owner_user_id references
 * (businesses.owner_user_id ... on delete cascade, and every business-scoped
 * table beneath it), so the business and all its data are removed as a
 * consequence of the same admin.deleteUser() call — not a separate manual
 * cleanup pass that could be forgotten or get out of sync.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { password } = await req.json();
  if (!password) return NextResponse.json({ error: 'Password is required to delete your account.' }, { status: 400 });

  // Verify the password for real, via a client that never touches this
  // request's session cookies.
  const verifyClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }
  });
  const { error: signInError } = await verifyClient.auth.signInWithPassword({ email: user.email, password });
  if (signInError) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const admin = supabaseServiceRole();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    logger.error('account_delete_failed', { userId: user.id, message: deleteError.message });
    return NextResponse.json({ error: 'Could not delete your account. Please try again or contact support.' }, { status: 500 });
  }

  logger.warn('account_deleted', { userId: user.id });
  return NextResponse.json({ ok: true });
}

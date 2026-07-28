import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { releaseNumber, twilioClientForSubaccount, closeSubaccount } from '@/lib/twilio';
import { deleteVapiPhoneNumber, deleteAssistant } from '@/lib/vapi-assistant';
import { logger } from '@/lib/logger';

type NumberDisposition = 'keep' | 'release' | 'release_and_close';

/**
 * Permanently deletes the signed-in user's account. Requires the caller to
 * re-enter their current password, verified via a real sign-in attempt
 * against a throwaway (non-session-persisting) Supabase client — never
 * trusting the client to have checked this itself.
 *
 * If the business has an active phone number, the caller must explicitly
 * choose what happens to it — there is no default that silently releases
 * (or silently keeps billing) a real Twilio resource:
 *   'keep'               — stop Business Pilot AI managing it; the number
 *                           and its Twilio subaccount are left untouched.
 *   'release'             — release the number back to Twilio (stops the
 *                           per-number rental charge); subaccount stays open.
 *   'release_and_close'   — release the number AND close the subaccount
 *                           (stops all further Twilio charges for it).
 * In every case the Vapi phone-number import and assistant are removed —
 * once the business row is gone there is no valid owner left for calls to
 * resolve to, so leaving them live would only produce broken calls.
 *
 * Deleting the auth.users row cascades through owner_user_id references
 * (businesses.owner_user_id ... on delete cascade, and every business-scoped
 * table beneath it). Because that cascade also deletes provider_usage/
 * provider_costs/customer_usage_summary, this route archives a copy of
 * those rows into deleted_account_billing_archive (no FK to businesses,
 * survives the cascade, service-role read only) before the user is deleted.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { password, numberDisposition } = (await req.json()) as { password?: string; numberDisposition?: NumberDisposition };
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

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, twilio_subaccount_sid, twilio_subaccount_auth_token_encrypted')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (business) {
    const { data: activeNumbers } = await admin
      .from('phone_numbers')
      .select('id, twilio_sid, vapi_phone_number_id, vapi_assistant_id')
      .eq('business_id', business.id)
      .eq('status', 'active');

    // Only require (and only act on) a disposition choice if there is
    // actually a paid resource in play — nothing to ask if the business
    // never got as far as connecting a number.
    if (activeNumbers && activeNumbers.length > 0) {
      if (!numberDisposition) {
        return NextResponse.json(
          { error: 'number_disposition_required', activeNumberCount: activeNumbers.length },
          { status: 409 }
        );
      }

      for (const num of activeNumbers) {
        if (num.vapi_phone_number_id) await deleteVapiPhoneNumber(num.vapi_phone_number_id);
        if (num.vapi_assistant_id) await deleteAssistant(num.vapi_assistant_id);

        if (numberDisposition !== 'keep' && num.twilio_sid && business.twilio_subaccount_sid && business.twilio_subaccount_auth_token_encrypted) {
          try {
            const subClient = twilioClientForSubaccount(business.twilio_subaccount_sid, business.twilio_subaccount_auth_token_encrypted);
            await releaseNumber(num.twilio_sid, subClient);
          } catch (err: any) {
            logger.error('account_delete_release_number_failed', { businessId: business.id, twilioSid: num.twilio_sid, message: err.message });
          }
        }
      }

      if (numberDisposition === 'release_and_close' && business.twilio_subaccount_sid) {
        try {
          await closeSubaccount(business.twilio_subaccount_sid);
        } catch (err: any) {
          logger.error('account_delete_close_subaccount_failed', { businessId: business.id, message: err.message });
        }
      }
    }

    // Billing/legal retention archive — copied before the cascade removes
    // the live rows, keyed by business_id/name/email rather than a live FK
    // so it survives the account being gone.
    const [{ data: usageRows }, { data: costRows }] = await Promise.all([
      admin.from('provider_usage').select('*').eq('business_id', business.id),
      admin.from('provider_costs').select('*').eq('business_id', business.id)
    ]);
    const archivedDisposition =
      activeNumbers && activeNumbers.length > 0
        ? numberDisposition === 'release'
          ? 'released'
          : numberDisposition === 'release_and_close'
          ? 'released_and_subaccount_closed'
          : 'kept'
        : 'kept';
    await admin.from('deleted_account_billing_archive').insert({
      business_id: business.id,
      business_name: business.name,
      owner_email: user.email,
      twilio_subaccount_sid: business.twilio_subaccount_sid,
      number_disposition: archivedDisposition,
      usage_records: usageRows ?? [],
      cost_records: costRows ?? []
    });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    logger.error('account_delete_failed', { userId: user.id, message: deleteError.message });
    return NextResponse.json({ error: 'Could not delete your account. Please try again or contact support.' }, { status: 500 });
  }

  logger.warn('account_deleted', { userId: user.id, numberDisposition: numberDisposition ?? 'n/a' });
  return NextResponse.json({ ok: true });
}

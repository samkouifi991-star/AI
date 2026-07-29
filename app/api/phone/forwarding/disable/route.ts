import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

async function getBusinessId(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  return business?.id ?? null;
}

/**
 * Marks call forwarding as disabled — but only ever from the customer's
 * own confirmation. There is no server-observable signal for "a call did
 * NOT get forwarded" the way there is for "a call arrived" (which
 * /api/phone/test's forwarding_verify checks against real call rows), so
 * this route requires an explicit { confirmed: true } and never infers the
 * disabled state from anything else.
 *
 * Deliberately does not touch phone_numbers, Twilio, or Vapi — disabling
 * forwarding and releasing/canceling the AI number are separate actions
 * that each require their own explicit confirmation.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { confirmed } = await req.json();
  if (!confirmed) {
    return NextResponse.json({ error: 'Confirmation is required before forwarding can be marked disabled.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('forwarding_setups')
    .update({
      forwarding_active: false,
      disabled_at: new Date().toISOString(),
      disabled_confirmed_by_customer: true,
      updated_at: new Date().toISOString()
    })
    .eq('business_id', businessId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ businessId, actorUserId: user?.id, action: 'call_forwarding_disabled' });
  return NextResponse.json({ ok: true });
}

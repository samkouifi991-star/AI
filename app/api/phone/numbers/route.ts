import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { releaseNumber } from '@/lib/twilio';
import { deleteVapiPhoneNumber } from '@/lib/vapi-assistant';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';

async function getBusinessId(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  return business?.id ?? null;
}

export async function GET() {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('business_id', businessId)
    .neq('status', 'released')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ numbers: data });
}

// PATCH { id, friendlyName? } — rename. Assign/unassign to a different
// assistant is a separate concern handled once multi-assistant support
// exists; today every number attaches to the business's single assistant,
// so "assign" is effectively automatic at provisioning time.
export async function PATCH(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id, friendlyName } = await req.json();
  const { error } = await supabase
    .from('phone_numbers')
    .update({ friendly_name: friendlyName })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ businessId, actorUserId: user?.id, action: 'number_renamed', resourceType: 'phone_number', resourceId: id, metadata: { friendlyName } });
  return NextResponse.json({ ok: true });
}

// DELETE { id, confirm: true } — releases the number from Twilio and
// detaches it from Vapi. Requires confirm:true explicitly (the UI must ask
// "are you sure?" before ever sending this) and re-checks the caller is
// the number's actual owner via the business_id filter, independent of RLS.
export async function DELETE(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id, confirm } = await req.json();
  if (!confirm) {
    return NextResponse.json({ error: 'Confirmation required before releasing a number.' }, { status: 400 });
  }

  const { data: number, error: fetchError } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .single();
  if (fetchError || !number) return NextResponse.json({ error: 'Number not found' }, { status: 404 });

  await supabase.from('phone_numbers').update({ status: 'releasing' }).eq('id', id);

  try {
    if (number.vapi_phone_number_id) await deleteVapiPhoneNumber(number.vapi_phone_number_id);
    if (number.source === 'purchased' && number.twilio_sid) await releaseNumber(number.twilio_sid);
  } catch (err: any) {
    logger.error('phone_release_failed', { id, message: err.message });
    await supabase.from('phone_numbers').update({ status: 'error', error_message: err.message }).eq('id', id);
    return NextResponse.json({ error: `Release failed: ${err.message}` }, { status: 502 });
  }

  await supabase
    .from('phone_numbers')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', id);

  await supabase.from('phone_number_assignments').insert({
    phone_number_id: id,
    business_id: businessId,
    action: 'unassigned'
  });

  await logAudit({ businessId, actorUserId: user?.id, action: 'number_released', resourceType: 'phone_number', resourceId: id, metadata: { phoneNumber: number.phone_number } });

  return NextResponse.json({ ok: true });
}

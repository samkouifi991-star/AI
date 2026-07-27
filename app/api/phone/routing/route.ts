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

export async function GET() {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [{ data: rules }, { data: destinations }, { data: hours }] = await Promise.all([
    supabase.from('call_routing_rules').select('*').eq('business_id', businessId).single(),
    supabase.from('transfer_destinations').select('*').eq('business_id', businessId).order('priority'),
    supabase.from('business_hours').select('*').eq('business_id', businessId).order('day_of_week')
  ]);

  return NextResponse.json({ rules: rules ?? null, destinations: destinations ?? [], hours: hours ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();

  const { error: rulesError } = await supabase.from('call_routing_rules').upsert(
    {
      business_id: businessId,
      mode: body.mode,
      ring_seconds_before_ai: body.ringSecondsBeforeAi,
      fallback_transfer_number: body.fallbackTransferNumber ?? null,
      emergency_transfer_number: body.emergencyTransferNumber ?? null,
      transfer_on_low_confidence: !!body.transferOnLowConfidence,
      transfer_on_customer_request: !!body.transferOnCustomerRequest,
      department_routing: body.departmentRouting ?? {},
      voicemail_fallback_enabled: !!body.voicemailFallbackEnabled,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'business_id' }
  );
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  if (Array.isArray(body.destinations)) {
    await supabase.from('transfer_destinations').delete().eq('business_id', businessId);
    if (body.destinations.length > 0) {
      await supabase.from('transfer_destinations').insert(
        body.destinations.map((d: any, i: number) => ({
          business_id: businessId,
          label: d.label,
          department: d.department ?? null,
          phone_number: d.phoneNumber,
          priority: i,
          is_emergency_contact: !!d.isEmergencyContact
        }))
      );
    }
  }

  await logAudit({ businessId, actorUserId: user?.id, action: 'routing_changed', resourceType: 'call_routing_rules', metadata: { mode: body.mode } });

  return NextResponse.json({ ok: true });
}

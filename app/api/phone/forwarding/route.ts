import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

async function getBusinessId(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  return business?.id ?? null;
}

// GET returns the business's forwarding setup + the AI destination number
// + the full carrier-code reference table (static, shared across all
// businesses) so the frontend can render carrier-specific instructions.
export async function GET() {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: setup } = await supabase.from('forwarding_setups').select('*').eq('business_id', businessId).single();
  const { data: carrierCodes } = await supabase.from('carrier_forwarding_codes').select('*');
  const { data: business } = await supabase.from('businesses').select('ai_phone_number').eq('id', businessId).single();

  return NextResponse.json({
    setup: setup ?? null,
    aiDestinationNumber: business?.ai_phone_number ?? null,
    carrierCodes: carrierCodes ?? []
  });
}

// POST saves/updates the forwarding configuration.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { error } = await supabase.from('forwarding_setups').upsert(
    {
      business_id: businessId,
      existing_number: body.existingNumber,
      carrier: body.carrier,
      forward_all_calls: !!body.forwardAllCalls,
      forward_missed_calls: !!body.forwardMissedCalls,
      forward_when_busy: !!body.forwardWhenBusy,
      forward_after_hours: !!body.forwardAfterHours,
      fallback_transfer_number: body.fallbackTransferNumber ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'business_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

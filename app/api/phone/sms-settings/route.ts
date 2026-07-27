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

export async function GET() {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data } = await supabase.from('sms_settings').select('*').eq('business_id', businessId).single();
  return NextResponse.json({ settings: data ?? null });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { error } = await supabase.from('sms_settings').upsert(
    {
      business_id: businessId,
      payment_link_messages: !!body.paymentLinkMessages,
      appointment_confirmations: !!body.appointmentConfirmations,
      order_confirmations: !!body.orderConfirmations,
      missed_call_followup: !!body.missedCallFollowup,
      custom_templates: body.customTemplates ?? {},
      opt_out_text: body.optOutText,
      business_display_name: body.businessDisplayName ?? null,
      default_sender_number: body.defaultSenderNumber ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'business_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

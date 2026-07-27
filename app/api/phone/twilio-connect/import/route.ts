import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { runImportByoNumberWorkflow } from '@/lib/provisioning';

// POST { twilioSid, phoneNumber }
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const { data: connection } = await supabase
    .from('provider_connections')
    .select('account_sid, encrypted_auth_token, status')
    .eq('business_id', business.id)
    .eq('provider', 'twilio')
    .single();

  if (!connection || connection.status !== 'connected' || !connection.encrypted_auth_token) {
    return NextResponse.json({ error: 'Connect a Twilio account first.' }, { status: 400 });
  }

  const { twilioSid, phoneNumber } = await req.json();
  if (!twilioSid || !phoneNumber) {
    return NextResponse.json({ error: 'twilioSid and phoneNumber are required' }, { status: 400 });
  }

  const result = await runImportByoNumberWorkflow({
    businessId: business.id,
    twilioAccountSid: connection.account_sid!,
    encryptedAuthToken: connection.encrypted_auth_token,
    phoneNumber,
    twilioSid
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, failedStep: result.failedStep, jobId: result.jobId }, { status: 502 });
  }
  return NextResponse.json({ ok: true, jobId: result.jobId, phoneNumberId: result.phoneNumberId });
}

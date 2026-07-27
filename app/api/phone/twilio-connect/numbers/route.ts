import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { twilioClientForConnection, listAccountNumbers } from '@/lib/twilio';

export async function GET() {
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

  try {
    const client = twilioClientForConnection(connection.account_sid!, connection.encrypted_auth_token);
    const numbers = await listAccountNumbers(client);
    return NextResponse.json({ numbers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not list numbers' }, { status: 502 });
  }
}

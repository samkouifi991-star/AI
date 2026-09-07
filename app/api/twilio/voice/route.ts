import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import twilio from 'twilio';

/**
 * Twilio calls this when someone dials a business's number. Two distinct
 * cases, resolved in this order:
 *
 *  1. The dialed number IS the business's direct AI-answering number
 *     (phone_numbers table, purchased through this app's own
 *     provisioning) AND that business is on voice_runtime='direct' —
 *     return <Connect><Stream> pointing at the Railway voice worker, with
 *     the business id as a stream Parameter (how the worker resolves
 *     which business a call belongs to — see worker/src/twilio-stream.ts).
 *     voice_runtime='vapi' numbers never reach this branch: Vapi's own
 *     imported number answers those directly, this route only exists for
 *     'direct' runtime and the forwarding case below.
 *
 *  2. Otherwise, fall back to the original forwarding behavior: the
 *     dialed number is the business's own public number
 *     (businesses.phone_number), forwarded to their ai_phone_number.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const to = form.get('To') as string;
  const from = form.get('From') as string;
  const callSid = form.get('CallSid') as string;

  const supabase = supabaseServiceRole();

  const { data: directNumber } = await supabase
    .from('phone_numbers')
    .select('business_id, businesses(id, name, voice_runtime)')
    .eq('phone_number', to)
    .eq('status', 'active')
    .maybeSingle();

  const directBusiness = (directNumber as any)?.businesses;
  if (directBusiness?.voice_runtime === 'direct') {
    const workerUrl = process.env.VOICE_WORKER_URL;
    if (!workerUrl) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Thanks for calling. We are unable to connect you right now, please try again later.');
      return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    await supabase.from('calls').upsert(
      { business_id: directBusiness.id, provider_call_id: callSid, from_number: from, to_number: to, status: 'in_progress' },
      { onConflict: 'provider_call_id', ignoreDuplicates: true }
    );

    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    const stream = connect.stream({ url: workerUrl });
    stream.parameter({ name: 'businessId', value: directBusiness.id });
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, ai_phone_number, name')
    .eq('phone_number', to)
    .single();

  const twiml = new twilio.twiml.VoiceResponse();

  if (!business?.ai_phone_number) {
    twiml.say('Thanks for calling. We are unable to connect you right now, please try again later.');
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
  }

  // Log the inbound call immediately so it shows up in the dashboard even
  // before the AI's end-of-call report arrives. Upserted on
  // provider_call_id (unique index, migration 0020) rather than a blind
  // insert — Twilio can redeliver this webhook, and a second insert for
  // the same CallSid would otherwise create a duplicate call row.
  // ignoreDuplicates: a redelivery shouldn't reset a row a later step
  // (e.g. the end-of-call report) may have already updated.
  await supabase.from('calls').upsert(
    {
      business_id: business.id,
      provider_call_id: callSid,
      from_number: from,
      to_number: to,
      status: 'in_progress'
    },
    { onConflict: 'provider_call_id', ignoreDuplicates: true }
  );

  const dial = twiml.dial();
  dial.number(business.ai_phone_number);

  return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
}

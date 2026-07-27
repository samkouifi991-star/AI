import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import twilio from 'twilio';

/**
 * Twilio calls this when someone dials the business's AI receptionist
 * number (the number the owner forwards their real line to). We look up
 * which business owns this Twilio number, then <Dial> into that business's
 * Vapi assistant phone number, passing the business id along as metadata
 * via the <Dial> "referUrl"/status callback pattern — Vapi assistants are
 * typically provisioned 1:1 with a Twilio number, so in practice this route
 * mainly logs the inbound call and lets Vapi's own number handle answering.
 * This is the fallback/logging path for numbers proxied through Twilio.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const to = form.get('To') as string;
  const from = form.get('From') as string;
  const callSid = form.get('CallSid') as string;

  const supabase = supabaseServiceRole();
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
  // before the AI's end-of-call report arrives.
  await supabase.from('calls').insert({
    business_id: business.id,
    provider_call_id: callSid,
    from_number: from,
    to_number: to,
    status: 'in_progress'
  });

  const dial = twiml.dial();
  dial.number(business.ai_phone_number);

  return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
}

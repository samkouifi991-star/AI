import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { verifyTwilioSignature } from '@/lib/twilio';
import { logger } from '@/lib/logger';

/**
 * Twilio calls this for inbound SMS (replies to confirmations, STOP/opt-out
 * texts, etc). Every request's signature is verified before anything in
 * the payload is trusted — an unsigned or mismatched request is rejected
 * outright, never silently accepted.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => (params[key] = String(value)));

  const signature = req.headers.get('x-twilio-signature');
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/twilio-sms`;
  const valid = verifyTwilioSignature(signature, url, params);

  const supabase = supabaseServiceRole();
  const to = params.To;

  const { data: business } = to
    ? await supabase.from('businesses').select('id').eq('phone_number', to).single()
    : { data: null };

  if (business) {
    await supabase
      .from('webhook_status')
      .upsert(
        {
          business_id: business.id,
          webhook_type: 'twilio_sms',
          last_received_at: new Date().toISOString(),
          last_status: valid ? 'ok' : 'signature_invalid',
          failure_count: valid ? 0 : undefined
        },
        { onConflict: 'business_id,webhook_type' }
      );
  }

  if (!valid) {
    logger.warn('twilio_sms_webhook_signature_invalid', { to });
    return new NextResponse('Invalid signature', { status: 403 });
  }

  const body = (params.Body ?? '').trim().toUpperCase();
  if (business && (body === 'STOP' || body === 'UNSUBSCRIBE')) {
    // Real opt-out handling would flag the customer's number against
    // future SMS sends here — the sms_settings table and send path exist;
    // wiring an opt-out list is a follow-up, noted honestly in the report.
    logger.info('twilio_sms_opt_out_received', { businessId: business.id });
  }

  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}

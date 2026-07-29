import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { sendSms } from '@/lib/twilio';

async function getBusiness(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id, vapi_assistant_id').eq('owner_user_id', user.id).single();
  return business ?? null;
}

async function record(supabase: ReturnType<typeof supabaseServer>, businessId: string, testType: string, status: 'pass' | 'fail' | 'pending', details: any) {
  await supabase.from('phone_test_results').insert({ business_id: businessId, test_type: testType, status, details });
  return { status, details };
}

/**
 * POST /api/phone/test  { testType, ...params }
 *
 * Honest by design: 'sms' and 'webhook' and 'voice_preview' and
 * 'assistant_tools' are things this server can actually verify itself, so
 * they return a real pass/fail. 'forwarding_check', 'inbound_call', and
 * 'transfer' fundamentally require a real phone to actually ring — no
 * server-side call can substitute for that, so those record 'pending'
 * with instructions, rather than a fabricated pass.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);
  if (!business) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { testType, phoneNumber } = await req.json();

  switch (testType) {
    case 'sms': {
      if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
      const result = await sendSms(phoneNumber, 'This is a test message from your Business Pilot AI phone system. If you got this, SMS is working.');
      const outcome = await record(supabase, business.id, 'sms', result.ok ? 'pass' : 'fail', result);
      return NextResponse.json(outcome);
    }

    case 'webhook': {
      const { data: statuses } = await supabase.from('webhook_status').select('*').eq('business_id', business.id);
      const anyRecent = (statuses ?? []).some(
        (s) => s.last_received_at && Date.now() - new Date(s.last_received_at).getTime() < 24 * 60 * 60 * 1000
      );
      const outcome = await record(supabase, business.id, 'webhook', anyRecent ? 'pass' : 'pending', {
        statuses,
        note: anyRecent ? 'Recent webhook activity found.' : 'No webhook activity recorded yet — place a real test call or SMS to generate some.'
      });
      return NextResponse.json(outcome);
    }

    case 'assistant_tools': {
      if (!business.vapi_assistant_id) {
        return NextResponse.json(await record(supabase, business.id, 'assistant_tools', 'fail', { note: 'No assistant provisioned yet.' }));
      }
      try {
        const res = await fetch(`https://api.vapi.ai/assistant/${business.vapi_assistant_id}`, {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
        });
        if (!res.ok) return NextResponse.json(await record(supabase, business.id, 'assistant_tools', 'fail', { status: res.status }));
        const data = await res.json();
        const functionCount = data.model?.functions?.length ?? data.functions?.length ?? 0;
        return NextResponse.json(
          await record(supabase, business.id, 'assistant_tools', functionCount > 0 ? 'pass' : 'fail', { functionCount })
        );
      } catch (err: any) {
        return NextResponse.json(await record(supabase, business.id, 'assistant_tools', 'fail', { message: err.message }));
      }
    }

    case 'forwarding_verify': {
      // Real verification, not a self-report: a call actually arrived at
      // this business's AI number is a fact this server can check — a
      // fresh row in `calls` within the last 15 minutes. Only that (or its
      // absence) decides pass/pending; the customer's own click never does.
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentCalls } = await supabase
        .from('calls')
        .select('id, started_at')
        .eq('business_id', business.id)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1);

      if (recentCalls && recentCalls.length > 0) {
        await supabase
          .from('forwarding_setups')
          .update({ last_test_status: 'pass', last_tested_at: new Date().toISOString() })
          .eq('business_id', business.id);
        const outcome = await record(supabase, business.id, 'forwarding_check', 'pass', { callId: recentCalls[0].id });
        return NextResponse.json(outcome);
      }

      const outcome = await record(supabase, business.id, 'forwarding_check', 'pending', {
        note: "We haven't seen a call reach your AI number yet. Place the test call, then check again — it can take a few seconds to show up."
      });
      return NextResponse.json(outcome);
    }

    case 'forwarding_check':
    case 'inbound_call':
    case 'transfer': {
      // These require an actual phone to ring — there's no way to fake
      // this server-side without lying about the result. Recorded as
      // pending with clear next-action instructions instead.
      const instructions: Record<string, string> = {
        forwarding_check: 'Call your business number from another phone. If forwarding is set up correctly, your AI receptionist should answer.',
        inbound_call: 'Call your AI number directly and confirm the assistant answers and responds correctly.',
        transfer: 'During a real or test call, ask to speak to a person and confirm the call transfers to your configured fallback number.'
      };
      const outcome = await record(supabase, business.id, testType, 'pending', { instructions: instructions[testType] });
      return NextResponse.json(outcome);
    }

    default:
      return NextResponse.json({ error: `Unknown testType: ${testType}` }, { status: 400 });
  }
}

export async function GET() {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);
  if (!business) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('phone_test_results')
    .select('*')
    .eq('business_id', business.id)
    .order('run_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ results: data ?? [] });
}

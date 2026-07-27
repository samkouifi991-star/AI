import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { runBuyNumberWorkflow } from '@/lib/provisioning';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

// POST /api/phone/purchase  { phoneNumber, numberType, monthlyPrice }
// Runs the full 12-step provisioning workflow (see lib/provisioning.ts).
// Only returns ok:true after every step, including a live Vapi connection
// test, has actually passed — never on partial success.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const allowed = await checkRateLimit(`phone-purchase:${business.id}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many purchase attempts — try again in an hour.' }, { status: 429 });

  const { phoneNumber, numberType, monthlyPrice } = await req.json();
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });

  const result = await runBuyNumberWorkflow({
    businessId: business.id,
    phoneNumber,
    numberType: numberType ?? 'local',
    monthlyPrice: monthlyPrice ?? null
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, failedStep: result.failedStep, jobId: result.jobId }, { status: 502 });
  }

  await logAudit({
    businessId: business.id,
    actorUserId: user.id,
    action: 'number_purchased',
    resourceType: 'phone_number',
    resourceId: result.phoneNumberId,
    metadata: { phoneNumber, numberType: numberType ?? 'local' }
  });

  return NextResponse.json({ ok: true, jobId: result.jobId, phoneNumberId: result.phoneNumberId });
}

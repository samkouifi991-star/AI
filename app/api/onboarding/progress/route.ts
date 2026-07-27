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

  const { data } = await supabase.from('onboarding_progress').select('*').eq('business_id', businessId).single();
  return NextResponse.json({ progress: data ?? { current_stage: 'business', completed_stages: [] } });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { currentStage, completedStages } = await req.json();

  const { error } = await supabase.from('onboarding_progress').upsert(
    {
      business_id: businessId,
      current_stage: currentStage,
      completed_stages: completedStages,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'business_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (currentStage === 'complete') {
    await supabase.from('businesses').update({ is_live: true }).eq('id', businessId);
    await logAudit({ businessId, actorUserId: user?.id, action: 'business_went_live' });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const { scenarioLabel } = await req.json().catch(() => ({ scenarioLabel: undefined }));

  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({ business_id: business.id, owner_user_id: user.id, scenario_label: scenarioLabel ?? null, status: 'in_progress' })
    .select()
    .single();

  if (error || !session) return NextResponse.json({ error: error?.message ?? 'Could not start practice session' }, { status: 500 });

  return NextResponse.json({ sessionId: session.id });
}

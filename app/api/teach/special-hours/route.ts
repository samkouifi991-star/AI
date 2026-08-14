import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { syncBusinessProfileChunk } from '@/lib/business-knowledge-sync';

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

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('special_hours').select('*').eq('business_id', businessId).gte('date', today).order('date');
  return NextResponse.json({ specialHours: data ?? [] });
}

// POST { date, isClosed, openTime?, closeTime?, note? } — one holiday or
// one-off closure/adjustment. Upserts on (business_id, date), so saving
// the same date twice edits it rather than creating a duplicate.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { date, isClosed, openTime, closeTime, note } = await req.json();
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

  const { error } = await supabase.from('special_hours').upsert(
    {
      business_id: businessId,
      date,
      is_closed: isClosed !== false,
      open_time: isClosed === false ? openTime || null : null,
      close_time: isClosed === false ? closeTime || null : null,
      note: note || null
    },
    { onConflict: 'business_id,date' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await syncBusinessProfileChunk(businessId);
  } catch (err: any) {
    return NextResponse.json({ ok: true, knowledgeSynced: false, error: err.message ?? 'Saved, but could not update the searchable knowledge chunk.' });
  }
  return NextResponse.json({ ok: true, knowledgeSynced: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

  const { error } = await supabase.from('special_hours').delete().eq('business_id', businessId).eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncBusinessProfileChunk(businessId).catch(() => {});
  return NextResponse.json({ ok: true });
}

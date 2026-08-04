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

  const { data } = await supabase.from('business_hours').select('*').eq('business_id', businessId).order('day_of_week');
  return NextResponse.json({ hours: data ?? [] });
}

/**
 * POST { days: [{ dayOfWeek, openTime, closeTime, isClosed }, ...] } —
 * replaces the business's full week (simplest correct way to keep
 * day_of_week unique per business without juggling per-row upserts) and
 * re-embeds the business-profile knowledge chunk so the new hours are
 * searchable on the very next call.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { days } = await req.json();
  if (!Array.isArray(days)) return NextResponse.json({ error: 'days must be an array' }, { status: 400 });

  await supabase.from('business_hours').delete().eq('business_id', businessId);
  if (days.length > 0) {
    const { error } = await supabase.from('business_hours').insert(
      days.map((d: any) => ({
        business_id: businessId,
        day_of_week: d.dayOfWeek,
        open_time: d.isClosed ? null : d.openTime || null,
        close_time: d.isClosed ? null : d.closeTime || null,
        is_closed: !!d.isClosed
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await syncBusinessProfileChunk(businessId);
  } catch (err: any) {
    return NextResponse.json({ ok: true, knowledgeSynced: false, error: err.message ?? 'Saved, but could not update the searchable knowledge chunk.' });
  }
  return NextResponse.json({ ok: true, knowledgeSynced: true });
}

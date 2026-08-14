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

  const [{ data: hours }, { data: business }] = await Promise.all([
    supabase.from('business_hours').select('*').eq('business_id', businessId).order('day_of_week'),
    supabase.from('businesses').select('timezone').eq('id', businessId).single()
  ]);
  return NextResponse.json({ hours: hours ?? [], timezone: business?.timezone ?? 'America/New_York' });
}

/**
 * POST { days: [{ dayOfWeek, isClosed, ranges: [{ openTime, closeTime }] }, ...] } —
 * replaces the business's full week (simplest correct way to keep this
 * idempotent without juggling per-row upserts) and re-embeds the
 * business-profile knowledge chunk so the new hours are searchable on the
 * very next call. A day can hold more than one range (e.g. lunch and
 * dinner service) — nothing in business_hours constrains it to one row
 * per day_of_week, so each range becomes its own row.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { days } = await req.json();
  if (!Array.isArray(days)) return NextResponse.json({ error: 'days must be an array' }, { status: 400 });

  await supabase.from('business_hours').delete().eq('business_id', businessId);

  const rows: { business_id: string; day_of_week: any; open_time: any; close_time: any; is_closed: boolean }[] = [];
  for (const d of days) {
    if (d.isClosed || !Array.isArray(d.ranges) || d.ranges.length === 0) {
      rows.push({ business_id: businessId, day_of_week: d.dayOfWeek, open_time: null, close_time: null, is_closed: true });
    } else {
      for (const r of d.ranges) {
        if (!r.openTime || !r.closeTime) continue;
        rows.push({ business_id: businessId, day_of_week: d.dayOfWeek, open_time: r.openTime, close_time: r.closeTime, is_closed: false });
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('business_hours').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await syncBusinessProfileChunk(businessId);
  } catch (err: any) {
    return NextResponse.json({ ok: true, knowledgeSynced: false, error: err.message ?? 'Saved, but could not update the searchable knowledge chunk.' });
  }
  return NextResponse.json({ ok: true, knowledgeSynced: true });
}

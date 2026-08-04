import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { syncFaqChunk, deleteFaqChunk } from '@/lib/business-knowledge-sync';

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

  const { data } = await supabase.from('faqs').select('*').eq('business_id', businessId).order('created_at');
  return NextResponse.json({ faqs: data ?? [] });
}

// POST { id?, question, answer } — creates or updates one FAQ, and
// re-embeds its knowledge chunk in place so callers get the update
// immediately, whether the FAQ was entered in onboarding or in /teach.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id, question, answer } = await req.json();
  const trimmedQ = String(question ?? '').trim();
  const trimmedA = String(answer ?? '').trim();
  if (!trimmedQ || !trimmedA) return NextResponse.json({ error: 'question and answer are required' }, { status: 400 });

  let faqId = id;
  if (faqId) {
    const { error } = await supabase.from('faqs').update({ question: trimmedQ, answer: trimmedA }).eq('id', faqId).eq('business_id', businessId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabase.from('faqs').insert({ business_id: businessId, question: trimmedQ, answer: trimmedA }).select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save FAQ' }, { status: 500 });
    faqId = data.id;
  }

  try {
    await syncFaqChunk(businessId, faqId, trimmedQ, trimmedA);
  } catch (err: any) {
    return NextResponse.json({ ok: true, id: faqId, knowledgeSynced: false, error: err.message ?? 'Saved, but could not update the searchable knowledge chunk.' });
  }
  return NextResponse.json({ ok: true, id: faqId, knowledgeSynced: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from('faqs').delete().eq('id', id).eq('business_id', businessId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await deleteFaqChunk(id);
  return NextResponse.json({ ok: true });
}

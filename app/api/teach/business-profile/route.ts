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

  const { data } = await supabase.from('businesses').select('description, address, policies_text, service_area').eq('id', businessId).single();
  return NextResponse.json({ profile: data ?? null });
}

/**
 * POST { description?, address?, policiesText? } — saves the business
 * profile fields and immediately re-embeds them as a real, searchable
 * knowledge chunk (lib/business-knowledge-sync.ts). No Vapi sync needed
 * here: knowledge is retrieved live via get_business_knowledge on every
 * call, never baked into the assistant's system prompt, so a save is
 * "live" the moment the chunk is re-embedded — unlike behavioral
 * instructions, which do require a PATCH -> GET -> compare Vapi sync.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { error } = await supabase
    .from('businesses')
    .update({
      description: body.description ?? null,
      address: body.address ?? null,
      policies_text: body.policiesText ?? null
    })
    .eq('id', businessId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await syncBusinessProfileChunk(businessId);
  } catch (err: any) {
    return NextResponse.json({ ok: true, knowledgeSynced: false, error: err.message ?? 'Saved, but could not update the searchable knowledge chunk.' });
  }
  return NextResponse.json({ ok: true, knowledgeSynced: true });
}

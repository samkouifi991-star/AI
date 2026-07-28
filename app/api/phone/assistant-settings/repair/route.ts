import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { syncAssistantSettings } from '@/lib/vapi-assistant';

/**
 * "Sync with Vapi / Repair assistant connection" — re-resolves which
 * assistant actually answers this business's number (adopting Vapi's real
 * mapping if our own record is stale or wrong), then pushes the current
 * assistant_settings and verifies via read-back. Does not touch
 * assistant_settings itself — this is a repair/re-sync action, not a save.
 */
export async function POST() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const sync = await syncAssistantSettings(business.id);

  return NextResponse.json({
    ok: sync.ok,
    syncStatus: sync.status,
    assistantId: sync.assistantId,
    mappingCorrected: sync.mappingCorrected,
    fieldResults: sync.fieldResults,
    syncError: sync.error
  });
}

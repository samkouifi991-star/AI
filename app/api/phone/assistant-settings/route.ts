import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { syncAssistantSettings } from '@/lib/vapi-assistant';

async function getBusiness(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id, vapi_assistant_id').eq('owner_user_id', user.id).single();
  return business ?? null;
}

export async function GET() {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);
  if (!business) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: settings } = await supabase.from('assistant_settings').select('*').eq('business_id', business.id).single();
  const { data: lastSync } = await supabase
    .from('assistant_sync_status')
    .select('status, vapi_assistant_id, requested_at, completed_at, error_message')
    .eq('business_id', business.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ settings: settings ?? null, lastSync: lastSync ?? null });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);
  if (!business) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();

  const { error } = await supabase.from('assistant_settings').upsert(
    {
      business_id: business.id,
      vapi_assistant_id: business.vapi_assistant_id,
      name: body.name,
      first_message: body.firstMessage,
      system_prompt_override: body.systemPromptOverride ?? null,
      language: body.language,
      fallback_language: body.fallbackLanguage ?? null,
      speaking_speed: body.speakingSpeed,
      interruption_sensitivity: body.interruptionSensitivity,
      silence_timeout_seconds: body.silenceTimeoutSeconds,
      call_timeout_seconds: body.callTimeoutSeconds,
      voicemail_behavior: body.voicemailBehavior,
      record_calls: !!body.recordCalls,
      collect_transcripts: !!body.collectTranscripts,
      generate_summaries: !!body.generateSummaries,
      advanced_mode_enabled: !!body.advancedModeEnabled,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'business_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Always attempt a sync — syncAssistantSettings resolves the real
  // assistant via the phone number's live Vapi mapping, not just
  // businesses.vapi_assistant_id, so it can succeed even if that column is
  // stale or was never set. Only "not provisioned at all" (no phone number,
  // no assistant anywhere) comes back as a real failure.
  const sync = await syncAssistantSettings(business.id);

  // status is reported honestly, distinct from a bare true/false: 'partial'
  // means the PATCH succeeded but the read-back caught fields that didn't
  // actually apply — never collapsed into a plain "synced".
  return NextResponse.json({
    ok: true,
    synced: sync.status === 'synced',
    syncStatus: sync.status,
    assistantId: sync.assistantId,
    mappingCorrected: sync.mappingCorrected,
    fieldResults: sync.fieldResults,
    syncError: sync.error
  });
}

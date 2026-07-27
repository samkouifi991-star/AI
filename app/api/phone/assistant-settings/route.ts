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
  return NextResponse.json({ settings: settings ?? null });
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
      greeting: body.greeting,
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

  if (!business.vapi_assistant_id) {
    return NextResponse.json({ ok: true, synced: false, note: 'Saved. No phone number provisioned yet, so nothing to sync to live calls until one is.' });
  }

  const sync = await syncAssistantSettings(business.vapi_assistant_id, {
    name: body.name,
    firstMessage: body.firstMessage,
    language: body.language,
    speakingSpeed: body.speakingSpeed,
    silenceTimeoutSeconds: body.silenceTimeoutSeconds,
    voicemailBehavior: body.voicemailBehavior,
    recordCalls: !!body.recordCalls
  });

  if (!sync.ok) return NextResponse.json({ ok: true, synced: false, syncError: sync.error });
  return NextResponse.json({ ok: true, synced: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getVoiceProvider } from '@/lib/voice';

const SAMPLE_TEXT =
  "Thanks for calling — this is your virtual assistant. How can I help you today?";

// POST /api/voice/preview  { provider, voiceId }
// Only used for vendors whose Voice.previewUrl is null (e.g. OpenAI). For
// vendors that already return a previewUrl (e.g. ElevenLabs), the frontend
// plays that URL directly and never calls this route.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { provider: providerKey, voiceId } = await req.json();
  if (!voiceId) return NextResponse.json({ error: 'voiceId is required' }, { status: 400 });

  const provider = getVoiceProvider(providerKey);
  if (!provider.synthesizePreview) {
    return NextResponse.json(
      { error: `${provider.displayName} voices include a static preview_url — no synthesis needed.` },
      { status: 400 }
    );
  }

  try {
    const preview = await provider.synthesizePreview(voiceId, SAMPLE_TEXT);
    // NextResponse's body type comes from the DOM lib's BodyInit, which
    // doesn't accept Node's Buffer directly. Slicing out the exact
    // underlying ArrayBuffer range (rather than wrapping in Uint8Array)
    // avoids a typed-array generics assignability issue in newer
    // TypeScript/DOM lib versions, while still copying the identical bytes.
    const audio = preview.audio.buffer.slice(
      preview.audio.byteOffset,
      preview.audio.byteOffset + preview.audio.byteLength
    ) as ArrayBuffer;
    return new NextResponse(audio, {
      headers: { 'Content-Type': preview.contentType, 'Cache-Control': 'private, max-age=3600' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Preview synthesis failed' }, { status: 502 });
  }
}

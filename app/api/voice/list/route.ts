import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getVoiceProvider, availableProviderKeys } from '@/lib/voice';

// GET /api/voice/list?provider=elevenlabs
// Defaults to the deployment's VOICE_PROVIDER if no query param is given.
// Requires an authenticated business owner — this hits a real, possibly
// rate-limited vendor API, so it shouldn't be reachable anonymously.
export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const providerKey = req.nextUrl.searchParams.get('provider') ?? undefined;

  try {
    const provider = getVoiceProvider(providerKey);
    const voices = await provider.listVoices();
    return NextResponse.json({
      provider: provider.key,
      providerName: provider.displayName,
      availableProviders: availableProviderKeys(),
      voices
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load voices' }, { status: 502 });
  }
}

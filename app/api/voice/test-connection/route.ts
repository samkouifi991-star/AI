import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getVoiceProvider } from '@/lib/voice';

// POST /api/voice/test-connection?provider=elevenlabs
// Never touches the API key from the client — the key lives only in this
// server-side route via process.env.ELEVENLABS_API_KEY, read inside
// getVoiceProvider(). The frontend only ever sees { ok, message }.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const providerKey = req.nextUrl.searchParams.get('provider') ?? undefined;

  try {
    const provider = getVoiceProvider(providerKey);
    if (!provider.testConnection) {
      // Vendor has no dedicated health-check endpoint — fall back to a
      // real catalog fetch as the connectivity test.
      await provider.listVoices();
      return NextResponse.json({ ok: true, message: `Connected to ${provider.displayName}.` });
    }
    const result = await provider.testConnection();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err.message ?? 'Connection failed' }, { status: 502 });
  }
}

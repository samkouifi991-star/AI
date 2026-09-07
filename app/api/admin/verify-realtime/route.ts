import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { runRealtimeDiagnostic } from '@/lib/realtime-diagnostic';

/**
 * GET /api/admin/verify-realtime — the gate the direct voice runtime
 * build sits behind. Confirms OPENAI_API_KEY (wherever this route runs —
 * point a browser at the Vercel deployment to check the real key) can
 * authenticate, reach a Realtime model, open a real WebSocket session,
 * and have a function-calling tool definition accepted. Never returns or
 * logs the key itself. Gated behind a logged-in session — any dashboard
 * user can run it, since it only ever reveals pass/fail diagnostic
 * booleans and provider-error text, nothing secret.
 */
export async function GET() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await runRealtimeDiagnostic();
  const allPassed = result.authenticated && result.websocketConnected && result.functionCallingConfigured;

  return NextResponse.json(
    {
      ready: allPassed,
      ...result
    },
    { status: allPassed ? 200 : 503 }
  );
}

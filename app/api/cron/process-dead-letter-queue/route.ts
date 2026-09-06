import { NextRequest, NextResponse } from 'next/server';
import { processDueFailedEvents } from '@/lib/dead-letter-queue';
import { logger } from '@/lib/logger';

/**
 * Drains whatever's due in the failed_events dead-letter queue (migration
 * 0027) — a failed SMS, a partial Vapi assistant sync, and any future
 * event_type with a registered handler in lib/dead-letter-queue.ts.
 * Invoked on Vercel's Cron schedule (see vercel.json); CRON_SECRET gates
 * it so it can't be triggered by anyone who happens to guess the path.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await processDueFailedEvents();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error('dead_letter_drain_failed', { message: err.message });
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

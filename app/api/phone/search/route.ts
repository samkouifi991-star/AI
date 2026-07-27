import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { searchAvailableNumbers, getNumberMonthlyPrice } from '@/lib/twilio';
import { logger } from '@/lib/logger';

// GET /api/phone/search?country=US&areaCode=412&numberType=local&voice=true&sms=true
export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const numberType = (sp.get('numberType') as 'local' | 'toll_free') ?? 'local';
  const country = sp.get('country') ?? 'US';

  try {
    const results = await searchAvailableNumbers({
      country,
      areaCode: sp.get('areaCode') ?? undefined,
      region: sp.get('region') ?? undefined,
      locality: sp.get('locality') ?? undefined,
      numberType,
      voiceEnabled: sp.get('voice') === 'true' ? true : undefined,
      smsEnabled: sp.get('sms') === 'true' ? true : undefined,
      mmsEnabled: sp.get('mms') === 'true' ? true : undefined,
      limit: 20
    });

    const monthlyPrice = await getNumberMonthlyPrice(country, numberType);

    return NextResponse.json({
      results: results.map((r) => ({ ...r, monthlyPrice }))
    });
  } catch (err: any) {
    logger.error('phone_search_failed', { message: err.message });
    return NextResponse.json({ error: err.message ?? 'Number search failed' }, { status: 502 });
  }
}

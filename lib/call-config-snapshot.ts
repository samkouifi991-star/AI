import { supabaseServiceRole } from './supabase/admin';
import { logger } from './logger';

type SupabaseClient = ReturnType<typeof supabaseServiceRole>;

export interface AiEmployeeSettingsSnapshot {
  can_take_orders: boolean;
  can_quote_prices: boolean;
  can_book_appointments: boolean;
  can_offer_discounts: boolean;
  escalation_phone_number: string | null;
}

export interface RestaurantSettingsSnapshot {
  tax_rate: number;
  delivery_fee: number;
  discount_code: string | null;
  discount_percent: number | null;
  pay_at_pickup: boolean;
  pay_at_delivery: boolean;
}

export interface VoiceSettingsSnapshot {
  default_language: string;
  additional_languages: string[];
  auto_detect_language: boolean;
  confirm_before_switch: boolean;
}

export interface CallConfigSnapshot {
  businessId: string;
  runtime: 'vapi' | 'direct';
  timezone: string;
  transferNumber: string | null;
  aiEmployeeSettings: AiEmployeeSettingsSnapshot;
  businessHours: { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }[];
  specialHours: { date: string; is_closed: boolean; open_time: string | null; close_time: string | null; note: string | null }[];
  voiceSettings: VoiceSettingsSnapshot;
  restaurantSettings: RestaurantSettingsSnapshot | null;
  menuVersion: string | null;
}

const DEFAULT_AI_EMPLOYEE_SETTINGS: AiEmployeeSettingsSnapshot = {
  can_take_orders: true,
  can_quote_prices: true,
  can_book_appointments: true,
  can_offer_discounts: false,
  escalation_phone_number: null
};

const DEFAULT_VOICE_SETTINGS: VoiceSettingsSnapshot = {
  default_language: 'en',
  additional_languages: [],
  auto_detect_language: false,
  confirm_before_switch: true
};

/**
 * Builds a fresh snapshot from whatever is live in the database right
 * now. Called only when no snapshot exists yet for this call/session —
 * everything after that first call reads the frozen copy instead.
 */
async function buildSnapshot(supabase: SupabaseClient, businessId: string): Promise<CallConfigSnapshot> {
  const [{ data: business }, { data: employeeSettings }, { data: hoursRows }, { data: specialRows }, { data: voiceSettings }, { data: restaurantSettings }, { data: menuAgg }] =
    await Promise.all([
      // Note: businesses.voice_runtime doesn't exist yet (added in
      // Phase 1, item 14) — runtime defaults to 'vapi' below until then.
      supabase.from('businesses').select('timezone, business_type').eq('id', businessId).maybeSingle(),
      supabase
        .from('ai_employee_settings')
        .select('can_take_orders, can_quote_prices, can_book_appointments, can_offer_discounts, escalation_phone_number')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', businessId),
      supabase
        .from('special_hours')
        .select('date, is_closed, open_time, close_time, note')
        .eq('business_id', businessId)
        .gte('date', new Date().toISOString().slice(0, 10)),
      supabase
        .from('business_voice_settings')
        .select('default_language, additional_languages, auto_detect_language, confirm_before_switch')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('restaurant_settings')
        .select('tax_rate, delivery_fee, discount_code, discount_percent, pay_at_pickup, pay_at_delivery')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase.from('menu_items').select('updated_at').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    ]);

  return {
    businessId,
    runtime: 'vapi',
    timezone: business?.timezone ?? 'America/New_York',
    transferNumber: employeeSettings?.escalation_phone_number ?? process.env.TWILIO_PHONE_NUMBER ?? null,
    aiEmployeeSettings: employeeSettings ?? DEFAULT_AI_EMPLOYEE_SETTINGS,
    businessHours: hoursRows ?? [],
    specialHours: specialRows ?? [],
    voiceSettings: voiceSettings ?? DEFAULT_VOICE_SETTINGS,
    restaurantSettings: business?.business_type === 'restaurant' ? restaurantSettings ?? null : null,
    menuVersion: menuAgg?.updated_at ?? null
  };
}

/**
 * Returns the immutable configuration this call/session started with,
 * creating it on the first tool call of a call and reusing it for every
 * one after — the reason a setting the owner changes mid-call never
 * takes effect until the *next* call. Concurrent races on the very first
 * tool call of a call (rare, but the webhook can retry) are resolved by
 * the unique index in migration 0024: whichever insert loses re-reads
 * the row the winner just wrote, rather than erroring.
 */
export async function getOrCreateCallConfigSnapshot(params: {
  businessId: string;
  providerCallId?: string | null;
  practiceSessionId?: string | null;
}): Promise<CallConfigSnapshot> {
  const supabase = supabaseServiceRole();
  const { businessId, providerCallId, practiceSessionId } = params;

  if (!providerCallId && !practiceSessionId) {
    // No stable key to snapshot against — fall back to a live read rather
    // than failing the tool call outright. Logged because it means a live
    // call is somehow reaching the dispatcher without Vapi's own call id,
    // which should not happen.
    logger.warn('call_config_snapshot_no_key', { businessId });
    return buildSnapshot(supabase, businessId);
  }

  const existing = providerCallId
    ? await supabase.from('call_config_snapshots').select('*').eq('provider_call_id', providerCallId).maybeSingle()
    : await supabase.from('call_config_snapshots').select('*').eq('practice_session_id', practiceSessionId as string).maybeSingle();

  if (existing.data) {
    const row = existing.data as any;
    return { ...(row.config as CallConfigSnapshot), businessId: row.business_id, runtime: row.runtime, timezone: row.timezone, transferNumber: row.transfer_number };
  }

  const fresh = await buildSnapshot(supabase, businessId);

  const { error: insertError } = await supabase.from('call_config_snapshots').insert({
    business_id: businessId,
    provider_call_id: providerCallId ?? null,
    practice_session_id: practiceSessionId ?? null,
    runtime: fresh.runtime,
    timezone: fresh.timezone,
    transfer_number: fresh.transferNumber,
    config: fresh
  });

  if (insertError) {
    // Unique-violation means another concurrent tool call already won the
    // race to create this call's snapshot — read back what it wrote so
    // both calls end up using the identical frozen configuration, rather
    // than each freezing its own slightly-different copy.
    if (insertError.code === '23505') {
      const winner = providerCallId
        ? await supabase.from('call_config_snapshots').select('*').eq('provider_call_id', providerCallId).maybeSingle()
        : await supabase.from('call_config_snapshots').select('*').eq('practice_session_id', practiceSessionId as string).maybeSingle();
      if (winner.data) return winner.data.config as CallConfigSnapshot;
    } else {
      logger.error('call_config_snapshot_insert_failed', { businessId, message: insertError.message });
    }
  }

  return fresh;
}

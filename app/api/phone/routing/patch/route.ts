import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { syncAssistantSettings } from '@/lib/vapi-assistant';
import { logAudit } from '@/lib/audit';

async function getBusinessId(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  return business?.id ?? null;
}

// Every field the "Your phone" page's inline-editable sentences can
// change, and which real table/column each maps to. Deliberately a
// narrow allowlist, not a generic "patch any column" endpoint — this is
// the one place a browser request can write directly to call_routing_rules
// or ai_employee_settings by field name, so the set of writable fields
// must stay exactly what the UI exposes, nothing more.
const ROUTING_FIELDS = new Set([
  'ring_before_ai_enabled',
  'ring_seconds_before_ai',
  'quiet_hours_enabled',
  'quiet_hours_start',
  'quiet_hours_end',
  'transfer_on_customer_request',
  'urgent_transfer_enabled',
  'voicemail_fallback_enabled'
]);
const EMPLOYEE_FIELDS = new Set(['escalation_phone_number']);

/**
 * POST { table: 'routing' | 'employee', field: string, value: unknown }
 *
 * True partial-update (PATCH merge) semantics: updates exactly the one
 * named column, never the whole row — the full-form /api/phone/routing
 * POST route sends every field on every save (fine for that form), but
 * the inline sentence editor on "Your phone" changes one thing at a time
 * and must never blank out the rest by re-sending a stale snapshot of
 * the others.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const businessId = await getBusinessId(supabase);
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { table, field, value } = await req.json();
  if (table !== 'routing' && table !== 'employee') {
    return NextResponse.json({ error: 'Unknown table.' }, { status: 400 });
  }
  const allowlist = table === 'routing' ? ROUTING_FIELDS : EMPLOYEE_FIELDS;
  if (typeof field !== 'string' || !allowlist.has(field)) {
    return NextResponse.json({ error: 'That field cannot be edited here.' }, { status: 400 });
  }

  const targetTable = table === 'routing' ? 'call_routing_rules' : 'ai_employee_settings';
  const { error } = await supabase
    .from(targetTable)
    .upsert({ business_id: businessId, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ businessId, actorUserId: user?.id, action: 'routing_changed', resourceType: targetTable, metadata: { field: field as string } });

  // These fields all feed buildSystemPrompt — push the change to the live
  // assistant immediately, same PATCH -> GET -> compare pipeline as every
  // other settings save in this app, never a bare "saved" on faith.
  const sync = await syncAssistantSettings(businessId);

  return NextResponse.json({
    ok: true,
    syncStatus: sync.status,
    syncError: sync.error
  });
}

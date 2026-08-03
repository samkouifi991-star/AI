import { supabaseServer } from '@/lib/supabase/server';
import PhoneSubNav from './PhoneSubNav';
import YourPhoneRules from './YourPhoneRules';

export default async function PhoneOverviewPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, phone_number, ai_phone_number, vapi_assistant_id, is_live, provisioning_state, provisioning_error_message, twilio_subaccount_sid')
    .eq('owner_user_id', user?.id)
    .single();

  if (!business) {
    return <div className="card max-w-md">Finish onboarding to set up phone management.</div>;
  }

  const [
    { data: numbers },
    { data: voiceSettings },
    { data: forwarding },
    { data: routing },
    { data: webhookStatuses },
    { data: twilioConn },
    { data: usage },
    { data: employeeSettings },
    { count: openGapCount }
  ] = await Promise.all([
    supabase.from('phone_numbers').select('*').eq('business_id', business.id).neq('status', 'released'),
    supabase.from('business_voice_settings').select('voice_name, voice_provider').eq('business_id', business.id).single(),
    supabase.from('forwarding_setups').select('*').eq('business_id', business.id).single(),
    supabase.from('call_routing_rules').select('*').eq('business_id', business.id).single(),
    supabase.from('webhook_status').select('*').eq('business_id', business.id),
    supabase.from('provider_connections').select('provider, mode, status').eq('business_id', business.id).eq('provider', 'twilio').single(),
    supabase.from('customer_usage_summary').select('*').eq('business_id', business.id).order('period_start', { ascending: false }).limit(1).single(),
    supabase.from('ai_employee_settings').select('employee_name, employee_title, tone').eq('business_id', business.id).single(),
    supabase.from('knowledge_gaps').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'open')
  ]);

  const activeNumber = numbers?.find((n) => n.status === 'active');
  const vapiWebhook = webhookStatuses?.find((w) => w.webhook_type === 'vapi');
  const smsWebhook = webhookStatuses?.find((w) => w.webhook_type === 'twilio_sms');

  const numberConnected = Boolean(activeNumber?.phone_number ?? business.ai_phone_number);
  const assistantReady = Boolean(business.vapi_assistant_id) && twilioConn?.status === 'connected';
  const aiName = employeeSettings?.employee_name ?? 'Ava';
  const displayNumber = activeNumber?.phone_number ?? business.ai_phone_number;
  const isLiveAndAnswering = business.is_live && numberConnected && assistantReady;

  // provisioning_state (migration 0014) is the authoritative plain-language
  // status once a provisioning workflow has run at least once; older
  // businesses without it yet fall back to the connectivity heuristic below.
  const PROVISIONING_LABELS: Record<string, { label: string; tone: string }> = {
    account_created: { label: 'Getting started', tone: 'badge-warning' },
    profile_incomplete: { label: 'Finish your business profile to continue', tone: 'badge-warning' },
    waiting_for_phone_selection: { label: 'Choose a phone number to continue', tone: 'badge-warning' },
    purchasing_number: { label: 'Setting up your phone number…', tone: 'badge-warning' },
    creating_ai_employee: { label: 'Creating your AI employee…', tone: 'badge-warning' },
    connecting_phone: { label: 'Connecting your phone number…', tone: 'badge-warning' },
    syncing_settings: { label: 'Applying your settings…', tone: 'badge-warning' },
    processing_knowledge: { label: 'Learning your menu and policies…', tone: 'badge-warning' },
    ready_for_test: { label: 'Ready for a test call', tone: 'badge-success' },
    live: { label: 'Your AI employee is ready', tone: 'badge-success' },
    failed: { label: 'Setup needs attention', tone: 'badge-danger' }
  };

  const summary =
    business.provisioning_state && PROVISIONING_LABELS[business.provisioning_state]
      ? PROVISIONING_LABELS[business.provisioning_state]
      : !numberConnected
      ? { label: 'Your number still needs an assistant', tone: 'badge-warning' }
      : !assistantReady
      ? { label: 'Your phone is connected — finishing setup', tone: 'badge-warning' }
      : { label: 'Your AI employee is ready', tone: 'badge-success' };

  return (
    <div style={{ maxWidth: 860 }} className="font-instrument space-y-4">
      <PhoneSubNav />

      <div>
        <h1 className="font-grotesk text-bp-ink-strong" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>Your phone</h1>
        <p className="text-bp-ink-muted" style={{ fontSize: 14, marginTop: 4 }}>One number, one set of rules, in plain English.</p>
      </div>

      {/* Number card */}
      <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'oklch(0.955 0.03 165)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className={isLiveAndAnswering ? 'bg-bp-good' : 'bg-bp-ink-faint'} style={{ width: 10, height: 10, borderRadius: '50%' }} />
          </div>
          {isLiveAndAnswering && (
            <span
              style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid oklch(0.62 0.13 165)', animation: 'bp-ring 2.4s ease-out infinite' }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{aiName} answers</div>
          <div className="font-grotesk text-bp-ink-strong" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }}>
            {displayNumber ?? 'No number yet'}
          </div>
          <div className="text-bp-ink-muted" style={{ fontSize: 13, marginTop: 4 }}>
            {displayNumber ? 'Your own number, kept. Calls reach her when you do not pick up.' : 'Connect or buy a number to get started.'}
          </div>
        </div>
        <a href="/phone/numbers" className="btn-secondary" style={{ flexShrink: 0 }}>{displayNumber ? 'Change number' : 'Get a number'}</a>
      </div>

      {/* Rules card */}
      <YourPhoneRules aiName={aiName} />

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Advanced</summary>
        <div className="mt-3 space-y-4">
          <div className="flex items-center gap-2">
            <span className={summary.tone}>{summary.label}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Connection health</div>
              <div className="text-sm">
                {twilioConn ? (
                  <span className={twilioConn.status === 'connected' ? 'badge-success' : 'badge-danger'}>
                    {twilioConn.status === 'connected' ? 'Connected' : 'Needs attention'}
                  </span>
                ) : (
                  <span className="badge-warning">Not connected</span>
                )}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Voice</div>
              <div className="text-sm font-medium">{voiceSettings?.voice_name ?? 'Default'}</div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Text messages</div>
              <div className="text-sm">
                {smsWebhook?.last_status === 'ok' ? <span className="badge-success">Healthy</span> : <span className="badge-warning">No recent activity</span>}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Call handling</div>
              <div className="text-sm">
                {vapiWebhook?.last_status === 'ok' ? <span className="badge-success">Healthy</span> : <span className="badge-warning">No recent activity</span>}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Call forwarding (Keep my current number)</div>
              <div className="text-sm">
                {forwarding ? (
                  <span className={forwarding.last_test_status === 'pass' ? 'badge-success' : 'badge-warning'}>
                    {forwarding.last_test_status === 'pass' ? 'Tested working' : 'Set up, untested'}
                  </span>
                ) : (
                  <span className="badge-warning">Not set up</span>
                )}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Fallback number</div>
              <div className="text-sm font-medium">{routing?.fallback_transfer_number ?? forwarding?.fallback_transfer_number ?? 'Not set'}</div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Usage this period</div>
              <div className="text-sm font-medium">
                {usage ? `${usage.used_minutes}/${usage.included_minutes} min · ${usage.used_sms}/${usage.included_sms} SMS` : 'No usage recorded yet'}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">AI employee</div>
              <div className="text-sm font-medium">
                {employeeSettings ? `${employeeSettings.employee_name} · ${employeeSettings.employee_title}` : 'Ava · Virtual Receptionist (default)'}
              </div>
            </div>
            <div className="card">
              <div className="text-xs font-medium text-slate-500 mb-1">Waiting on you in Teach {aiName}</div>
              <div className="text-sm font-medium">
                {openGapCount ? <span className="badge-warning">{openGapCount} open question{openGapCount === 1 ? '' : 's'}</span> : <span className="badge-success">All caught up</span>}
              </div>
            </div>
          </div>
          <div className="space-y-1 pl-1">
            <div>Vapi assistant ID: <span className="font-mono">{business.vapi_assistant_id ?? 'none'}</span></div>
            <div>Vapi phone number ID: <span className="font-mono">{activeNumber?.vapi_phone_number_id ?? 'none'}</span></div>
            <div>Twilio SID: <span className="font-mono">{activeNumber?.twilio_sid ?? 'none'}</span></div>
            <div>Twilio subaccount SID: <span className="font-mono">{business.twilio_subaccount_sid ?? 'none'}</span></div>
            <div>Twilio connection mode: <span className="font-mono">{twilioConn?.mode ?? 'none'}</span></div>
            <div>Provisioning state: <span className="font-mono">{business.provisioning_state ?? 'unknown'}</span></div>
            {business.provisioning_error_message && (
              <div>Last provisioning error: <span className="font-mono">{business.provisioning_error_message}</span></div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

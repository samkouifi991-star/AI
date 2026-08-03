import { supabaseServer } from '@/lib/supabase/server';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function deltaLabel(delta: number) {
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

async function getBusiness(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single();
  return data;
}

export default async function DashboardPage() {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);

  if (!business) {
    return (
      <div className="card max-w-lg">
        <h2 className="font-display text-xl font-semibold mb-2">Let&apos;s set up your business</h2>
        <p className="text-slate-600 text-sm mb-4">
          Finish onboarding to start seeing calls, orders, and appointments here.
        </p>
        <a href="/onboarding" className="btn-primary inline-block">Start onboarding</a>
      </div>
    );
  }

  const isRestaurant = business.business_type === 'restaurant';
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS); // this week: last 7 days incl. today
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS); // the 7 days before that
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY_MS);

  const [
    { data: aiSettings },
    { data: activeNumber },
    { data: voiceSettings },
    { count: menuItemsCount },
    { data: calendarConn },
    { data: stripeConn },
    { count: knowledgeChunkCount },
    { data: recentCalls },
    { data: openGaps, count: openGapCount },
    { count: answeredCount },
    { count: callsThisWeek },
    { count: callsPrevWeek },
    { data: onboardingProgress }
  ] = await Promise.all([
    supabase.from('ai_employee_settings').select('employee_name').eq('business_id', business.id).maybeSingle(),
    supabase.from('phone_numbers').select('phone_number, vapi_phone_number_id').eq('business_id', business.id).eq('status', 'active').maybeSingle(),
    supabase.from('business_voice_settings').select('voice_id').eq('business_id', business.id).maybeSingle(),
    supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
    supabase.from('calendar_connections').select('id').eq('business_id', business.id).maybeSingle(),
    supabase.from('provider_connections').select('status').eq('business_id', business.id).eq('provider', 'stripe').maybeSingle(),
    supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
    supabase.from('calls').select('id, from_number, status, summary, started_at').eq('business_id', business.id).order('started_at', { ascending: false }).limit(4),
    supabase.from('knowledge_gaps').select('id, question, created_at', { count: 'exact' }).eq('business_id', business.id).eq('status', 'open').order('created_at', { ascending: false }).limit(4),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'completed').gte('started_at', todayStart.toISOString()),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('started_at', weekStart.toISOString()),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .gte('started_at', prevWeekStart.toISOString())
      .lt('started_at', weekStart.toISOString()),
    supabase.from('onboarding_progress').select('completed_stages').eq('business_id', business.id).maybeSingle()
  ]);

  const aiName = aiSettings?.employee_name ?? 'Ava';

  // -------- Restaurant / service specific counts --------
  let secondaryToday = 0; // orders taken / jobs booked, today
  let secondaryThisWeek = 0;
  let secondaryPrevWeek = 0;
  let orderValueAvg: number | null = null;
  let orderValuePrevAvg: number | null = null;
  let unpaidCount = 0;
  let estimatesThisWeek = 0;
  let estimatesPrevWeek = 0;
  let queueRows: { id: string; time: string; title: string; detail: string }[] = [];

  if (isRestaurant) {
    const [{ count: ordersToday }, { count: ordersWeek }, { count: ordersPrevWeek }, { data: paidOrdersWeek }, { data: paidOrdersPrevWeek }, { count: unpaid }, { data: upcoming }] =
      await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', todayStart.toISOString()),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', weekStart.toISOString()),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .gte('created_at', prevWeekStart.toISOString())
          .lt('created_at', weekStart.toISOString()),
        supabase
          .from('orders')
          .select('total')
          .eq('business_id', business.id)
          .not('status', 'in', '(draft,pending_confirmation,pending_payment,cancelled)')
          .gte('created_at', weekStart.toISOString()),
        supabase
          .from('orders')
          .select('total')
          .eq('business_id', business.id)
          .not('status', 'in', '(draft,pending_confirmation,pending_payment,cancelled)')
          .gte('created_at', prevWeekStart.toISOString())
          .lt('created_at', weekStart.toISOString()),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .in('status', ['pending_confirmation', 'pending_payment'])
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('orders')
          .select('id, customer_name, status, total, created_at')
          .eq('business_id', business.id)
          .in('status', ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'])
          .order('created_at', { ascending: true })
          .limit(4)
      ]);

    secondaryToday = ordersToday ?? 0;
    secondaryThisWeek = ordersWeek ?? 0;
    secondaryPrevWeek = ordersPrevWeek ?? 0;
    unpaidCount = unpaid ?? 0;

    const weekTotals = (paidOrdersWeek ?? []).map((o: any) => Number(o.total));
    const prevWeekTotals = (paidOrdersPrevWeek ?? []).map((o: any) => Number(o.total));
    orderValueAvg = weekTotals.length ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length : null;
    orderValuePrevAvg = prevWeekTotals.length ? prevWeekTotals.reduce((a, b) => a + b, 0) / prevWeekTotals.length : null;

    queueRows = (upcoming ?? []).map((o: any) => ({
      id: o.id,
      time: new Date(o.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      title: o.customer_name ?? 'Guest order',
      detail: `${fmtMoney(Number(o.total))} · ${String(o.status).replace(/_/g, ' ')}`
    }));
  } else {
    const [{ count: apptsToday }, { count: apptsWeek }, { count: apptsPrevWeek }, { count: estWeek }, { count: estPrevWeek }, { data: upcoming }] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', todayStart.toISOString()),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', weekStart.toISOString()),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', prevWeekStart.toISOString())
        .lt('created_at', weekStart.toISOString()),
      supabase.from('estimates').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', weekStart.toISOString()),
      supabase
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', prevWeekStart.toISOString())
        .lt('created_at', weekStart.toISOString()),
      supabase
        .from('appointments')
        .select('id, scheduled_at, appointment_type, status')
        .eq('business_id', business.id)
        .gte('scheduled_at', tomorrowStart.toISOString())
        .lt('scheduled_at', tomorrowEnd.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(4)
    ]);

    secondaryToday = apptsToday ?? 0;
    secondaryThisWeek = apptsWeek ?? 0;
    secondaryPrevWeek = apptsPrevWeek ?? 0;
    estimatesThisWeek = estWeek ?? 0;
    estimatesPrevWeek = estPrevWeek ?? 0;

    queueRows = (upcoming ?? []).map((a: any) => ({
      id: a.id,
      time: new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      title: String(a.appointment_type ?? 'appointment').replace(/_/g, ' '),
      detail: a.status
    }));
  }

  // Collected — only ever Stripe-confirmed amounts, never a sum of pending
  // checkout sessions. checkout.session.completed is the one event type
  // that corresponds 1:1 with a completed transaction (payment_intent.
  // succeeded fires for the same transaction and would double-count it).
  const { data: collectedRows } = await supabase
    .from('payments')
    .select('amount')
    .eq('business_id', business.id)
    .eq('type', 'checkout.session.completed')
    .eq('status', 'processed')
    .gte('created_at', todayStart.toISOString());
  const collectedToday = (collectedRows ?? []).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);

  const hasActiveNumber = !!activeNumber;
  const hasAssistant = !!business.vapi_assistant_id;
  const isLiveAndAnswering = business.is_live && hasActiveNumber && hasAssistant;

  const completedStages: string[] = onboardingProgress?.completed_stages ?? [];
  const paymentsReady = stripeConn?.status === 'connected' ? 'Connected' : completedStages.includes('payments') ? 'Using built-in payments' : null;

  const readinessRows = [
    {
      label: 'Phone',
      ok: hasActiveNumber && hasAssistant,
      state: hasActiveNumber && hasAssistant ? `Live on ${activeNumber?.phone_number}` : hasActiveNumber ? 'Number connected, assistant not set up' : 'No number connected'
    },
    { label: 'Voice', ok: !!voiceSettings?.voice_id, state: voiceSettings?.voice_id ? 'Selected' : 'Not set' },
    { label: 'Payments', ok: !!paymentsReady, state: paymentsReady ?? 'Not set up' },
    isRestaurant
      ? { label: 'Menu', ok: (menuItemsCount ?? 0) > 0, state: (menuItemsCount ?? 0) > 0 ? `Published · ${menuItemsCount} items` : 'Not set up' }
      : { label: 'Calendar', ok: !!calendarConn, state: calendarConn ? 'Connected' : 'Not connected' },
    {
      label: 'Knowledge',
      ok: (knowledgeChunkCount ?? 0) > 0,
      state: (openGapCount ?? 0) > 0 ? `${openGapCount} gap${openGapCount === 1 ? '' : 's'} to fill` : (knowledgeChunkCount ?? 0) > 0 ? `${knowledgeChunkCount} pieces learned` : 'Nothing added yet'
    }
  ];

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  const headline = isRestaurant
    ? secondaryToday > 0
      ? `${aiName} took ${secondaryToday} order${secondaryToday === 1 ? '' : 's'} while you were cooking.`
      : `${aiName} is ready to take orders whenever they call.`
    : secondaryToday > 0
    ? `${aiName} booked ${secondaryToday} job${secondaryToday === 1 ? '' : 's'} while you were on site.`
    : `${aiName} is ready to book jobs whenever they call.`;

  const metrics = isRestaurant
    ? [
        { label: 'Calls answered', value: answeredCount ?? 0, delta: deltaLabel((callsThisWeek ?? 0) - (callsPrevWeek ?? 0)), note: 'None missed today' },
        { label: 'Orders taken', value: secondaryToday, delta: deltaLabel(secondaryThisWeek - secondaryPrevWeek), note: unpaidCount > 0 ? `${unpaidCount} still unpaid` : 'All paid' },
        {
          label: 'Order value',
          value: orderValueAvg !== null ? fmtMoney(orderValueAvg) : '—',
          delta: orderValueAvg !== null && orderValuePrevAvg !== null ? deltaLabel(Math.round(orderValueAvg - orderValuePrevAvg)) : null,
          note: orderValueAvg !== null ? 'Average, up on last week' : 'No orders yet this week'
        },
        { label: 'Collected', value: fmtMoney(collectedToday), delta: null, note: 'Confirmed by Stripe' }
      ]
    : [
        { label: 'Calls answered', value: answeredCount ?? 0, delta: deltaLabel((callsThisWeek ?? 0) - (callsPrevWeek ?? 0)), note: 'None missed today' },
        { label: 'Jobs booked', value: secondaryToday, delta: deltaLabel(secondaryThisWeek - secondaryPrevWeek), note: 'This week' },
        { label: 'Estimates sent', value: estimatesThisWeek, delta: deltaLabel(estimatesThisWeek - estimatesPrevWeek), note: 'This week' },
        { label: 'Collected', value: fmtMoney(collectedToday), delta: null, note: 'Confirmed by Stripe' }
      ];

  const tagForCall = (status: string) => {
    if (status === 'completed') return { label: 'Answered', tone: 'info' as const };
    if (status === 'transferred') return { label: 'Transferred', tone: 'warn' as const };
    if (status === 'missed') return { label: 'Missed', tone: 'warn' as const };
    return { label: status, tone: 'mute' as const };
  };

  return (
    <div style={{ maxWidth: 1080 }} className="font-instrument">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26 }}>
        <div>
          <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dateLabel}</div>
          <h1 className="font-grotesk text-bp-ink-strong" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4 }}>
            {headline}
          </h1>
        </div>
        <div
          className="bg-bp-surface border border-bp-border"
          style={{ borderRadius: 100, padding: '7px 14px 7px 11px', boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.05)', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
        >
          <span
            className={isLiveAndAnswering ? 'bg-bp-good' : 'bg-bp-warn'}
            style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', animation: isLiveAndAnswering ? 'bp-pulse 2s ease-in-out infinite' : undefined }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{isLiveAndAnswering ? 'Live & answering' : hasActiveNumber ? 'Not live yet' : 'No number connected'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
        {metrics.map((m) => (
          <div key={m.label} className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '17px 18px', boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.04)' }}>
            <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 11 }}>
              <span className="font-grotesk text-bp-ink-strong" style={{ fontSize: 31, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {m.value}
              </span>
              {m.delta && <span className="text-bp-good" style={{ fontSize: 12 }}>{m.delta}</span>}
            </div>
            <div className="text-bp-ink-muted" style={{ fontSize: 12, marginTop: 7 }}>{m.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.04)' }}>
            <div className="border-b border-bp-border-soft" style={{ padding: '15px 18px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Recent conversations</h2>
              <a href="/conversations" className="text-bp-accent" style={{ fontSize: 12, fontWeight: 500 }}>View all</a>
            </div>
            {(!recentCalls || recentCalls.length === 0) ? (
              <div className="text-bp-ink-muted" style={{ padding: '15px 18px', fontSize: 13 }}>No calls yet.</div>
            ) : (
              recentCalls.map((c: any, i: number) => {
                const tag = tagForCall(c.status);
                return (
                  <div key={c.id} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div className="font-jetbrains" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 10.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'oklch(0.965 0.006 265)' }}>
                      {new Date(c.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.from_number ?? 'Unknown caller'}</div>
                      <div className="text-bp-ink-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.summary ?? 'No summary yet'}</div>
                    </div>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: 20,
                        whiteSpace: 'nowrap',
                        background: tag.tone === 'warn' ? 'oklch(0.965 0.04 65)' : tag.tone === 'info' ? 'oklch(0.96 0.02 265)' : 'oklch(0.955 0.004 265)',
                        color: tag.tone === 'warn' ? 'oklch(0.46 0.11 65)' : tag.tone === 'info' ? 'oklch(0.47 0.13 265)' : 'oklch(0.52 0.01 265)'
                      }}
                    >
                      {tag.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {openGaps && openGaps.length > 0 && (
            <div className="bg-bp-dark-900" style={{ borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <span className="bg-bp-warn" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                <span className="font-jetbrains text-bp-warn" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Worth your attention</span>
              </div>
              <h3 className="font-grotesk text-bp-on-dark" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {openGapCount} caller{openGapCount === 1 ? '' : 's'} wanted something {aiName} could not answer
              </h3>
              <p className="text-bp-on-dark-mid" style={{ fontSize: 13, maxWidth: '52ch', marginBottom: 14 }}>
                {aiName} transferred them to you rather than guessing. Teach her once and she handles it from then on.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {openGaps.map((g: any) => (
                  <div key={g.id} className="bg-bp-dark-800 border border-bp-dark-600" style={{ borderRadius: 10, padding: '11px 13px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span className="text-bp-on-dark-mid" style={{ fontSize: 13 }}>&ldquo;{g.question}&rdquo;</span>
                  </div>
                ))}
              </div>
              <a
                href="/teach"
                className="bg-white text-bp-ink-strong"
                style={{ display: 'inline-block', fontSize: 13, fontWeight: 600, padding: '10px 17px', borderRadius: 10 }}
              >
                Teach {aiName} the answers
              </a>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.04)' }}>
            <div className="border-b border-bp-border-soft" style={{ padding: '15px 18px 13px' }}>
              <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {isRestaurant ? 'Orders coming up' : 'Tomorrow'}
              </h2>
            </div>
            {queueRows.length === 0 ? (
              <div className="text-bp-ink-muted" style={{ padding: '15px 18px', fontSize: 13 }}>Nothing queued right now.</div>
            ) : (
              queueRows.map((r, i) => (
                <div key={r.id} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '13px 18px', display: 'flex', gap: 13 }}>
                  <div className="font-grotesk text-bp-accent" style={{ width: 52, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{r.time}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                    <div className="text-bp-ink-muted" style={{ fontSize: 12 }}>{r.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '17px 18px', boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.04)' }}>
            <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 12 }}>
              Everything {aiName} needs
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {readinessRows.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={r.ok ? 'bg-bp-good' : 'bg-bp-ink-faint'} style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 7px' }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{r.label}</span>
                  <span className="text-bp-ink-muted" style={{ fontSize: 12 }}>{r.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

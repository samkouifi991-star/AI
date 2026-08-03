import { supabaseServer } from '@/lib/supabase/server';

function tagFor(c: any, hasOrder: boolean, hasOpenGap: boolean) {
  if (hasOpenGap) return { label: 'Check', tone: 'warn' as const };
  if (hasOrder) return { label: 'Order placed', tone: 'good' as const };
  if (c.status === 'transferred') return { label: 'Transferred', tone: 'warn' as const };
  if (c.status === 'completed') return { label: 'Answered', tone: 'info' as const };
  return { label: c.status, tone: 'mute' as const };
}

function tagStyle(tone: 'good' | 'warn' | 'info' | 'mute') {
  const map = {
    good: { bg: 'oklch(0.955 0.035 165)', fg: 'oklch(0.44 0.11 165)' },
    warn: { bg: 'oklch(0.965 0.04 65)', fg: 'oklch(0.46 0.11 65)' },
    info: { bg: 'oklch(0.96 0.02 265)', fg: 'oklch(0.47 0.13 265)' },
    mute: { bg: 'oklch(0.955 0.004 265)', fg: 'oklch(0.52 0.01 265)' }
  };
  return map[tone];
}

function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return '—';
  const seconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default async function ConversationsPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user?.id)
    .single();

  const { data: aiSettings } = business
    ? await supabase.from('ai_employee_settings').select('employee_name').eq('business_id', business.id).maybeSingle()
    : { data: null };
  const aiName = aiSettings?.employee_name ?? 'Ava';

  const { data: calls } = business
    ? await supabase
        .from('calls')
        .select('*')
        .eq('business_id', business.id)
        .order('started_at', { ascending: false })
        .limit(50)
    : { data: [] };

  const callIds = (calls ?? []).map((c) => c.id);

  const [{ data: orders }, { data: gaps }] =
    callIds.length > 0
      ? await Promise.all([
          supabase.from('orders').select('id, call_id, status, total, order_type').in('call_id', callIds),
          supabase.from('knowledge_gaps').select('id, call_id, question, status').in('call_id', callIds)
        ])
      : [{ data: [] }, { data: [] }];

  const ordersByCall = new Map<string, any[]>();
  (orders ?? []).forEach((o: any) => {
    if (!o.call_id) return;
    ordersByCall.set(o.call_id, [...(ordersByCall.get(o.call_id) ?? []), o]);
  });
  const gapsByCall = new Map<string, any[]>();
  (gaps ?? []).forEach((g: any) => {
    if (!g.call_id) return;
    gapsByCall.set(g.call_id, [...(gapsByCall.get(g.call_id) ?? []), g]);
  });

  return (
    <div style={{ maxWidth: 1080 }} className="font-instrument">
      <div style={{ marginBottom: 26 }}>
        <h1 className="font-grotesk text-bp-ink-strong" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>Conversations</h1>
        <p className="text-bp-ink-muted" style={{ fontSize: 14, marginTop: 4 }}>Every call {aiName} handled, and what came of it.</p>
      </div>

      <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, boxShadow: '0 1px 2px oklch(0.21 0.012 265 / 0.04)' }}>
        {(!calls || calls.length === 0) ? (
          <div className="text-bp-ink-muted" style={{ padding: '20px', fontSize: 13.5 }}>
            No calls yet. Once your number is connected, calls will show up here.
          </div>
        ) : (
          calls.map((c, i) => {
            const callOrders = ordersByCall.get(c.id) ?? [];
            const callGaps = gapsByCall.get(c.id) ?? [];
            const hasOpenGap = callGaps.some((g: any) => g.status === 'open');
            const tag = tagFor(c, callOrders.length > 0, hasOpenGap);
            const style = tagStyle(tag.tone);
            return (
              <details key={c.id} className={i > 0 ? 'border-t border-bp-border-faint' : ''}>
                <summary
                  style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', listStyle: 'none' }}
                  className="[&::-webkit-details-marker]:hidden"
                >
                  <div className="font-jetbrains text-bp-ink-faint" style={{ width: 74, flexShrink: 0, fontSize: 11 }}>
                    {new Date(c.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-bp-ink-body" style={{ fontSize: 14, fontWeight: 500 }}>{c.from_number ?? 'Unknown caller'}</div>
                    <div className="text-bp-ink-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.summary ?? 'No summary yet'}
                    </div>
                  </div>
                  <div className="font-jetbrains text-bp-ink-faint" style={{ width: 46, textAlign: 'right', fontSize: 11, flexShrink: 0 }}>
                    {formatDuration(c.started_at, c.ended_at)}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', background: style.bg, color: style.fg }}>
                    {tag.label}
                  </span>
                </summary>

                <div className="border-t border-bp-border-faint" style={{ padding: '16px 20px 20px 110px' }}>
                  <div className="text-bp-ink" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
                    {c.summary && (
                      <div>
                        <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Summary</div>
                        <p>{c.summary}</p>
                      </div>
                    )}

                    <div>
                      <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Transcript</div>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{c.transcript ?? 'Not available yet.'}</p>
                      {c.translated_transcript && (
                        <>
                          <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 10, marginBottom: 4 }}>
                            Translated (English)
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{c.translated_transcript}</p>
                        </>
                      )}
                    </div>

                    {c.recording_url && (
                      <a href={c.recording_url} target="_blank" rel="noreferrer" className="text-bp-accent" style={{ fontWeight: 500 }}>
                        Listen to recording
                      </a>
                    )}

                    {callOrders.length > 0 && (
                      <div>
                        <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Order</div>
                        {callOrders.map((o: any) => (
                          <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{o.order_type} — {o.status.replace(/_/g, ' ')}</span>
                            <span style={{ fontWeight: 500 }}>${Number(o.total).toFixed(2)}</span>
                          </div>
                        ))}
                        <a href="/orders" className="text-bp-accent" style={{ fontSize: 12, fontWeight: 500 }}>View in Orders →</a>
                      </div>
                    )}

                    {callGaps.length > 0 && (
                      <div>
                        <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                          Questions {aiName} raised on this call
                        </div>
                        {callGaps.map((g: any) => (
                          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>&ldquo;{g.question}&rdquo;</span>
                            <span className="text-bp-ink-muted">{g.status}</span>
                          </div>
                        ))}
                        <a href="/teach" className="text-bp-accent" style={{ fontSize: 12, fontWeight: 500 }}>Resolve in Teach {aiName} →</a>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}

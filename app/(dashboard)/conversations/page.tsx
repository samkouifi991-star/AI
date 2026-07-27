import { supabaseServer } from '@/lib/supabase/server';

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

  const ordersByCall = new Map<string, typeof orders>();
  (orders ?? []).forEach((o) => {
    if (!o.call_id) return;
    ordersByCall.set(o.call_id, [...(ordersByCall.get(o.call_id) ?? []), o] as any);
  });
  const gapsByCall = new Map<string, typeof gaps>();
  (gaps ?? []).forEach((g) => {
    if (!g.call_id) return;
    gapsByCall.set(g.call_id, [...(gapsByCall.get(g.call_id) ?? []), g] as any);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Conversations</h1>
        <p className="text-slate-600 text-sm">
          Every real call your AI has handled — transcript, any order it took, and any question it couldn&apos;t
          answer. Practice calls never appear here.
        </p>
      </div>

      {(!calls || calls.length === 0) && <div className="card text-sm text-slate-600">No calls yet.</div>}

      <div className="space-y-3">
        {calls?.map((c) => {
          const callOrders = ordersByCall.get(c.id) ?? [];
          const callGaps = gapsByCall.get(c.id) ?? [];
          return (
            <details key={c.id} className="card">
              <summary className="cursor-pointer flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{c.from_number ?? 'Unknown number'}</span>
                  <span
                    className={
                      c.status === 'completed' ? 'badge-success' : c.status === 'transferred' ? 'badge-warning' : 'badge-danger'
                    }
                  >
                    {c.status}
                  </span>
                  {callOrders.length > 0 && <span className="badge-success">order placed</span>}
                  {callGaps.some((g: any) => g.status === 'open') && <span className="badge-warning">unanswered question</span>}
                </div>
                <span className="text-xs text-slate-500">{new Date(c.started_at).toLocaleString()}</span>
              </summary>

              <div className="mt-4 space-y-4 text-sm">
                {c.summary && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Summary</div>
                    <p className="text-slate-700">{c.summary}</p>
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Transcript</div>
                  <p className="text-slate-700 whitespace-pre-wrap">{c.transcript ?? 'Not available yet.'}</p>
                  {c.translated_transcript && (
                    <>
                      <div className="text-xs font-medium text-slate-500 mt-2 mb-1">Translated (English)</div>
                      <p className="text-slate-700 whitespace-pre-wrap">{c.translated_transcript}</p>
                    </>
                  )}
                </div>

                {c.recording_url && (
                  <a href={c.recording_url} target="_blank" className="text-brand-600 font-medium" rel="noreferrer">
                    Listen to recording
                  </a>
                )}

                {callOrders.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Order</div>
                    {callOrders.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between">
                        <span>
                          {o.order_type} — <span className="badge-success">{o.status}</span>
                        </span>
                        <span className="font-medium">${Number(o.total).toFixed(2)}</span>
                      </div>
                    ))}
                    <a href="/orders" className="text-brand-600 font-medium text-xs">
                      View in Orders →
                    </a>
                  </div>
                )}

                {callGaps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Knowledge gaps raised on this call</div>
                    {callGaps.map((g: any) => (
                      <div key={g.id} className="flex items-center justify-between">
                        <span>{g.question}</span>
                        <span className={g.status === 'open' ? 'badge-warning' : 'badge-success'}>{g.status}</span>
                      </div>
                    ))}
                    <a href="/teach" className="text-brand-600 font-medium text-xs">
                      Resolve in Teach Ava →
                    </a>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

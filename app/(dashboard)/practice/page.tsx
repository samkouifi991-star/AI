'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type ChatTurn = { role: 'customer' | 'assistant'; content: string };
type Action = { tool: string; params: any; result: any; suppressedAction?: string };

const SCENARIOS = [
  { label: 'New order or booking', starter: "Hi, I'd like to place an order." },
  { label: 'Question about hours', starter: 'Hi, are you open right now?' },
  { label: 'Something she won’t know', starter: 'Do you offer a military discount on Tuesdays?' },
  { label: 'Wants a person', starter: 'Can I talk to a real person, please?' }
];

function toolLabel(tool: string) {
  return tool.replace(/_/g, ' ');
}

export default function PracticePage() {
  const supabase = supabaseBrowser();
  const [aiName, setAiName] = useState('Ava');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gapsRaised, setGapsRaised] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase
      .auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return;
        const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
        if (!business) return;
        const { data: employeeSettings } = await supabase.from('ai_employee_settings').select('employee_name').eq('business_id', business.id).maybeSingle();
        setAiName(employeeSettings?.employee_name ?? 'Ava');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  async function startSession(scenarioLabel?: string, starter?: string) {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/practice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioLabel })
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? 'Could not start a practice session.');
      return;
    }
    setSessionId(data.sessionId);
    setScenario(scenarioLabel ?? null);
    setEnded(false);
    setTurns([]);
    setActions([]);
    setGapsRaised(null);
    setBusy(false);
    if (starter) {
      await sendMessage(data.sessionId, starter);
    }
  }

  async function sendMessage(sid: string, message: string) {
    setTurns((t) => [...t, { role: 'customer', content: message }]);
    setBusy(true);
    setError(null);

    const res = await fetch('/api/practice/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, message })
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.');
      return;
    }
    setTurns((t) => [...t, { role: 'assistant', content: data.reply }]);
    setActions((a) => [...a, ...data.actions]);
  }

  async function send() {
    if (!sessionId || !input.trim() || busy) return;
    const message = input.trim();
    setInput('');
    await sendMessage(sessionId, message);
  }

  async function endSession() {
    if (!sessionId) return;
    setBusy(true);
    await fetch('/api/practice/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
    const { count } = await supabase.from('knowledge_gaps').select('id', { count: 'exact', head: true }).eq('practice_session_id', sessionId);
    setGapsRaised(count ?? 0);
    setEnded(true);
    setBusy(false);
  }

  function reset() {
    setSessionId(null);
    setScenario(null);
    setEnded(false);
    setTurns([]);
    setActions([]);
    setGapsRaised(null);
    setError(null);
  }

  const buttonLabel = !sessionId ? 'Run a practice call' : busy ? 'Working…' : ended ? 'Run it again' : 'Working…';
  const running = busy && !!sessionId;

  return (
    <div style={{ maxWidth: 1140 }} className="font-instrument">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
        <div>
          <h1 className="font-grotesk text-bp-ink-strong" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>Practice with {aiName}</h1>
          <p className="text-bp-ink-muted" style={{ fontSize: 14, marginTop: 4, maxWidth: '60ch' }}>
            She runs on your real menu, knowledge and pricing — the same code as a live call. Only three things are held back: texts, calendar entries and payment links.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {sessionId && (
            <button className="btn-secondary" onClick={reset}>Reset</button>
          )}
          {!sessionId && (
            <button className="btn-primary" style={{ background: 'oklch(0.56 0.15 265)' }} onClick={() => startSession()} disabled={busy}>
              {buttonLabel}
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2" style={{ marginBottom: 12 }}>{error}</div>}

      {!sessionId && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: 20, marginBottom: 12 }}>
          <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Or start from a scenario</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SCENARIOS.map((s) => (
              <button
                key={s.label}
                className="border-bp-border-input"
                style={{ fontSize: 13, fontWeight: 500, padding: '11px 13px', borderRadius: 10, border: '1px solid' }}
                onClick={() => startSession(s.label, s.starter)}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {sessionId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.9fr)', gap: 12, alignItems: 'start' }}>
          {/* Column 1: The conversation */}
          <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, minHeight: 460, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b border-bp-border-soft" style={{ padding: '15px 18px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className={running ? 'bg-bp-good' : ''}
                style={{ width: 6, height: 6, borderRadius: '50%', background: running ? undefined : 'oklch(0.85 0.008 265)', animation: running ? 'bp-pulse 1.2s ease-in-out infinite' : undefined }}
              />
              <span className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>The conversation</span>
              {scenario && <span className="text-bp-ink-faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{scenario}</span>}
            </div>
            <div style={{ flex: 1, padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              {turns.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 10 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} style={{ width: 3, height: 26, background: 'oklch(0.88 0.02 265)', borderRadius: 2, display: 'inline-block' }} />
                    ))}
                  </div>
                  <p className="text-bp-ink-muted" style={{ fontSize: 13 }}>Press Run a practice call to watch her handle a real customer call.</p>
                </div>
              ) : (
                turns.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: t.role === 'customer' ? 'flex-end' : 'flex-start', animation: 'bp-rise 0.35s ease-out' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        maxWidth: '88%',
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        padding: '9px 13px',
                        borderRadius: 14,
                        borderBottomLeftRadius: t.role === 'assistant' ? 5 : 14,
                        borderBottomRightRadius: t.role === 'customer' ? 5 : 14,
                        background: t.role === 'customer' ? 'oklch(0.56 0.15 265)' : 'oklch(0.965 0.006 265)',
                        color: t.role === 'customer' ? 'white' : 'oklch(0.24 0.012 265)'
                      }}
                    >
                      {t.content}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-bp-border-soft" style={{ padding: 13, display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="Play the customer…"
                value={input}
                disabled={ended || busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button className="btn-primary" onClick={send} disabled={ended || busy || !input.trim()}>Send</button>
              {!ended && <button className="btn-secondary" onClick={endSession} disabled={busy}>End</button>}
            </div>
          </div>

          {/* Column 2: What she did */}
          <div className="bg-bp-dark-900" style={{ borderRadius: 14, minHeight: 460, padding: '16px 17px' }}>
            <div className="font-jetbrains text-bp-on-dark-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>What she did</div>
            {actions.length === 0 ? (
              <p className="text-bp-on-dark-faint" style={{ fontSize: 13 }}>Every lookup, every price, every booking — in order.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {actions.map((a, i) => {
                  const empty = a.result?.result === 'not_available_in_practice' || (typeof a.result?.result === 'string' && a.result.result.includes('not found'));
                  const simulated = !!a.suppressedAction;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 16, animation: 'bp-rise 0.35s ease-out' }}>
                      <div style={{ width: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: simulated ? 'oklch(0.66 0.15 265)' : empty ? 'oklch(0.52 0.01 265)' : 'oklch(0.62 0.13 165)'
                          }}
                        />
                        {i < actions.length - 1 && <span style={{ width: 1, flex: 1, background: 'oklch(0.32 0.016 265)', marginTop: 4 }} />}
                      </div>
                      <div>
                        <div className="font-jetbrains text-bp-on-dark-faint" style={{ fontSize: 10.5 }}>{toolLabel(a.tool)}</div>
                        <div className="text-bp-on-dark-mid" style={{ fontSize: 13, marginTop: 2 }}>
                          {typeof a.result?.result === 'string' ? a.result.result : 'Done'}
                        </div>
                        {simulated && (
                          <div
                            className="text-[oklch(0.72_0.11_165)] bg-bp-dark-800"
                            style={{ display: 'inline-block', marginTop: 6, fontSize: 11, borderRadius: 7, padding: '5px 8px', fontFamily: 'var(--font-jetbrains)' }}
                          >
                            Would have: {a.suppressedAction}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 3 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '11px 17px' }}>
              <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 10px' }}>What actually happened</div>
              {actions.filter((a) => a.suppressedAction || (typeof a.result?.result === 'string' && !a.result.result.includes('not_available'))).length === 0 ? (
                <p className="text-bp-ink-muted" style={{ fontSize: 12, paddingBottom: 8 }}>Real bookings and orders appear here, plus anything she would have sent.</p>
              ) : (
                actions
                  .filter((a) => ['confirm_order', 'add_order_item', 'book_appointment', 'save_lead', 'transfer_call'].includes(a.tool) || a.suppressedAction)
                  .map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 11, paddingBottom: 11, animation: 'bp-rise 0.35s ease-out' }}>
                      <span
                        style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: a.suppressedAction ? 'oklch(0.66 0.15 265)' : 'oklch(0.62 0.13 165)' }}
                      />
                      <div>
                        {a.suppressedAction && (
                          <div className="text-bp-accent-soft font-jetbrains" style={{ fontSize: 10, marginBottom: 2 }}>Not sent — practice</div>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{toolLabel(a.tool)}</div>
                        <div className="text-bp-ink-muted" style={{ fontSize: 12 }}>
                          {a.suppressedAction ?? (typeof a.result?.result === 'string' ? a.result.result : '')}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {ended && gapsRaised !== null && (
              <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '15px 17px' }}>
                <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Session summary</div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <div>{turns.filter((t) => t.role === 'customer').length} customer turn{turns.filter((t) => t.role === 'customer').length === 1 ? '' : 's'}</div>
                  <div>{actions.length} tool call{actions.length === 1 ? '' : 's'}</div>
                  <div className={gapsRaised > 0 ? 'text-warning' : ''}>
                    {gapsRaised > 0 ? `${gapsRaised} question${gapsRaised === 1 ? '' : 's'} she couldn't answer — see Teach ${aiName}` : `Nothing she couldn't answer`}
                  </div>
                </div>
                {gapsRaised > 0 && (
                  <a href="/teach" className="text-bp-accent" style={{ fontSize: 12.5, fontWeight: 500, marginTop: 8, display: 'inline-block' }}>Go to Teach {aiName} →</a>
                )}
              </div>
            )}

            <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '11px 17px' }}>
              <div className="font-jetbrains text-bp-ink-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 10px' }}>Or type it yourself</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Hi, are you open right now?', "I'd like to place an order.", 'Something she won’t know'].map((s) => (
                  <button
                    key={s}
                    className="border-bp-border-input"
                    style={{ fontSize: 13, fontWeight: 500, padding: '11px 13px', borderRadius: 10, border: '1px solid', textAlign: 'left' }}
                    disabled={ended || busy}
                    onClick={() => sendMessage(sessionId, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

type ChatTurn = { role: 'customer' | 'assistant'; content: string };
type Action = { tool: string; params: any; result: any; suppressedAction?: string };

export default function PracticePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/practice/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'Could not start a practice session.');
      return;
    }
    setSessionId(data.sessionId);
    setEnded(false);
    setTurns([]);
    setActions([]);
  }

  async function send() {
    if (!sessionId || !input.trim() || busy) return;
    const message = input.trim();
    setInput('');
    setTurns((t) => [...t, { role: 'customer', content: message }]);
    setBusy(true);
    setError(null);

    const res = await fetch('/api/practice/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message })
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

  async function endSession() {
    if (!sessionId) return;
    await fetch('/api/practice/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
    setEnded(true);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Practice</h1>
        <p className="text-slate-600 text-sm">
          Rehearse a call with Ava before a real customer ever does — same logic as a live call, but nothing here is real.
        </p>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 font-medium">
        PRACTICE MODE — no real phone call, no real SMS, no real charge, no real calendar event. This never appears in
        Conversations, Orders, Leads, or Appointments.
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {!sessionId && (
        <div className="card">
          <button className="btn-primary" onClick={startSession} disabled={busy}>
            Start practice session
          </button>
        </div>
      )}

      {sessionId && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card flex flex-col h-[32rem]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">Conversation</h2>
              {!ended ? (
                <button className="btn-secondary text-sm" onClick={endSession}>
                  End session
                </button>
              ) : (
                <span className="badge-warning">Session ended</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {turns.length === 0 && <p className="text-sm text-slate-600">Type what a customer might say — e.g. &quot;Hi, do you have gluten-free pizza?&quot;</p>}
              {turns.map((t, i) => (
                <div key={i} className={t.role === 'customer' ? 'text-right' : 'text-left'}>
                  <span
                    className={
                      t.role === 'customer'
                        ? 'inline-block bg-brand-600 text-white rounded-lg px-3 py-2 text-sm max-w-[85%]'
                        : 'inline-block bg-slate-100 text-ink rounded-lg px-3 py-2 text-sm max-w-[85%]'
                    }
                  >
                    {t.content}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Play the customer…"
                value={input}
                disabled={ended || busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button className="btn-primary" onClick={send} disabled={ended || busy || !input.trim()}>
                Send
              </button>
            </div>
          </div>

          <div className="card overflow-y-auto h-[32rem]">
            <h2 className="font-display text-lg font-semibold mb-3">Safe action trail</h2>
            {actions.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing yet — actions Ava takes (menu lookups, orders, transfers) will show up here.</p>
            ) : (
              <div className="space-y-3">
                {actions.map((a, i) => (
                  <div key={i} className="border border-slate-100 rounded-lg p-3 text-sm space-y-1">
                    <div className="font-medium">{a.tool}</div>
                    <div className="text-slate-600">{a.result?.result}</div>
                    {a.suppressedAction && (
                      <div className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">Would have: {a.suppressedAction}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

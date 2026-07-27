'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Gap = {
  id: string;
  question: string;
  answer: string | null;
  status: 'open' | 'answered' | 'dismissed' | 'irrelevant';
  source: 'live' | 'practice';
  redacted: boolean;
  created_at: string;
  resolved_at: string | null;
};

type Doc = { id: string; file_name: string; doc_type: string | null; status: string; created_at: string };

const STATUS_BADGE: Record<string, string> = {
  answered: 'badge-success',
  dismissed: 'badge-warning',
  irrelevant: 'badge-warning'
};

export default function TeachPage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [openGaps, setOpenGaps] = useState<Gap[]>([]);
  const [history, setHistory] = useState<Gap[]>([]);
  const [sources, setSources] = useState<Doc[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh(bizId: string) {
    const [{ data: open }, { data: resolved }, { data: docs }] = await Promise.all([
      supabase
        .from('knowledge_gaps')
        .select('id, question, answer, status, source, redacted, created_at, resolved_at')
        .eq('business_id', bizId)
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase
        .from('knowledge_gaps')
        .select('id, question, answer, status, source, redacted, created_at, resolved_at')
        .eq('business_id', bizId)
        .neq('status', 'open')
        .order('resolved_at', { ascending: false })
        .limit(50),
      supabase
        .from('knowledge_documents')
        .select('id, file_name, doc_type, status, created_at')
        .eq('business_id', bizId)
        .order('created_at', { ascending: false })
    ]);
    setOpenGaps(open ?? []);
    setHistory(resolved ?? []);
    setSources(docs ?? []);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
      if (business) {
        setBusinessId(business.id);
        refresh(business.id);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function runAction(gapId: string, action: 'answer' | 'edit' | 'dismiss' | 'irrelevant') {
    if (!businessId) return;
    setError(null);
    setBusy((b) => ({ ...b, [gapId]: true }));

    const res = await fetch('/api/teach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gapId, action, answer: drafts[gapId] })
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.');
    } else {
      setDrafts((d) => {
        const next = { ...d };
        delete next[gapId];
        return next;
      });
      await refresh(businessId);
    }
    setBusy((b) => ({ ...b, [gapId]: false }));
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Teach Ava</h1>
        <p className="text-slate-600 text-sm">
          Real questions Ava couldn&apos;t answer on real calls. Answer one and she&apos;ll know it on the next call —
          nothing here is invented or simulated.
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Unanswered questions ({openGaps.length})</h2>
        {openGaps.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing waiting on you right now.</p>
        ) : (
          <div className="space-y-4">
            {openGaps.map((g) => (
              <div key={g.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{g.question}</p>
                  <span className={g.source === 'practice' ? 'badge-warning' : 'badge-success'}>{g.source}</span>
                </div>
                {g.redacted && (
                  <p className="text-xs text-slate-500">Some sensitive details in the original question were redacted before storage.</p>
                )}
                <textarea
                  className="input"
                  rows={2}
                  placeholder="How should Ava answer this from now on?"
                  value={drafts[g.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary text-sm"
                    disabled={busy[g.id] || !(drafts[g.id] ?? '').trim()}
                    onClick={() => runAction(g.id, 'answer')}
                  >
                    Save answer
                  </button>
                  <button className="btn-secondary text-sm" disabled={busy[g.id]} onClick={() => runAction(g.id, 'dismiss')}>
                    Dismiss
                  </button>
                  <button className="btn-secondary text-sm" disabled={busy[g.id]} onClick={() => runAction(g.id, 'irrelevant')}>
                    Mark irrelevant
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Knowledge sources</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-600">
            No knowledge yet — upload documents in Knowledge Base, or answer a question below.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sources.map((d) => (
              <div key={d.id} className="py-2 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {d.doc_type === 'teach_ava_answers' ? 'Answers from Teach Ava' : d.file_name}
                </span>
                <span className={d.status === 'ready' ? 'badge-success' : d.status === 'failed' ? 'badge-danger' : 'badge-warning'}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <a href="/knowledge-base" className="text-sm text-brand-600 font-medium mt-3 inline-block">
          Manage documents in Knowledge Base →
        </a>
      </section>

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Training history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing resolved yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((g) => (
              <div key={g.id} className="border border-slate-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{g.question}</p>
                  <span className={STATUS_BADGE[g.status] ?? 'badge-warning'}>{g.status}</span>
                </div>
                {g.answer && <p className="text-sm text-slate-600">{g.answer}</p>}
                {g.status === 'answered' && (
                  <div className="space-y-2">
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Edit this answer…"
                      value={drafts[g.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                    />
                    <button
                      className="btn-secondary text-sm"
                      disabled={busy[g.id] || !(drafts[g.id] ?? '').trim()}
                      onClick={() => runAction(g.id, 'edit')}
                    >
                      Save edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

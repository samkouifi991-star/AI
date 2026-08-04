'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import AiInstructionsPanel from '@/components/teach/AiInstructionsPanel';
import WebsiteImportPanel from '@/components/teach/WebsiteImportPanel';
import DocumentUploadPanel from '@/components/teach/DocumentUploadPanel';
import BusinessKnowledgePanel from '@/components/teach/BusinessKnowledgePanel';

type Gap = {
  id: string;
  question: string;
  answer: string | null;
  status: 'open' | 'answered' | 'dismissed' | 'irrelevant';
  source: 'live' | 'practice';
  redacted: boolean;
  reason: 'no_match' | 'low_confidence' | 'transfer_requested' | null;
  confidence_score: number | null;
  created_at: string;
  resolved_at: string | null;
};

type Doc = { id: string; file_name: string; doc_type: string | null; status: string; created_at: string };

type Tab = 'questions' | 'instructions' | 'website' | 'business' | 'files' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'questions', label: 'Questions to answer' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'website', label: 'Website' },
  { key: 'business', label: 'Business knowledge' },
  { key: 'files', label: 'Files and sources' },
  { key: 'history', label: 'Training history' }
];

function reasonSentence(g: Gap, aiName: string): string {
  if (g.reason === 'low_confidence') {
    const pct = g.confidence_score !== null ? Math.round(g.confidence_score * 100) : null;
    return `She found something related, but was not confident it answered the question.${pct !== null ? ` (best match ${pct}%)` : ''}`;
  }
  if (g.reason === 'transfer_requested') {
    return `She passed the call to you because she was missing this information.`;
  }
  return `She had nothing on this at all.`;
}

export default function TeachPage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [aiName, setAiName] = useState('Ava');
  const [businessType, setBusinessType] = useState('service');
  const [tab, setTab] = useState<Tab>('questions');
  const [openGaps, setOpenGaps] = useState<Gap[]>([]);
  const [history, setHistory] = useState<Gap[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [website, setWebsite] = useState<string | null>(null);
  const [menuOrServicesCount, setMenuOrServicesCount] = useState(0);
  const [hoursSet, setHoursSet] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [suggestionMeta, setSuggestionMeta] = useState<Record<string, { basedOnContext: boolean } | undefined>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh(bizId: string, isRestaurant: boolean) {
    const [{ data: open }, { data: resolved }, { data: allDocs }, { count: chunks }, { data: business }, { count: itemCount }, { count: hoursCount }] = await Promise.all([
      supabase
        .from('knowledge_gaps')
        .select('id, question, answer, status, source, redacted, reason, confidence_score, created_at, resolved_at')
        .eq('business_id', bizId)
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase
        .from('knowledge_gaps')
        .select('id, question, answer, status, source, redacted, reason, confidence_score, created_at, resolved_at')
        .eq('business_id', bizId)
        .neq('status', 'open')
        .order('resolved_at', { ascending: false })
        .limit(8),
      supabase
        .from('knowledge_documents')
        .select('id, file_name, doc_type, status, created_at')
        .eq('business_id', bizId)
        .neq('doc_type', 'teach_ava_answers')
        .order('created_at', { ascending: false }),
      supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq('business_id', bizId),
      supabase.from('businesses').select('website').eq('id', bizId).single(),
      isRestaurant
        ? supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('business_id', bizId)
        : supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', bizId),
      supabase.from('business_hours').select('id', { count: 'exact', head: true }).eq('business_id', bizId)
    ]);
    setOpenGaps(open ?? []);
    setHistory(resolved ?? []);
    setDocs(allDocs ?? []);
    setChunkCount(chunks ?? 0);
    setWebsite(business?.website ?? null);
    setMenuOrServicesCount(itemCount ?? 0);
    setHoursSet((hoursCount ?? 0) > 0);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase.from('businesses').select('id, business_type').eq('owner_user_id', user.id).single();
      if (!business) return;
      setBusinessId(business.id);
      setBusinessType(business.business_type ?? 'service');
      const { data: employeeSettings } = await supabase.from('ai_employee_settings').select('employee_name').eq('business_id', business.id).maybeSingle();
      setAiName(employeeSettings?.employee_name ?? 'Ava');
      await refresh(business.id, business.business_type === 'restaurant');
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
      await refresh(businessId, businessType === 'restaurant');
    }
    setBusy((b) => ({ ...b, [gapId]: false }));
  }

  async function suggest(gapId: string) {
    setError(null);
    setBusy((b) => ({ ...b, [gapId]: true }));
    const res = await fetch('/api/teach/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gapId })
    });
    const data = await res.json();
    setBusy((b) => ({ ...b, [gapId]: false }));
    if (!res.ok) {
      setError(data.error ?? 'Could not generate a suggestion.');
      return;
    }
    if (!data.suggestion) {
      setError(`${aiName} doesn't have enough in her knowledge base to suggest an answer to this one — you'll need to write it.`);
      return;
    }
    setDrafts((d) => ({ ...d, [gapId]: data.suggestion }));
    setSuggestionMeta((m) => ({ ...m, [gapId]: { basedOnContext: data.basedOnContext } }));
  }

  const problems: string[] = [];
  docs.filter((d) => d.status === 'failed').forEach((d) => problems.push(`1 document could not be read, so nothing in it is available on calls: ${d.file_name}.`));
  if (!hoursSet) problems.push(`She cannot tell callers when you are open — your hours are not set.`);

  const knowledgeRows = [
    { label: 'Your website', ok: !!website, state: website ?? 'Not set — she cannot answer from your site' },
    {
      label: businessType === 'restaurant' ? 'Your menu' : 'Your services',
      ok: menuOrServicesCount > 0,
      state: menuOrServicesCount > 0 ? `${menuOrServicesCount} item${menuOrServicesCount === 1 ? '' : 's'}` : 'Not set up'
    },
    {
      label: 'Answers you have given her',
      ok: history.filter((g) => g.status === 'answered').length > 0,
      state: `${history.filter((g) => g.status === 'answered').length} taught`
    },
    { label: 'Your documents', ok: docs.length > 0, state: docs.length > 0 ? `${docs.length} document${docs.length === 1 ? '' : 's'}` : 'None uploaded' },
    { label: 'Your hours', ok: hoursSet, state: hoursSet ? 'Set' : 'Not set — she cannot tell callers when you are open' }
  ];

  async function refreshCurrent() {
    if (businessId) await refresh(businessId, businessType === 'restaurant');
  }

  return (
    <div style={{ maxWidth: 1080 }} className="font-instrument space-y-3">
      <div style={{ marginBottom: 10 }}>
        <h1 className="font-grotesk text-bp-ink-strong" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>Teach {aiName}</h1>
        <p className="text-bp-ink-muted" style={{ fontSize: 14, marginTop: 4, maxWidth: '62ch' }}>
          The more {aiName} knows about how you work, the better she sounds. She learns from what you give her — and tells you what she&apos;s still missing.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--tw-border-opacity,1) oklch(0.925 0.005 265)', paddingBottom: 2 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'text-bp-ink-strong' : 'text-bp-ink-muted'}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '9px 13px',
              borderBottom: tab === t.key ? '2px solid oklch(0.56 0.15 265)' : '2px solid transparent'
            }}
          >
            {t.label}
            {t.key === 'questions' && openGaps.length > 0 && ` (${openGaps.length})`}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {tab === 'questions' && (
        <div className="bg-bp-dark-900" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="border-b border-bp-dark-700" style={{ padding: '20px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <span className="bg-bp-warn" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
              <span className="font-jetbrains text-bp-warn" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Worth your attention</span>
            </div>
            <h2 className="font-grotesk text-bp-on-dark" style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>
              {openGaps.length} question{openGaps.length === 1 ? '' : 's'} she could not answer
            </h2>
            <p className="text-bp-on-dark-mid" style={{ fontSize: 13, maxWidth: '58ch' }}>
              She passed these to you rather than guessing. Answer one and she handles it from the next call onward.
            </p>
            <div className="font-jetbrains text-bp-on-dark-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 10 }}>
              {history.filter((g) => g.status === 'answered').length} already taught
            </div>
          </div>
          <div style={{ padding: openGaps.length ? '20px 24px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openGaps.length === 0 ? (
              <p className="text-bp-on-dark-muted" style={{ fontSize: 13 }}>Nothing waiting on you right now.</p>
            ) : (
              openGaps.map((g) => (
                <div key={g.id} className="bg-bp-dark-800 border border-bp-dark-600" style={{ borderRadius: 11, padding: '15px 16px' }}>
                  <div className="text-bp-on-dark" style={{ fontSize: 14, lineHeight: 1.5 }}>&ldquo;{g.question}&rdquo;</div>
                  <div className="text-bp-on-dark-faint" style={{ fontSize: 12, marginTop: 4 }}>{reasonSentence(g, aiName)}</div>
                  {g.redacted && <div className="text-bp-on-dark-faint" style={{ fontSize: 11, marginTop: 2 }}>Some sensitive details were redacted before storage.</div>}
                  <div className="font-jetbrains text-bp-on-dark-faint" style={{ fontSize: 10, marginTop: 8 }}>
                    {g.source} · {new Date(g.created_at).toLocaleDateString()}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="font-instrument"
                      rows={2}
                      placeholder={`How should ${aiName} answer this from now on?`}
                      value={drafts[g.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                      style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(0.30 0.018 265)', background: 'oklch(0.235 0.016 265)', color: 'white' }}
                    />
                    {suggestionMeta[g.id] && drafts[g.id] && (
                      <div className="text-bp-accent-soft" style={{ fontSize: 11, marginTop: 4 }}>
                        {suggestionMeta[g.id]?.basedOnContext ? `Suggested by ${aiName} from your existing knowledge — review before saving.` : `Suggested draft — review before saving.`}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => suggest(g.id)}
                        disabled={busy[g.id]}
                        className="text-bp-on-dark-mid"
                        style={{ fontSize: 12, fontWeight: 500, padding: '7px 11px', borderRadius: 9, background: 'oklch(0.28 0.016 265)' }}
                      >
                        Suggest an answer
                      </button>
                      <button
                        onClick={() => runAction(g.id, 'answer')}
                        disabled={busy[g.id] || !(drafts[g.id] ?? '').trim()}
                        className="text-white"
                        style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 9, background: 'oklch(0.30 0.018 265)' }}
                      >
                        Approve &amp; save
                      </button>
                      <button
                        onClick={() => runAction(g.id, 'dismiss')}
                        disabled={busy[g.id]}
                        className="text-bp-on-dark-faint"
                        style={{ fontSize: 12, fontWeight: 500, padding: '7px 11px' }}
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => runAction(g.id, 'irrelevant')}
                        disabled={busy[g.id]}
                        className="text-bp-on-dark-faint"
                        style={{ fontSize: 12, fontWeight: 500, padding: '7px 11px' }}
                      >
                        Not relevant
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-bp-dark-700" style={{ padding: '16px 24px' }}>
            <h3 className="font-grotesk text-bp-on-dark" style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>What {aiName} knows</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {knowledgeRows.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={r.ok ? 'bg-bp-good' : 'bg-bp-on-dark-faint'} style={{ width: 6, height: 6, borderRadius: '50%', flex: '0 0 6px' }} />
                  <span className="text-bp-on-dark-mid" style={{ fontSize: 12.5, flex: 1 }}>{r.label}</span>
                  <span className="text-bp-on-dark-faint" style={{ fontSize: 11.5 }}>{r.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'instructions' && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>How should {aiName} behave?</h2>
          <p className="text-bp-ink-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Tone, priorities, pricing and policy rules, and anything {aiName} should never say or invent.
          </p>
          <AiInstructionsPanel aiName={aiName} />
        </div>
      )}

      {tab === 'website' && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Import from your website</h2>
          <WebsiteImportPanel onChanged={refreshCurrent} />
        </div>
      )}

      {tab === 'business' && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Teach {aiName} about the business</h2>
          <p className="text-bp-ink-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Only things we can actually see in your data are ever shown as gaps.</p>
          {problems.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 18, marginBottom: 16 }}>
              {problems.map((p) => (
                <li key={p} className="text-bp-warn-ink" style={{ fontSize: 13, lineHeight: 1.5 }}>{p}</li>
              ))}
            </ul>
          )}
          <BusinessKnowledgePanel isRestaurant={businessType === 'restaurant'} onChanged={refreshCurrent} />
        </div>
      )}

      {tab === 'files' && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Files and sources</h2>
          <p className="text-bp-ink-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            {chunkCount} piece{chunkCount === 1 ? '' : 's'} of your business {aiName} can search during a call.
          </p>
          <DocumentUploadPanel onChanged={refreshCurrent} />
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 14 }}>
          <div className="border-b border-bp-border-soft" style={{ padding: '15px 18px 13px' }}>
            <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Recent training</h2>
          </div>
          {history.length === 0 ? (
            <div className="text-bp-ink-muted" style={{ padding: '15px 18px', fontSize: 13 }}>Nothing resolved yet.</div>
          ) : (
            history.map((g, i) => (
              <div key={g.id} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{g.question}</div>
                  {g.answer && <div className="text-bp-ink-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{g.answer}</div>}
                </div>
                <span
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'flex-start' }}
                  className={g.status === 'answered' ? 'text-bp-good-ink bg-bp-good-bg' : 'text-bp-mute-ink bg-bp-mute-bg'}
                >
                  {g.status === 'answered' ? 'Ready' : g.status === 'dismissed' ? 'Dismissed' : 'Not relevant'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

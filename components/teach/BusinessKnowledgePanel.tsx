'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import OpeningHoursPanel from './OpeningHoursPanel';

type Faq = { id?: string; question: string; answer: string };

/**
 * "Teach Ava about the business" — shared between onboarding's Teach-her
 * step and /teach's Business knowledge tab. Every field here becomes a
 * real, searchable knowledge chunk (lib/business-knowledge-sync.ts) —
 * never appended to the system prompt — so it's retrieved the same way
 * an uploaded document would be, live on the very next call. Hours are
 * delegated entirely to OpeningHoursPanel — the same component
 * /restaurant-settings uses — so there is exactly one hours editor, not
 * a simplified copy living here too.
 */
export default function BusinessKnowledgePanel({ isRestaurant, onChanged }: { isRestaurant: boolean; onChanged?: () => void }) {
  const supabase = supabaseBrowser();

  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [policiesText, setPoliciesText] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqDraft, setFaqDraft] = useState<Faq>({ question: '', answer: '' });
  const [faqBusy, setFaqBusy] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
      if (!business) return;

      const [profileRes, faqsRes] = await Promise.all([
        fetch('/api/teach/business-profile').then((r) => r.json()),
        fetch('/api/teach/faqs').then((r) => r.json())
      ]);
      if (profileRes.profile) {
        setDescription(profileRes.profile.description ?? '');
        setAddress(profileRes.profile.address ?? '');
        setPoliciesText(profileRes.profile.policies_text ?? '');
      }
      setFaqs(faqsRes.faqs?.map((f: any) => ({ id: f.id, question: f.question, answer: f.answer })) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMsg(null);
    const res = await fetch('/api/teach/business-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, address, policiesText })
    });
    const data = await res.json();
    setProfileSaving(false);
    setProfileMsg(data.knowledgeSynced ? 'Saved — searchable on the next call.' : data.error ?? 'Saved.');
    onChanged?.();
  }

  async function saveFaq(faq: Faq, index?: number) {
    if (!faq.question.trim() || !faq.answer.trim()) return;
    setFaqBusy(true);
    const res = await fetch('/api/teach/faqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: faq.id, question: faq.question, answer: faq.answer })
    });
    const data = await res.json();
    setFaqBusy(false);
    if (!res.ok) return;
    if (index === undefined) {
      setFaqs((f) => [...f, { ...faq, id: data.id }]);
      setFaqDraft({ question: '', answer: '' });
    } else {
      setFaqs((f) => f.map((existing, i) => (i === index ? { ...existing, id: data.id } : existing)));
    }
    onChanged?.();
  }

  async function deleteFaq(id: string | undefined, index: number) {
    if (id) await fetch('/api/teach/faqs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setFaqs((f) => f.filter((_, i) => i !== index));
    onChanged?.();
  }

  if (loading) return <div className="text-bp-ink-muted" style={{ fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', marginBottom: 6 }}>Business description</label>
        <textarea className="input" rows={3} placeholder="What you do, what makes you different…" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', margin: '10px 0 6px' }}>Location</label>
        <input className="input" placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', margin: '10px 0 6px' }}>Policies</label>
        <textarea className="input" rows={3} placeholder="Refunds, cancellations, warranties…" value={policiesText} onChange={(e) => setPoliciesText(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button className="btn-secondary" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save business profile'}</button>
          {profileMsg && <span className="text-bp-ink-muted" style={{ fontSize: 12 }}>{profileMsg}</span>}
        </div>
      </div>

      <div>
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', marginBottom: 6 }}>Opening hours</label>
        <OpeningHoursPanel onChanged={onChanged} />
      </div>

      <div>
        <label className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, display: 'block', marginBottom: 6 }}>Frequently asked questions</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {faqs.map((f, i) => (
            <div key={f.id ?? i} className="border border-bp-border" style={{ borderRadius: 10, padding: 10 }}>
              <input className="input" style={{ marginBottom: 6 }} value={f.question} onChange={(e) => setFaqs((list) => list.map((x, xi) => (xi === i ? { ...x, question: e.target.value } : x)))} />
              <textarea className="input" rows={2} value={f.answer} onChange={(e) => setFaqs((list) => list.map((x, xi) => (xi === i ? { ...x, answer: e.target.value } : x)))} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn-secondary text-xs" onClick={() => saveFaq(f, i)} disabled={faqBusy}>Save</button>
                <button className="text-xs text-danger" onClick={() => deleteFaq(f.id, i)} disabled={faqBusy}>Delete</button>
              </div>
            </div>
          ))}
          <div className="border border-dashed border-bp-border-input" style={{ borderRadius: 10, padding: 10 }}>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Question customers ask" value={faqDraft.question} onChange={(e) => setFaqDraft((d) => ({ ...d, question: e.target.value }))} />
            <textarea className="input" rows={2} placeholder="How Ava should answer" value={faqDraft.answer} onChange={(e) => setFaqDraft((d) => ({ ...d, answer: e.target.value }))} />
            <button className="btn-secondary text-xs" style={{ marginTop: 6 }} onClick={() => saveFaq(faqDraft)} disabled={faqBusy || !faqDraft.question.trim() || !faqDraft.answer.trim()}>
              + Add question
            </button>
          </div>
        </div>
      </div>

      <div className="border border-bp-border" style={{ borderRadius: 10, padding: '12px 14px' }}>
        <div className="text-bp-ink-mid" style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8 }}>Managed elsewhere, linked here so nothing is duplicated</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <a href={isRestaurant ? '/menu' : '/train-ai'} className="text-bp-accent">{isRestaurant ? 'Menu →' : 'Services and pricing →'}</a>
          {isRestaurant && <a href="/restaurant-settings" className="text-bp-accent">Pickup, delivery, and payment rules →</a>}
          <a href="/phone" className="text-bp-accent">When to transfer to a person →</a>
        </div>
      </div>
    </div>
  );
}

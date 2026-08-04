'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type WebsiteDoc = {
  id: string;
  file_name: string;
  storage_path: string;
  status: string;
  pages_imported: number | null;
  error_message: string | null;
  created_at: string;
};

/**
 * "Import from your website" — shared between onboarding's Teach-her step
 * and the permanent /teach page. Reads/writes the same businesses.website
 * column and the same knowledge_documents row (doc_type 'website') either
 * surface uses, so a re-import from /teach shows up immediately if the
 * owner goes back through onboarding, and vice versa.
 */
export default function WebsiteImportPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const supabase = supabaseBrowser();
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [doc, setDoc] = useState<WebsiteDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: business } = await supabase.from('businesses').select('id, website').eq('owner_user_id', user.id).single();
    if (!business) return;
    setWebsiteUrl(business.website ?? '');
    const { data: websiteDoc } = await supabase
      .from('knowledge_documents')
      .select('id, file_name, storage_path, status, pages_imported, error_message, created_at')
      .eq('business_id', business.id)
      .eq('doc_type', 'website')
      .maybeSingle();
    setDoc(websiteDoc ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runImport() {
    if (!websiteUrl.trim()) return;
    setImporting(true);
    setMessage(null);
    const res = await fetch('/api/knowledge/import-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: websiteUrl.trim() })
    });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? 'Could not import that website.' });
      await load();
      return;
    }
    setMessage({ ok: true, text: `Read ${data.pagesFetched} page${data.pagesFetched === 1 ? '' : 's'} and added it to the knowledge base.` });
    await load();
    onChanged?.();
  }

  if (loading) return <div className="text-bp-ink-muted" style={{ fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="text-bp-ink-muted" style={{ fontSize: 13 }}>
        Reads your site (plus a few linked pages like About, Menu, Hours, or FAQ) so questions can be answered from it during a call.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" placeholder="https://yourbusiness.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
        <button className="btn-secondary shrink-0" onClick={runImport} disabled={importing || !websiteUrl.trim()}>
          {importing ? 'Reading…' : doc ? 'Re-import' : 'Import from website'}
        </button>
      </div>

      {message && (
        <div className={message.ok ? 'text-sm text-success bg-green-50 rounded-lg px-3 py-2' : 'text-sm text-danger bg-red-50 rounded-lg px-3 py-2'}>
          {message.text}
        </div>
      )}

      {doc && (
        <div className="border border-bp-border" style={{ borderRadius: 10, padding: '11px 13px', fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }}
              className={doc.status === 'ready' ? 'text-bp-good-ink bg-bp-good-bg' : doc.status === 'failed' ? 'text-bp-warn-ink bg-bp-warn-bg' : 'text-bp-mute-ink bg-bp-mute-bg'}
            >
              {doc.status === 'ready' ? 'Imported' : doc.status === 'failed' ? 'Failed' : 'Processing'}
            </span>
            <span className="text-bp-ink-muted">{doc.storage_path}</span>
          </div>
          <div className="text-bp-ink-faint" style={{ marginTop: 4 }}>
            {doc.status === 'ready' && doc.pages_imported !== null && `${doc.pages_imported} page${doc.pages_imported === 1 ? '' : 's'} imported`}
            {doc.status === 'failed' && (doc.error_message ?? 'The last import failed.')}
            {' · '}Last run {new Date(doc.created_at).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

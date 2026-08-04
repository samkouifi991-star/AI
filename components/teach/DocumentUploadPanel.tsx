'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Doc = { id: string; file_name: string; status: string; created_at: string };

/**
 * "Add a document" dropzone — shared between onboarding's Teach-her step
 * and /teach's Files and sources tab. Same Storage bucket, same
 * knowledge_documents insert, same /api/knowledge/ingest call either
 * surface uses, so a document uploaded during onboarding shows up in
 * /teach's list and vice versa.
 */
export default function DocumentUploadPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(bizId: string) {
    const { data } = await supabase
      .from('knowledge_documents')
      .select('id, file_name, status, created_at')
      .eq('business_id', bizId)
      .not('doc_type', 'in', '(website,teach_ava_answers,business_profile,faqs)')
      .order('created_at', { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => {
    supabase
      .auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return;
        const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
        if (!business) return;
        setBusinessId(business.id);
        await load(business.id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    setUploading(true);
    setError(null);

    const path = `${businessId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('knowledge-documents').upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({ business_id: businessId, file_name: file.name, storage_path: path, doc_type: 'other', status: 'processing' })
      .select()
      .single();
    if (insertError || !doc) {
      setError(insertError?.message ?? 'Failed to save document record.');
      setUploading(false);
      return;
    }

    await fetch('/api/knowledge/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id })
    });

    await load(businessId);
    setUploading(false);
    e.target.value = '';
    onChanged?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label
        className="border-bp-border-input bg-bp-surface-alt"
        style={{ display: 'block', border: '2px dashed', borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 13.5 }}>{uploading ? 'Uploading…' : 'Add a document she should know'}</div>
        <div className="text-bp-ink-faint" style={{ fontSize: 12, marginTop: 4 }}>Policies, price sheets, warranties — PDF, Word or text</div>
        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {docs.length > 0 && (
        <div className="border border-bp-border" style={{ borderRadius: 10, overflow: 'hidden' }}>
          {docs.map((d, i) => (
            <div key={d.id} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{d.file_name}</span>
              <span
                style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}
                className={d.status === 'ready' ? 'text-bp-good-ink bg-bp-good-bg' : d.status === 'failed' ? 'text-bp-warn-ink bg-bp-warn-bg' : 'text-bp-mute-ink bg-bp-mute-bg'}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

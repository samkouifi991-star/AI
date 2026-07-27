'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Doc = { id: string; file_name: string; status: string; created_at: string };

export default function KnowledgeBasePage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(bizId: string) {
    const { data } = await supabase
      .from('knowledge_documents')
      .select('id, file_name, status, created_at')
      .eq('business_id', bizId)
      .order('created_at', { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();
      if (business) {
        setBusinessId(business.id);
        refresh(business.id);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

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
      .insert({
        business_id: businessId,
        file_name: file.name,
        storage_path: path,
        doc_type: 'other',
        status: 'processing'
      })
      .select()
      .single();

    if (insertError || !doc) {
      setError(insertError?.message ?? 'Failed to save document record.');
      setUploading(false);
      return;
    }

    // Kick off chunking + embedding
    await fetch('/api/knowledge/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id })
    });

    await refresh(businessId);
    setUploading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Knowledge base</h1>
        <p className="text-slate-600 text-sm">
          Upload price sheets, policies, or service lists. Your AI will search these when answering calls.
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="card">
        <label className="block border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500">
          <span className="text-sm text-slate-600">
            {uploading ? 'Uploading and processing…' : 'Click to upload a PDF, .docx, or .txt file'}
          </span>
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.doc,.docx,.txt,.md" />
        </label>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Uploaded documents</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-600">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {docs.map((d) => (
              <div key={d.id} className="py-3 flex items-center justify-between">
                <span className="text-sm font-medium">{d.file_name}</span>
                <span
                  className={
                    d.status === 'ready' ? 'badge-success' : d.status === 'failed' ? 'badge-danger' : 'badge-warning'
                  }
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

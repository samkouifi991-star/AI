'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type DraftItem = {
  name: string;
  description?: string;
  base_price: number;
  sold_out?: boolean;
  sizes?: { label: string; price: number }[];
  modifier_groups?: {
    name: string;
    selection_type: 'single' | 'multi';
    required: boolean;
    options: { label: string; price_delta: number }[];
  }[];
};
type DraftCategory = { name: string; items: DraftItem[] };

const SOURCE_TYPES = [
  { key: 'url', label: 'Website URL' },
  { key: 'pdf', label: 'PDF' },
  { key: 'image', label: 'Image' },
  { key: 'docx', label: 'DOCX' },
  { key: 'csv', label: 'CSV' }
] as const;

/**
 * Turns the nested Supabase query result (menu_categories -> menu_items ->
 * menu_item_sizes / menu_modifier_groups -> menu_modifier_options) into the
 * same DraftCategory[] shape the review UI and /api/menu/publish already
 * use. Sorting is done client-side on sort_order since Supabase doesn't
 * guarantee nested-relation order across multiple levels in one query.
 */
function rowsToDraft(rows: any[]): DraftCategory[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((cat) => ({
      name: cat.name,
      items: [...(cat.menu_items ?? [])]
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((item: any) => ({
          name: item.name,
          description: item.description ?? undefined,
          base_price: Number(item.base_price),
          sold_out: item.sold_out,
          sizes: (item.menu_item_sizes ?? [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((s: any) => ({ label: s.label, price: Number(s.price) })),
          modifier_groups: (item.menu_modifier_groups ?? []).map((g: any) => ({
            name: g.name,
            selection_type: g.selection_type,
            required: g.required,
            options: (g.menu_modifier_options ?? [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((o: any) => ({ label: o.label, price_delta: Number(o.price_delta) }))
          }))
        }))
    }));
}

export default function MenuPage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [menuLoading, setMenuLoading] = useState(true);
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState<(typeof SOURCE_TYPES)[number]['key']>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [categories, setCategories] = useState<DraftCategory[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  // Fetches whatever is actually published in the database right now, for
  // this business only (filtered by business_id — RLS also independently
  // restricts this to the authenticated owner's own rows). Used both on
  // page load and again right after a successful publish, so the UI is
  // always showing what's really persisted, not just local edit state.
  const fetchPublishedMenu = useCallback(
    async (bizId: string) => {
      const { data, error } = await supabase
        .from('menu_categories')
        .select(
          `id, name, sort_order,
           menu_items (
             id, name, description, base_price, sold_out, sort_order,
             menu_item_sizes ( label, price, sort_order ),
             menu_modifier_groups (
               name, selection_type, required,
               menu_modifier_options ( label, price_delta, sort_order )
             )
           )`
        )
        .eq('business_id', bizId);

      if (error) throw new Error(error.message);
      return rowsToDraft(data ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    async function load() {
      setMenuLoading(true);
      setMenuLoadError(null);
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        const { data: business, error: bizError } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_user_id', user.id)
          .single();
        if (bizError || !business) throw new Error('Could not load your business.');

        setBusinessId(business.id);

        const draft = await fetchPublishedMenu(business.id);
        if (draft.length > 0) setCategories(draft);
      } catch (err: any) {
        setMenuLoadError(err.message ?? 'Could not load your menu.');
      } finally {
        setMenuLoading(false);
      }
    }
    load();
  }, [supabase, fetchPublishedMenu]);

  async function runImport() {
    if (!businessId) return;
    setImporting(true);
    setImportError(null);
    setPublished(false);

    try {
      let sourceRef = url;

      if (sourceType !== 'url') {
        if (!file) throw new Error('Choose a file first.');
        const path = `${businessId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('menu-uploads').upload(path, file);
        if (uploadError) throw new Error(uploadError.message);
        sourceRef = path;
      } else if (!url) {
        throw new Error('Enter a website URL first.');
      }

      const res = await fetch('/api/menu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, sourceType, sourceRef })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');

      setJobId(data.jobId);
      setCategories(data.categories);
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function updateItem(catIdx: number, itemIdx: number, field: keyof DraftItem, value: any) {
    setCategories((cats) => {
      if (!cats) return cats;
      const next = [...cats];
      next[catIdx] = { ...next[catIdx], items: [...next[catIdx].items] };
      next[catIdx].items[itemIdx] = { ...next[catIdx].items[itemIdx], [field]: value };
      return next;
    });
  }

  function removeItem(catIdx: number, itemIdx: number) {
    setCategories((cats) => {
      if (!cats) return cats;
      const next = [...cats];
      next[catIdx] = { ...next[catIdx], items: next[catIdx].items.filter((_, i) => i !== itemIdx) };
      return next;
    });
  }

  function addItem(catIdx: number) {
    setCategories((cats) => {
      if (!cats) return cats;
      const next = [...cats];
      next[catIdx] = { ...next[catIdx], items: [...next[catIdx].items, { name: 'New item', base_price: 0 }] };
      return next;
    });
  }

  function addCategory() {
    setCategories((cats) => [...(cats ?? []), { name: 'New category', items: [] }]);
  }

  async function publish() {
    if (!businessId || !categories) return;
    setPublishing(true);
    setImportError(null);
    try {
      const res = await fetch('/api/menu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, categories, jobId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Publish failed');

      // Don't trust local edit state as "what's live" — re-read the
      // database record that was just written, the same way a fresh page
      // load would, so this is a true persistence round-trip, not an
      // assumption.
      const confirmed = await fetchPublishedMenu(businessId);
      setCategories(confirmed);
      setPublished(true);
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Menu</h1>
        <p className="text-slate-600 text-sm">
          Import your menu, review and correct it, then publish. Your AI uses exactly what you publish here.
        </p>
      </div>

      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Import menu</h2>
        <p className="text-xs text-slate-500 mb-3">
          Already have a published menu? You don&apos;t need to re-import to edit it — just scroll down.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {SOURCE_TYPES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={sourceType === s.key ? 'btn-primary text-xs px-3 py-1.5' : 'btn-secondary text-xs px-3 py-1.5'}
              onClick={() => setSourceType(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {sourceType === 'url' ? (
          <input className="input mb-3" placeholder="https://your-restaurant.com/menu" value={url} onChange={(e) => setUrl(e.target.value)} />
        ) : (
          <input
            type="file"
            className="mb-3"
            accept={sourceType === 'pdf' ? '.pdf' : sourceType === 'image' ? 'image/*' : sourceType === 'docx' ? '.docx' : '.csv'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}

        {importError && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-3">{importError}</div>}

        <button className="btn-primary" onClick={runImport} disabled={importing || !businessId}>
          {importing ? 'Importing…' : 'Import menu'}
        </button>
      </section>

      {menuLoading && (
        <section className="card text-sm text-slate-500">Loading your menu…</section>
      )}

      {!menuLoading && menuLoadError && (
        <section className="card">
          <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{menuLoadError}</div>
        </section>
      )}

      {!menuLoading && !menuLoadError && !categories && (
        <section className="card text-sm text-slate-500">
          No menu published yet — import one above to get started.
        </section>
      )}

      {!menuLoading && categories && (
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">Review and edit</h2>
            <span className="text-xs text-slate-500">Nothing changes for your AI until you publish</span>
          </div>

          {published && (
            <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2 mb-4">
              Menu published and confirmed saved — your AI will use it on the next call.
            </div>
          )}

          {categories.length === 0 && (
            <p className="text-sm text-slate-500 mb-4">This category list is empty — add a category to get started.</p>
          )}

          <div className="space-y-6">
            {categories.map((cat, catIdx) => (
              <div key={catIdx}>
                <input
                  className="input font-medium mb-2 max-w-xs"
                  value={cat.name}
                  onChange={(e) =>
                    setCategories((cats) => {
                      if (!cats) return cats;
                      const next = [...cats];
                      next[catIdx] = { ...next[catIdx], name: e.target.value };
                      return next;
                    })
                  }
                />
                <div className="space-y-2">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="border border-slate-200 rounded-lg p-3 grid sm:grid-cols-5 gap-2 items-center">
                      <input
                        className="input sm:col-span-2"
                        value={item.name}
                        onChange={(e) => updateItem(catIdx, itemIdx, 'name', e.target.value)}
                      />
                      <input
                        className="input"
                        value={item.description ?? ''}
                        placeholder="Description"
                        onChange={(e) => updateItem(catIdx, itemIdx, 'description', e.target.value)}
                      />
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        value={item.base_price}
                        onChange={(e) => updateItem(catIdx, itemIdx, 'base_price', Number(e.target.value))}
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" checked={!!item.sold_out} onChange={(e) => updateItem(catIdx, itemIdx, 'sold_out', e.target.checked)} />
                          Sold out
                        </label>
                        <button type="button" className="text-xs text-danger" onClick={() => removeItem(catIdx, itemIdx)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-secondary text-xs mt-2" onClick={() => addItem(catIdx)}>
                  + Add item
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="btn-secondary text-sm mt-4" onClick={addCategory}>
            + Add category
          </button>

          <div className="mt-6">
            <button className="btn-primary" onClick={publish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish menu'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

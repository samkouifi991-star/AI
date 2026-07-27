import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { chunkText, embedBatch } from '@/lib/openai';
import { DraftMenuCategory } from '@/lib/menu-import';
import { logger } from '@/lib/logger';

/**
 * POST /api/menu/publish
 * Body: { businessId, categories: DraftMenuCategory[], jobId? }
 *
 * Replaces the business's live menu with the reviewed/edited categories —
 * the owner may have corrected extraction mistakes, added items, or
 * removed sold-out ones before calling this. Also re-embeds every item
 * into knowledge_chunks so get_business_knowledge (the same RAG path
 * already used for FAQs/policies) can answer natural-language questions
 * like "do you have gluten-free pizza?" without any separate menu-specific
 * answer logic.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { businessId, categories, jobId } = (await req.json()) as {
    businessId: string;
    categories: DraftMenuCategory[];
    jobId?: string;
  };

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_user_id, name')
    .eq('id', businessId)
    .single();
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    // Replace the live menu wholesale — cascades delete sizes/modifiers.
    await supabase.from('menu_categories').delete().eq('business_id', businessId);

    let sortOrder = 0;
    for (const cat of categories) {
      const { data: catRow, error: catError } = await supabase
        .from('menu_categories')
        .insert({ business_id: businessId, name: cat.name, sort_order: sortOrder++ })
        .select()
        .single();
      if (catError || !catRow) throw new Error(catError?.message ?? 'Failed to create category');

      let itemSortOrder = 0;
      for (const item of cat.items) {
        const { data: itemRow, error: itemError } = await supabase
          .from('menu_items')
          .insert({
            business_id: businessId,
            category_id: catRow.id,
            name: item.name,
            description: item.description ?? null,
            base_price: item.base_price ?? 0,
            sold_out: item.sold_out ?? false,
            sort_order: itemSortOrder++
          })
          .select()
          .single();
        if (itemError || !itemRow) throw new Error(itemError?.message ?? 'Failed to create item');

        if (item.sizes?.length) {
          await supabase.from('menu_item_sizes').insert(
            item.sizes.map((s, i) => ({ menu_item_id: itemRow.id, label: s.label, price: s.price, sort_order: i }))
          );
        }

        if (item.modifier_groups?.length) {
          for (const group of item.modifier_groups) {
            const { data: groupRow, error: groupError } = await supabase
              .from('menu_modifier_groups')
              .insert({
                menu_item_id: itemRow.id,
                name: group.name,
                selection_type: group.selection_type,
                required: group.required
              })
              .select()
              .single();
            if (groupError || !groupRow) throw new Error(groupError?.message ?? 'Failed to create modifier group');

            if (group.options?.length) {
              await supabase.from('menu_modifier_options').insert(
                group.options.map((o, i) => ({
                  group_id: groupRow.id,
                  label: o.label,
                  price_delta: o.price_delta,
                  sort_order: i
                }))
              );
            }
          }
        }
      }
    }

    // Re-embed the published menu into the knowledge base under a single
    // synthetic "document" per business, so republishing cleanly replaces
    // the previous menu's chunks rather than accumulating duplicates.
    const MENU_DOC_STORAGE_PATH = `__menu__/${businessId}`;
    let { data: menuDoc } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('business_id', businessId)
      .eq('storage_path', MENU_DOC_STORAGE_PATH)
      .single();

    if (!menuDoc) {
      const { data: created } = await supabase
        .from('knowledge_documents')
        .insert({
          business_id: businessId,
          file_name: 'Restaurant menu (auto-generated from Menu page)',
          storage_path: MENU_DOC_STORAGE_PATH,
          doc_type: 'menu',
          status: 'ready'
        })
        .select('id')
        .single();
      menuDoc = created;
    }

    if (menuDoc) {
      await supabase.from('knowledge_chunks').delete().eq('document_id', menuDoc.id);

      const menuText = categories
        .map((cat) => {
          const itemLines = cat.items
            .map((item) => {
              const sizes = item.sizes?.length ? ` Sizes: ${item.sizes.map((s) => `${s.label} $${s.price}`).join(', ')}.` : '';
              const mods = item.modifier_groups?.length
                ? ` Options: ${item.modifier_groups.map((g) => `${g.name} (${g.options.map((o) => o.label).join(', ')})`).join('; ')}.`
                : '';
              const soldOut = item.sold_out ? ' Currently sold out.' : '';
              return `${item.name} — $${item.base_price}. ${item.description ?? ''}${sizes}${mods}${soldOut}`;
            })
            .join('\n');
          return `${cat.name}:\n${itemLines}`;
        })
        .join('\n\n');

      const chunks = chunkText(menuText, 800, 100);
      if (chunks.length > 0) {
        const embeddings = await embedBatch(chunks);
        await supabase.from('knowledge_chunks').insert(
          chunks.map((content, i) => ({
            business_id: businessId,
            document_id: menuDoc!.id,
            content,
            embedding: embeddings[i]
          }))
        );
      }
    }

    if (jobId) {
      await supabase
        .from('menu_import_jobs')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    logger.error('menu_publish_failed', { businessId, message: err.message });
    return NextResponse.json({ error: err.message ?? 'Publish failed' }, { status: 500 });
  }
}

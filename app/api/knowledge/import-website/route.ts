import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { supabaseServer } from '@/lib/supabase/server';
import { chunkText, embedBatch } from '@/lib/openai';
import { logger } from '@/lib/logger';

const MAX_PAGES = 5;
const MAX_TOTAL_CHARS = 60000;
const FETCH_TIMEOUT_MS = 10000;
// Anchor text/href hints for which same-site pages are worth pulling in
// alongside the URL the owner actually entered — not a full site crawl,
// just the handful of pages a receptionist would actually need to know.
const RELEVANT_LINK_HINTS = ['about', 'menu', 'hour', 'faq', 'contact', 'service', 'location', 'price', 'policy'];

async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'BusinessPilotAI-KnowledgeImport/1.0' } });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, nav, footer').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text || null;
  } catch (err: any) {
    logger.warn('website_import_page_fetch_failed', { url, message: err.message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findRelevantLinks(baseUrl: string, html: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const found = new Set<string>();

  $('a[href]').each((_, el) => {
    if (found.size >= MAX_PAGES) return;
    const href = $(el).attr('href');
    const text = $(el).text().toLowerCase();
    if (!href) return;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (resolved.origin !== origin) return;
    resolved.hash = '';
    if (resolved.href === baseUrl) return;
    const haystack = `${href.toLowerCase()} ${text}`;
    if (RELEVANT_LINK_HINTS.some((hint) => haystack.includes(hint))) {
      found.add(resolved.href);
    }
  });

  return Array.from(found).slice(0, MAX_PAGES);
}

/**
 * Fetches the business's website (and a small number of same-site pages
 * whose links look like about/menu/hours/faq/contact) and ingests the
 * visible text through the same chunk+embed pipeline as an uploaded
 * document, so calls can be answered from it via RAG. This is a bounded,
 * best-effort import — a handful of relevant pages, not a full site crawl —
 * and reports back exactly how many pages it actually read, never a fake
 * "imported your whole site".
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'no business found' }, { status: 404 });

  const { url } = await req.json();
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'A website URL is required.' }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: 'That doesn’t look like a valid URL.' }, { status: 400 });
  }
  const normalizedUrl = parsedUrl.href;

  await supabase.from('businesses').update({ website: normalizedUrl }).eq('id', business.id);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let homeHtml: string;
  try {
    const res = await fetch(normalizedUrl, { signal: controller.signal, headers: { 'User-Agent': 'BusinessPilotAI-KnowledgeImport/1.0' } });
    if (!res.ok) return NextResponse.json({ error: `Could not reach that site (HTTP ${res.status}).` }, { status: 502 });
    homeHtml = await res.text();
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not reach that site. Check the URL and try again.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const $home = cheerio.load(homeHtml);
  $home('script, style, noscript, svg, nav, footer').remove();
  const homeText = $home('body').text().replace(/\s+/g, ' ').trim();

  const relevantLinks = findRelevantLinks(normalizedUrl, homeHtml);
  const sections: { url: string; text: string }[] = [{ url: normalizedUrl, text: homeText }];

  for (const link of relevantLinks) {
    if (sections.reduce((n, s) => n + s.text.length, 0) >= MAX_TOTAL_CHARS) break;
    const text = await fetchPageText(link);
    if (text) sections.push({ url: link, text });
  }

  const combinedText = sections
    .map((s) => `Source: ${s.url}\n${s.text}`)
    .join('\n\n')
    .slice(0, MAX_TOTAL_CHARS);

  if (!combinedText.trim()) {
    return NextResponse.json({ error: 'Could not read any text from that site.' }, { status: 502 });
  }

  const { data: doc, error: docError } = await supabase
    .from('knowledge_documents')
    .insert({
      business_id: business.id,
      file_name: parsedUrl.hostname,
      storage_path: normalizedUrl,
      doc_type: 'website',
      status: 'processing'
    })
    .select()
    .single();
  if (docError || !doc) return NextResponse.json({ error: docError?.message ?? 'Could not save the import record.' }, { status: 500 });

  try {
    const chunks = chunkText(combinedText);
    const embeddings = await embedBatch(chunks);
    const rows = chunks.map((content, i) => ({
      business_id: business.id,
      document_id: doc.id,
      content,
      embedding: embeddings[i]
    }));
    const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);
    if (insertError) throw new Error(insertError.message);

    await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', doc.id);
    return NextResponse.json({ ok: true, pagesFetched: sections.length, chunkCount: rows.length, documentId: doc.id });
  } catch (err: any) {
    await supabase.from('knowledge_documents').update({ status: 'failed' }).eq('id', doc.id);
    logger.error('website_import_ingest_failed', { businessId: business.id, message: err.message });
    return NextResponse.json({ error: 'Read the site but could not process it into your knowledge base.' }, { status: 500 });
  }
}

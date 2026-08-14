import { supabaseServiceRole } from './supabase/admin';
import { embedText } from './openai';
import { groupBusinessHours, formatHoursText, formatSpecialHoursText } from './hours';

/**
 * Rebuilds the single "Business profile" knowledge chunk from
 * businesses.description/address/policies_text + business_hours —
 * real, structured facts an owner edits in /teach's Business knowledge
 * tab (and during onboarding's Teach-her step, via the same shared
 * component), searchable by get_business_knowledge on real calls exactly
 * like an uploaded document. Never touches the system prompt — knowledge
 * stays retrieval-only, per this app's existing tool-based-knowledge rule.
 * Idempotent: reuses one synthetic document + chunk, like the
 * "Answers from Teach Ava" pattern in /api/teach.
 */
export async function syncBusinessProfileChunk(businessId: string): Promise<void> {
  const supabase = supabaseServiceRole();

  const todayIso = new Date().toISOString().slice(0, 10);
  const [{ data: business }, { data: hoursRows }, { data: specialRows }] = await Promise.all([
    supabase.from('businesses').select('name, description, address, policies_text, service_area, timezone').eq('id', businessId).single(),
    supabase.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', businessId).order('day_of_week'),
    // Only upcoming exceptions matter for what Ava should say — past
    // closures aren't relevant knowledge for a future caller.
    supabase.from('special_hours').select('date, is_closed, open_time, close_time, note').eq('business_id', businessId).gte('date', todayIso).order('date')
  ]);
  if (!business) return;

  const groupedDays = hoursRows ? groupBusinessHours(hoursRows) : [];
  const hasAnyOpenDay = groupedDays.some((d) => !d.isClosed);

  const sections = [
    business.description ? `About ${business.name}: ${business.description}` : null,
    business.address ? `Location: ${business.address}` : null,
    business.service_area ? `Service area: ${business.service_area}` : null,
    hasAnyOpenDay ? `Hours (${business.timezone ?? 'local time'}):\n${formatHoursText(groupedDays)}` : null,
    specialRows && specialRows.length > 0 ? `Upcoming exceptions to normal hours:\n${formatSpecialHoursText(specialRows)}` : null,
    business.policies_text ? `Policies: ${business.policies_text}` : null
  ].filter(Boolean);

  let { data: doc } = await supabase
    .from('knowledge_documents')
    .select('id')
    .eq('business_id', businessId)
    .eq('doc_type', 'business_profile')
    .maybeSingle();

  // Nothing real to say yet — remove any stale chunk rather than leave a
  // near-empty one lying around, but keep the document row so future
  // saves have somewhere to attach to.
  if (sections.length === 0) {
    if (doc) await supabase.from('knowledge_chunks').delete().eq('document_id', doc.id);
    return;
  }

  if (!doc) {
    const { data: created } = await supabase
      .from('knowledge_documents')
      .insert({ business_id: businessId, file_name: 'Business profile', storage_path: '', doc_type: 'business_profile', status: 'ready' })
      .select('id')
      .single();
    doc = created ?? null;
  }
  if (!doc) return;

  const content = sections.join('\n\n');
  const embedding = await embedText(content);

  const { data: existingChunk } = await supabase.from('knowledge_chunks').select('id').eq('document_id', doc.id).maybeSingle();
  if (existingChunk) {
    await supabase.from('knowledge_chunks').update({ content, embedding }).eq('id', existingChunk.id);
  } else {
    await supabase.from('knowledge_chunks').insert({ business_id: businessId, document_id: doc.id, content, embedding });
  }
}

/**
 * Embeds (or re-embeds) one FAQ as its own searchable knowledge chunk,
 * linked via source_faq_id (migration 0018) so editing the FAQ updates
 * the same chunk in place rather than creating a duplicate.
 */
export async function syncFaqChunk(businessId: string, faqId: string, question: string, answer: string): Promise<void> {
  const supabase = supabaseServiceRole();

  let { data: doc } = await supabase.from('knowledge_documents').select('id').eq('business_id', businessId).eq('doc_type', 'faqs').maybeSingle();
  if (!doc) {
    const { data: created } = await supabase
      .from('knowledge_documents')
      .insert({ business_id: businessId, file_name: 'FAQs', storage_path: '', doc_type: 'faqs', status: 'ready' })
      .select('id')
      .single();
    doc = created ?? null;
  }
  if (!doc) return;

  const content = `Q: ${question}\nA: ${answer}`;
  const embedding = await embedText(content);

  const { data: existingChunk } = await supabase.from('knowledge_chunks').select('id').eq('source_faq_id', faqId).maybeSingle();
  if (existingChunk) {
    await supabase.from('knowledge_chunks').update({ content, embedding }).eq('id', existingChunk.id);
  } else {
    await supabase.from('knowledge_chunks').insert({ business_id: businessId, document_id: doc.id, source_faq_id: faqId, content, embedding });
  }
}

export async function deleteFaqChunk(faqId: string): Promise<void> {
  const supabase = supabaseServiceRole();
  await supabase.from('knowledge_chunks').delete().eq('source_faq_id', faqId);
}

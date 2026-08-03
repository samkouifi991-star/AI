import { getOpenAI } from './openai';

/**
 * Drafts a suggested answer for a knowledge gap — never auto-saved,
 * always a starting point the owner reviews, edits, and approves (or
 * rejects) in /teach before it becomes part of the real knowledge base.
 * Grounded only in the business's own retrieved context (the weakly-
 * matching chunks for a low-confidence gap); when there's no real basis
 * to suggest from, returns basedOnContext:false and the UI must say so
 * plainly rather than presenting a guess as a real suggestion.
 */
export async function suggestGapAnswer(params: {
  businessName: string;
  businessType: string;
  question: string;
  contextChunks: string[];
}): Promise<{ suggestion: string | null; basedOnContext: boolean }> {
  const hasContext = params.contextChunks.length > 0;
  const context = hasContext ? params.contextChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n') : '(nothing relevant found)';

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          `You are helping the owner of ${params.businessName} (a ${params.businessType}) draft an answer their AI ` +
          'receptionist should give from now on to a question it could not answer on a real call. You may only use ' +
          "the provided context below — if it doesn't actually contain enough to answer, respond with exactly the " +
          "single word NONE (do not guess, do not invent typical answers for this kind of business). Otherwise, " +
          'respond with a short, natural sentence the receptionist could speak to a caller, and nothing else — no ' +
          'preamble, no quotes.'
      },
      { role: 'user', content: `Context:\n${context}\n\nQuestion the caller asked: ${params.question}` }
    ]
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!raw || raw.toUpperCase() === 'NONE') {
    return { suggestion: null, basedOnContext: false };
  }
  return { suggestion: raw, basedOnContext: hasContext };
}

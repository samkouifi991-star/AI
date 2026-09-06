import OpenAI from 'openai';
import { withRetry } from './provider-retry';

let cachedClient: OpenAI | null = null;

/**
 * Lazily-constructed OpenAI client, reused across requests in the same
 * server process. Must be called only at request runtime (inside a route
 * handler or a function invoked from one) — never at module scope, or
 * Next.js will try to construct it while collecting page data at build
 * time, when OPENAI_API_KEY may not be set, and fail the build.
 */
export function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export async function embedText(text: string): Promise<number[]> {
  const res = await withRetry('openai', 'embed_text', () =>
    getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // guard against oversized chunks
    })
  );
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await withRetry('openai', 'embed_batch', () =>
    getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.map((t) => t.slice(0, 8000))
    })
  );
  return res.data.map((d) => d.embedding);
}

// Splits raw document text into overlapping ~800 char chunks for embedding.
export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

// Used when the AI needs to answer a question in the business's voice,
// grounded strictly in retrieved knowledge-base chunks. Returns a genuine
// confidence signal (not a guess based on sniffing the reply text for
// phrases like "not sure") so callers can tell a real answer apart from a
// fallback — the model is required to prefix its own output with a
// CONFIDENT/UNSURE verdict, which is parsed rather than inferred.
export async function answerFromKnowledge(
  question: string,
  contextChunks: string[]
): Promise<{ answer: string; confident: boolean }> {
  const context = contextChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');
  const completion = await withRetry('openai', 'answer_from_knowledge', () =>
    getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            "You are a business's phone receptionist. Answer ONLY using the provided context — never invent " +
            'prices, policies, or availability. Respond in exactly this format: the first line must be either ' +
            'the single word CONFIDENT or the single word UNSURE, then a blank line, then your reply to the ' +
            "customer. Use UNSURE if the provided context does not actually contain the answer — don't guess, " +
            'and word your reply as not having that information on hand rather than answering anyway.'
        },
        { role: 'user', content: `Context:\n${context}\n\nCustomer question: ${question}` }
      ]
    })
  );

  const raw = completion.choices[0].message.content ?? '';
  const match = raw.match(/^\s*(CONFIDENT|UNSURE)\s*\n+([\s\S]*)$/i);
  if (!match) {
    // Model didn't follow the format — treat as unsure rather than assume
    // confidence we can't actually verify.
    return { answer: raw.trim(), confident: false };
  }
  return { answer: match[2].trim(), confident: match[1].toUpperCase() === 'CONFIDENT' };
}

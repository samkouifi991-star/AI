import { getOpenAI } from './openai';

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'ru', label: 'Russian' }
];

export interface LanguageDetectionResult {
  languageCode: string;   // ISO 639-1, restricted to SUPPORTED_LANGUAGES
  confidence: number;     // 0–1
}

/**
 * Detects the language of a short utterance, constrained to the business's
 * enabled languages so the model isn't guessing at codes we can't act on.
 */
export async function detectLanguage(
  utterance: string,
  candidateCodes: string[]
): Promise<LanguageDetectionResult> {
  const candidates = candidateCodes.length ? candidateCodes : SUPPORTED_LANGUAGES.map((l) => l.code);

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          `Identify the language of the customer's utterance. Respond with strict JSON: ` +
          `{"language_code": string, "confidence": number}. language_code must be one of: ` +
          `${candidates.join(', ')}. If uncertain, pick the closest match and lower confidence.`
      },
      { role: 'user', content: utterance }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
  return {
    languageCode: candidates.includes(parsed.language_code) ? parsed.language_code : candidates[0],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
  };
}

/**
 * Translates a knowledge-base answer (or any AI response) into the target
 * language. Used so the business can maintain a single knowledge base in
 * one language while still serving callers in whatever language they used.
 */
export async function translateText(text: string, targetLanguageCode: string): Promise<string> {
  if (targetLanguageCode === 'en') return text; // knowledge base is authored in English by convention

  const label = SUPPORTED_LANGUAGES.find((l) => l.code === targetLanguageCode)?.label ?? targetLanguageCode;

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          `Translate the following text into ${label}. Preserve tone, meaning, and any prices or ` +
          `numbers exactly. Respond with only the translation, no notes.`
      },
      { role: 'user', content: text }
    ]
  });

  return completion.choices[0].message.content ?? text;
}

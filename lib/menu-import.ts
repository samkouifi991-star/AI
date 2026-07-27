import { getOpenAI } from './openai';

export interface DraftMenuItem {
  name: string;
  description?: string;
  base_price: number;
  sizes?: { label: string; price: number }[];
  modifier_groups?: {
    name: string;
    selection_type: 'single' | 'multi';
    required: boolean;
    options: { label: string; price_delta: number }[];
  }[];
  sold_out?: boolean;
}

export interface DraftMenuCategory {
  name: string;
  items: DraftMenuItem[];
}

const EXTRACTION_SYSTEM_PROMPT = `You extract restaurant menu data from raw text (scraped from a website, or
converted from a PDF/image/DOCX/CSV). Respond with ONLY strict JSON matching this shape,
no commentary:

{"categories": [{"name": string, "items": [{"name": string, "description": string,
"base_price": number, "sizes": [{"label": string, "price": number}],
"modifier_groups": [{"name": string, "selection_type": "single"|"multi", "required": boolean,
"options": [{"label": string, "price_delta": number}]}] }]}]}

Rules:
- base_price is the item's default/smallest price. If the source lists sizes with
  separate prices, put those in "sizes" and set base_price to the lowest one.
- Only include modifier_groups if the source text actually describes toppings, add-ons,
  or choices for that item — do not invent typical options.
- If a price can't be determined, use 0 rather than guessing.
- Omit "sizes" and "modifier_groups" entirely for items that don't have them (empty
  arrays are fine too).
- Group items under sensible categories (e.g. "Pizza", "Sides", "Drinks") based on
  how the source organizes them, or your best judgment if it doesn't.`;

/**
 * Sends raw extracted text (from any source) to OpenAI for structured
 * extraction into the draft menu shape. This is the shared final step for
 * every import source below — real extraction, not a lookup table.
 */
export async function extractMenuFromText(rawText: string): Promise<DraftMenuCategory[]> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: rawText.slice(0, 24000) } // guard against oversized menus
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{"categories":[]}');
  return parsed.categories ?? [];
}

/** Fetches a restaurant's website and strips it down to visible text for
 * extraction. A real production version should prefer a proper HTML-to-text
 * library (e.g. `html-to-text`) over this regex strip for menus with complex
 * layouts — this covers the common case of a mostly-text menu page. */
export async function extractFromUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'BusinessPilotAI-MenuImport/1.0' } });
  if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status}`);
  const html = await res.text();

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts text from a PDF buffer using pdf-parse. */
export async function extractFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text;
}

/** Extracts text from a DOCX buffer using mammoth. */
export async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** Parses a CSV menu export (columns: category, name, description, price,
 * ... ) into plain text the same extraction prompt can handle, so one
 * extraction path covers structured and unstructured sources alike. */
export function extractFromCsv(csvText: string): string {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  return lines.join('\n');
}

/** Extracts a menu directly from a photo of a physical menu using OpenAI's
 * vision input — real image understanding, not OCR bolted on afterward. */
export async function extractMenuFromImage(imageBase64: string, mimeType: string): Promise<DraftMenuCategory[]> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the menu from this image.' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ] as any
      }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{"categories":[]}');
  return parsed.categories ?? [];
}

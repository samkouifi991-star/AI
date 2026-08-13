// Translation is modeled as a pluggable provider so a second or third
// certified-translation vendor can be added later without touching the
// order workflow, the document checklist, or the checkout flow — every
// caller only ever talks to `getTranslationProvider()`.

export type TranslationOrderRequest = { sourceLanguage: string; pageCount: number }
export type TranslationQuote = { priceCents: number; etaBusinessDays: number }

export interface TranslationProvider {
  name: string
  quote(req: TranslationOrderRequest, pricing: { per_page_cents: number; rush_surcharge_cents: number }): TranslationQuote
}

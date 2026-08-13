import type { TranslationProvider } from '../types'

// The default in-house certified translator pool. A second vendor (e.g. a
// specialized rare-language partner) can be added as another file in this
// directory implementing the same interface and registered in ../index.ts.
export const standardProvider: TranslationProvider = {
  name: 'Smart USA Visa Certified Translators',
  quote(req, pricing) {
    const priceCents = req.pageCount * pricing.per_page_cents
    return { priceCents, etaBusinessDays: 3 }
  },
}

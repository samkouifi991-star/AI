import type { TranslationProvider } from './types'
import { standardProvider } from './providers/standard'

const REGISTRY: Record<string, TranslationProvider> = {
  standard: standardProvider,
}

export function getTranslationProvider(key: string = 'standard'): TranslationProvider {
  return REGISTRY[key] ?? standardProvider
}

export * from './types'

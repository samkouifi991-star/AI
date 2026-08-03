import { Instrument_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google';

// The dashboard redesign's three-typeface system — loaded here and scoped
// to the authenticated dashboard shell only (app/(dashboard)/layout.tsx),
// not the marketing site or auth pages, which keep their existing fonts
// until/unless the redesign is extended there too.
export const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-grotesk'
});

export const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument'
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains'
});

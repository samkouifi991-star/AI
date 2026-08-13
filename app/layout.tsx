import type { Metadata } from 'next'
import { inter, manrope } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'Smart USA Visa — Guided U.S. Immigration Document Preparation',
    template: '%s | Smart USA Visa',
  },
  description:
    'Answer simple questions and Smart USA Visa helps you prepare your immigration forms, a personalized document checklist, and filing instructions. Not a law firm. Not affiliated with USCIS.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  )
}

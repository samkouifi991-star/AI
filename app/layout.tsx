import type { Metadata } from 'next';
import './globals.css';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'Business Pilot AI — Your AI receptionist, booking, and payments',
    template: '%s | Business Pilot AI'
  },
  description:
    'Business Pilot AI answers your calls, books appointments, takes restaurant orders, and collects payments — in multiple languages, day or night.',
  openGraph: {
    title: 'Business Pilot AI',
    description:
      'Business Pilot AI answers your calls, books appointments, takes restaurant orders, and collects payments — in multiple languages, day or night.',
    url: appUrl,
    siteName: 'Business Pilot AI',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Business Pilot AI',
    description: 'Your business answers, sells, books, and takes payments — even when you cannot.'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-ink font-sans antialiased">{children}</body>
    </html>
  );
}

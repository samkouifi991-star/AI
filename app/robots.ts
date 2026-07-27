import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/onboarding', '/calls', '/conversations', '/leads', '/appointments', '/orders', '/menu', '/phone', '/settings', '/estimate-rules', '/knowledge-base', '/train-ai', '/teach', '/practice', '/calendar', '/invoices']
    },
    sitemap: `${appUrl}/sitemap.xml`
  };
}

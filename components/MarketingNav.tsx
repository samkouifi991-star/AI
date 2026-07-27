'use client';

import { useState } from 'react';
import Link from 'next/link';

const PRODUCT_LINKS = [
  { href: '/features#receptionist', label: 'AI Receptionist' },
  { href: '/features#service-businesses', label: 'Service Businesses' },
  { href: '/features#restaurants', label: 'Restaurants' },
  { href: '/features#phone', label: 'Phone Management' },
  { href: '/features#payments', label: 'Payments' },
  { href: '/features#integrations', label: 'Integrations' }
];

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' }
];

export default function MarketingNav() {
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold text-lg text-ink">
          <span className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm">BP</span>
          Business Pilot AI
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <div className="relative" onMouseEnter={() => setProductOpen(true)} onMouseLeave={() => setProductOpen(false)}>
            <button
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink rounded-lg"
              aria-expanded={productOpen}
              aria-haspopup="true"
              onClick={() => setProductOpen((o) => !o)}
            >
              Product
            </button>
            {productOpen && (
              <div className="absolute top-full left-0 bg-white border border-slate-200 rounded-xl shadow-lg py-2 w-64">
                {PRODUCT_LINKS.map((l) => (
                  <Link key={l.label} href={l.href} className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-ink">
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink rounded-lg">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link href="/login" className="btn-secondary text-sm">Login</Link>
          <Link href="/signup" className="btn-primary text-sm">Start Free</Link>
        </div>

        <button
          className="md:hidden p-2 text-slate-600"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 space-y-1">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1 pt-1">Product</div>
          {PRODUCT_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="block px-1 py-2 text-sm text-slate-600" onClick={() => setMobileOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div className="border-t border-slate-100 my-2" />
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block px-1 py-2 text-sm font-medium text-slate-700" onClick={() => setMobileOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-3">
            <Link href="/login" className="btn-secondary text-sm flex-1 text-center" onClick={() => setMobileOpen(false)}>Login</Link>
            <Link href="/signup" className="btn-primary text-sm flex-1 text-center" onClick={() => setMobileOpen(false)}>Start Free</Link>
          </div>
        </div>
      )}
    </header>
  );
}

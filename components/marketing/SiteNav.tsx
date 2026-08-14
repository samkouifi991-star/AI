'use client'

import Link from 'next/link'
import { useState } from 'react'

const serviceLinks = [
  { href: '/applications?goal=green-card', label: 'Green Card' },
  { href: '/applications?goal=citizenship', label: 'Citizenship' },
  { href: '/applications?goal=family', label: 'Family' },
  { href: '/applications?goal=work', label: 'Work' },
  { href: '/applications?goal=travel', label: 'Travel' },
  { href: '/applications', label: 'All Applications' },
]

export function SiteNav() {
  const [servicesOpen, setServicesOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold text-harbor-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-harbor-900 text-compass-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4Z" fill="currentColor" opacity="0.9" />
              <path d="m8 12 3 3 5-6" stroke="#0e242b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Smart USA Visa
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
              Services
            </button>
            {servicesOpen && (
              <div className="absolute left-0 top-full w-56 rounded-2xl border border-ink-100 bg-white p-2 shadow-card-hover">
                {serviceLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-xl px-3 py-2 text-sm text-ink-700 hover:bg-harbor-50 hover:text-harbor-800"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            How It Works
          </Link>
          <Link href="/pricing" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Pricing
          </Link>
          <Link href="/resources" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Resources
          </Link>
          <Link href="/faq" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            FAQ
          </Link>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/sign-in" className="text-sm font-semibold text-ink-700 hover:text-harbor-800">
            Sign In
          </Link>
          <Link href="/find-my-application" className="btn-primary">
            Start My Application
          </Link>
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-100 bg-white px-4 pb-4 lg:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {serviceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">
                {link.label}
              </Link>
            ))}
            <Link href="/how-it-works" className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">How It Works</Link>
            <Link href="/pricing" className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">Pricing</Link>
            <Link href="/resources" className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">Resources</Link>
            <Link href="/faq" className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">FAQ</Link>
            <Link href="/sign-in" className="rounded-lg px-3 py-2.5 text-ink-700 hover:bg-ink-50">Sign In</Link>
            <Link href="/find-my-application" className="btn-primary mt-2 justify-center">Start My Application</Link>
          </div>
        </div>
      )}
    </header>
  )
}

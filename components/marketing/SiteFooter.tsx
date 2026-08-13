import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-100 bg-ink-950 text-ink-300">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="font-heading text-lg font-bold text-white">Smart USA Visa</div>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            Guided, self-service immigration document preparation. Not a law firm.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Services</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/applications?goal=green-card" className="hover:text-white">Green Card</Link></li>
            <li><Link href="/applications?goal=citizenship" className="hover:text-white">Citizenship</Link></li>
            <li><Link href="/applications?goal=family" className="hover:text-white">Family Immigration</Link></li>
            <li><Link href="/applications?goal=work" className="hover:text-white">Work Authorization</Link></li>
            <li><Link href="/applications" className="hover:text-white">All Applications</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Company</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/how-it-works" className="hover:text-white">How It Works</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/support" className="hover:text-white">Support</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Legal</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/legal/terms" className="hover:text-white">Terms of Service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">Privacy Policy</Link></li>
            <li><Link href="/legal/refund-policy" className="hover:text-white">Refund Policy</Link></li>
            <li><Link href="/legal/disclaimer" className="hover:text-white">Disclaimer</Link></li>
            <li><Link href="/legal/accessibility" className="hover:text-white">Accessibility</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-ink-500 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Smart USA Visa. All rights reserved.</p>
          <p className="max-w-2xl">
            Smart USA Visa is a private company and is not affiliated with USCIS, DHS, the U.S. Department of State,
            or any U.S. government agency. We provide self-help document preparation services and do not provide
            legal advice, legal representation, or determine immigration eligibility.
          </p>
        </div>
      </div>
    </footer>
  )
}

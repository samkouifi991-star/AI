import Link from 'next/link';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 font-display font-semibold text-ink mb-3">
            <span className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs">BP</span>
            Business Pilot AI
          </div>
          <p className="text-sm text-slate-500">Your AI receptionist, booking, and payments — all in one place.</p>
        </div>

        <div>
          <div className="text-sm font-medium text-ink mb-3">Product</div>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><Link href="/features" className="hover:text-ink">Features</Link></li>
            <li><Link href="/features#service-businesses" className="hover:text-ink">Service Businesses</Link></li>
            <li><Link href="/features#restaurants" className="hover:text-ink">Restaurants</Link></li>
            <li><Link href="/features#phone" className="hover:text-ink">Phone Management</Link></li>
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-medium text-ink mb-3">Resources</div>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><Link href="/how-it-works" className="hover:text-ink">How It Works</Link></li>
            <li><Link href="/faq" className="hover:text-ink">FAQ</Link></li>
            <li><Link href="/contact" className="hover:text-ink">Contact</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-medium text-ink mb-3">Company</div>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-ink">Terms</Link></li>
            <li><Link href="/login" className="hover:text-ink">Login</Link></li>
            <li><Link href="/signup" className="hover:text-ink">Start Free</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 border-t border-slate-100 text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
        <span>© {new Date().getFullYear()} Business Pilot AI. All rights reserved.</span>
        {process.env.NEXT_PUBLIC_CONTACT_EMAIL && (
          <a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`} className="hover:text-ink">
            {process.env.NEXT_PUBLIC_CONTACT_EMAIL}
          </a>
        )}
      </div>
    </footer>
  );
}

import Link from 'next/link'
import { signOut } from '@/app/actions/auth'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="border-b border-ink-100 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-heading text-base font-bold text-harbor-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-harbor-900 text-compass-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4Z" fill="currentColor" opacity="0.9" />
                <path d="m8 12 3 3 5-6" stroke="#0e242b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Smart USA Visa
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-ink-600">
            <Link href="/dashboard" className="hover:text-harbor-800">Dashboard</Link>
            <Link href="/account" className="hover:text-harbor-800">Account</Link>
            <Link href="/support" className="hover:text-harbor-800">Support</Link>
            <form action={signOut}>
              <button type="submit" className="font-semibold text-ink-500 hover:text-harbor-800">Sign Out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container-page py-10">{children}</main>
    </div>
  )
}

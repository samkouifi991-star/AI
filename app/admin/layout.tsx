import Link from 'next/link'
import { requireStaff } from '@/lib/admin'
import { signOut } from '@/app/actions/auth'

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/applications', label: 'Applications' },
  { href: '/admin/templates', label: 'Templates & Questions' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/government-fees', label: 'Government Fees' },
  { href: '/admin/translations', label: 'Translations' },
  { href: '/admin/support', label: 'Support' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff()

  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="border-b border-ink-100 bg-ink-950 text-white">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-heading font-bold">Smart USA Visa — Admin</span>
            <span className="badge-neutral bg-ink-800 text-ink-200">{profile.role}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-ink-300 hover:text-white">Exit to site</Link>
            <form action={signOut}>
              <button type="submit" className="text-ink-300 hover:text-white">Sign Out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-white hover:shadow-card">
              {item.label}
            </Link>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  )
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import SignOutButton from './SignOutButton';

const SERVICE_NAV = [
  { href: '/onboarding', label: 'Set up Business Pilot AI' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/leads', label: 'Leads' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/train-ai', label: 'Train My AI' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
  { href: '/teach', label: 'Teach Ava' },
  { href: '/practice', label: 'Practice' },
  { href: '/phone-settings', label: 'Phone Settings' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/settings/voice-language', label: 'Voice & Language' },
  { href: '/phone', label: 'Phone Management' }
];

const RESTAURANT_NAV = [
  { href: '/onboarding', label: 'Set up Business Pilot AI' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/menu', label: 'Menu' },
  { href: '/orders', label: 'Orders' },
  { href: '/restaurant-settings', label: 'Restaurant Settings' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
  { href: '/teach', label: 'Teach Ava' },
  { href: '/practice', label: 'Practice' },
  { href: '/phone-settings', label: 'Phone Settings' },
  { href: '/settings/voice-language', label: 'Voice & Language' },
  { href: '/phone', label: 'Phone Management' }
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('business_type')
    .eq('owner_user_id', user.id)
    .single();

  const NAV = business?.business_type === 'restaurant' ? RESTAURANT_NAV : SERVICE_NAV;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-slate-200">
          <span className="font-display font-semibold text-lg">Business Pilot AI</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-ink"
          >
            Account Settings
          </Link>
        </nav>
        <div className="px-3 py-4 border-t border-slate-200 space-y-2">
          <span className="block px-3 py-1 text-xs text-slate-600 truncate">{user.email}</span>
          <SignOutButton className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-danger" />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

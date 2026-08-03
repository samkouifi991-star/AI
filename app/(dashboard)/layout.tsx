import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import DashboardSidebar from './DashboardSidebar';
import { grotesk, instrument, jetbrains } from '@/lib/fonts';

type NavItem = { href: string; label: string; external?: boolean };

const RESTAURANT_PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Today' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/orders', label: 'Orders' },
  { href: '/teach', label: 'Teach {ai}' },
  { href: '/practice', label: 'Practice' },
  { href: '/phone', label: 'Your phone' },
  { href: '/', label: 'Public website', external: true }
];

const SERVICE_PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Today' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/appointments', label: 'Bookings' },
  { href: '/teach', label: 'Teach {ai}' },
  { href: '/practice', label: 'Practice' },
  { href: '/phone', label: 'Your phone' },
  { href: '/', label: 'Public website', external: true }
];

// design_handoff_dashboard_redesign's nav is deliberately six-ish items —
// it does not delete the app's other dashboard routes, it stops listing
// them up top. They stay reachable here, under "More", rather than being
// silently dropped (per the handoff README's explicit instruction).
// /phone-settings is the one exception: it predates /phone and was already
// established as dead/superseded code earlier in this project, not a live
// route worth preserving.
const RESTAURANT_LEGACY: NavItem[] = [
  { href: '/menu', label: 'Menu' },
  { href: '/leads', label: 'Leads' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/restaurant-settings', label: 'Restaurant settings' },
  { href: '/knowledge-base', label: 'Knowledge base' },
  { href: '/train-ai', label: 'Train my AI' },
  { href: '/settings/voice-language', label: 'Voice & language' },
  { href: '/account', label: 'Account settings' }
];

const SERVICE_LEGACY: NavItem[] = [
  { href: '/leads', label: 'Leads' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/knowledge-base', label: 'Knowledge base' },
  { href: '/train-ai', label: 'Train my AI' },
  { href: '/settings/voice-language', label: 'Voice & language' },
  { href: '/account', label: 'Account settings' }
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id, business_type, is_live')
    .eq('owner_user_id', user.id)
    .single();

  const isRestaurant = business?.business_type === 'restaurant';
  const primaryNav = (isRestaurant ? RESTAURANT_PRIMARY : SERVICE_PRIMARY).map((item) =>
    item.href === '/teach' ? { ...item } : item
  );
  const legacyNav = isRestaurant ? RESTAURANT_LEGACY : SERVICE_LEGACY;

  let aiName = 'Ava';
  let dutyLine = 'No calls yet today';
  let openGapCount = 0;

  if (business) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [{ data: employeeSettings }, { count: callsToday }, { count: secondaryToday }, { count: gapCount }] = await Promise.all([
      supabase.from('ai_employee_settings').select('employee_name').eq('business_id', business.id).maybeSingle(),
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('started_at', startOfToday.toISOString()),
      isRestaurant
        ? supabase.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', startOfToday.toISOString())
        : supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', startOfToday.toISOString()),
      supabase.from('knowledge_gaps').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'open')
    ]);

    aiName = employeeSettings?.employee_name ?? 'Ava';
    openGapCount = gapCount ?? 0;

    const calls = callsToday ?? 0;
    const secondary = secondaryToday ?? 0;
    const secondaryLabel = isRestaurant ? 'orders' : 'bookings';
    dutyLine = calls === 0 && secondary === 0 ? 'No activity yet today' : `${calls} call${calls === 1 ? '' : 's'} · ${secondary} ${secondaryLabel} today`;
  }

  const primaryNavRendered = primaryNav.map((item) => ({ ...item, label: item.label.replace('{ai}', aiName) }));

  const ownerLabel = user.email ?? 'Account';
  const ownerInitial = (user.email ?? 'A').charAt(0).toUpperCase();
  const aiInitial = aiName.charAt(0).toUpperCase();

  return (
    <div className={`${grotesk.variable} ${instrument.variable} ${jetbrains.variable} bg-bp-bg`} style={{ minHeight: '100vh', display: 'flex' }}>
      <DashboardSidebar
        aiName={aiName}
        aiInitial={aiInitial}
        isOnDuty={!!business?.is_live}
        dutyLine={dutyLine}
        primaryNav={primaryNavRendered}
        teachHref="/teach"
        openGapCount={openGapCount}
        legacyNav={legacyNav}
        ownerLabel={ownerLabel}
        ownerInitial={ownerInitial}
      />
      <main className="font-instrument text-bp-ink" style={{ flex: 1, minWidth: 0, padding: '34px 40px 60px' }}>
        {children}
      </main>
    </div>
  );
}

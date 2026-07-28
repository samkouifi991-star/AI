'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/phone/numbers', label: 'Manage phone numbers' },
  { href: '/phone/routing', label: 'Call routing' },
  { href: '/phone/assistant', label: 'Assistant settings' },
  { href: '/phone/sms', label: 'SMS settings' },
  { href: '/phone/test-center', label: 'Test center' },
  { href: '/conversations', label: 'Conversations' }
];

/**
 * Single source of truth for the Phone section's sub-navigation, rendered
 * from every /phone* page rather than duplicated per page. Placed just
 * under each page's own title/subtitle (see each page.tsx), so it's always
 * visible without requiring a return trip to /phone.
 */
export default function PhoneSubNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-nowrap gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible"
      aria-label="Phone section"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 text-sm whitespace-nowrap ${active ? 'btn-primary' : 'btn-secondary'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

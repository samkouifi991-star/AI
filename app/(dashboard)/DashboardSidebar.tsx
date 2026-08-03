'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from './SignOutButton';

type NavItem = { href: string; label: string; external?: boolean };

export default function DashboardSidebar(props: {
  aiName: string;
  aiInitial: string;
  isOnDuty: boolean;
  dutyLine: string;
  primaryNav: NavItem[];
  teachHref: string;
  openGapCount: number;
  legacyNav: NavItem[];
  ownerLabel: string;
  ownerInitial: string;
}) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname?.startsWith(href + '/');
  }

  return (
    <aside
      className="font-instrument bg-bp-dark-900"
      style={{
        width: 264,
        flex: '0 0 264px',
        padding: '20px 16px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Logo row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 20px' }}>
        <div
          className="bg-bp-accent"
          style={{ width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.97 0.02 265)', display: 'block' }} />
        </div>
        <span className="font-grotesk text-bp-on-dark" style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: '-0.01em' }}>
          Business Pilot
        </span>
      </div>

      {/* Ava status card */}
      <div className="bg-bp-dark-800 border border-bp-dark-600" style={{ borderRadius: 14, padding: 14, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: '0 0 38px' }}>
            <div
              className="bg-bp-accent font-grotesk text-white"
              style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15 }}
            >
              {props.aiInitial}
            </div>
            <span
              className={props.isOnDuty ? 'bg-bp-good' : 'bg-bp-ink-faint'}
              style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', border: '2.5px solid oklch(0.235 0.016 265)' }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="text-bp-on-dark" style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {props.aiName}
            </div>
            <div className={props.isOnDuty ? 'text-bp-good' : 'text-bp-on-dark-faint'} style={{ fontSize: 11.5 }}>
              {props.isOnDuty ? 'On duty' : 'Off duty'}
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid oklch(0.30 0.018 265)', marginTop: 12, paddingTop: 11, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            className="bg-bp-good"
            style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', animation: props.isOnDuty ? 'bp-pulse 2s ease-in-out infinite' : undefined, opacity: props.isOnDuty ? 1 : 0.4 }}
          />
          <span className="font-jetbrains text-bp-on-dark-muted" style={{ fontSize: 10 }}>{props.dutyLine}</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {props.primaryNav.map((item) => {
          const active = isActive(item.href);
          const isTeach = item.href === props.teachHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className={active ? 'bg-bp-dark-nav-active text-white' : 'text-bp-on-dark-muted hover:text-white'}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', borderRadius: 9, fontSize: 13.5, fontWeight: 500, textAlign: 'left' }}
            >
              <span>{item.label}</span>
              {isTeach && props.openGapCount > 0 && (
                <span
                  className="font-jetbrains"
                  style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'oklch(0.68 0.13 65)', color: 'oklch(0.2 0.03 65)', fontWeight: 500 }}
                >
                  {props.openGapCount}
                </span>
              )}
            </Link>
          );
        })}

        {props.legacyNav.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="text-bp-on-dark-faint hover:text-bp-on-dark-muted"
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 11px', borderRadius: 9, fontSize: 12.5, fontWeight: 500, textAlign: 'left' }}
            >
              <span>More</span>
              <span>{showMore ? '−' : '+'}</span>
            </button>
            {showMore && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {props.legacyNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive(item.href) ? 'bg-bp-dark-nav-active text-white' : 'text-bp-on-dark-faint hover:text-bp-on-dark-muted'}
                    style={{ padding: '8px 11px 8px 20px', borderRadius: 9, fontSize: 12.5, fontWeight: 500 }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid oklch(0.28 0.016 265)' }}>
        <Link
          href="/onboarding"
          className="text-bp-ink-faint hover:bg-bp-dark-800 hover:text-bp-on-dark-mid-2"
          style={{ display: 'block', fontSize: 12.5, padding: '7px 8px', borderRadius: 8, marginBottom: 10 }}
        >
          Replay setup
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px' }}>
          <div
            style={{ width: 24, height: 24, borderRadius: 7, background: 'oklch(0.32 0.016 265)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 24px' }}
            className="text-bp-on-dark-mid font-grotesk"
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>{props.ownerInitial}</span>
          </div>
          <span className="text-bp-on-dark-muted" style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {props.ownerLabel}
          </span>
          <SignOutButton className="text-bp-on-dark-faint hover:text-white" />
        </div>
      </div>
    </aside>
  );
}

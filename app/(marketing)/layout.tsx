import MarketingNav from '@/components/MarketingNav';
import MarketingFooter from '@/components/MarketingFooter';

// Deliberately has NO auth check — every page under this layout must stay
// public for logged-out visitors. Logged-in users can still view these
// pages too (per spec); protected routes live under app/(dashboard),
// which has its own layout that does check for a session.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

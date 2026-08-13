import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-harbor-50 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-heading text-lg font-bold text-harbor-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-harbor-900 text-compass-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4Z" fill="currentColor" opacity="0.9" />
            <path d="m8 12 3 3 5-6" stroke="#0e242b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Smart USA Visa
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

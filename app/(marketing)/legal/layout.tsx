export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-16">
      <article className="legal-content">{children}</article>
    </div>
  )
}

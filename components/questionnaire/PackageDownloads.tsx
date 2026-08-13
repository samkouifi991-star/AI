'use client'

const files = [
  { key: 'bundle', label: 'Download Complete Package', primary: true },
  { key: 'forms', label: 'Download Forms', primary: false },
  { key: 'instructions', label: 'Download Instructions', primary: false },
  { key: 'checklist', label: 'Download Checklist', primary: false },
  { key: 'cover', label: 'Download Cover Sheet', primary: false },
]

export function PackageDownloads({ applicationId }: { applicationId: string }) {
  async function download(fileKey: string) {
    const res = await fetch(`/api/applications/${applicationId}/package/${fileKey}`)
    if (!res.ok) return
    const { url } = await res.json()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {files.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => download(f.key)}
          className={f.primary ? 'btn-primary sm:col-span-2' : 'btn-outline'}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

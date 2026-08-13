import { Resend } from 'resend'

let client: Resend | null = null

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

const FROM = process.env.RESEND_FROM_EMAIL || 'Smart USA Visa <notifications@smartusavisa.com>'

// Every call is a no-op (logged, not thrown) when RESEND_API_KEY isn't
// configured, so local development and CI never fail on missing email
// credentials — but production sends real transactional email.
async function send(to: string, subject: string, html: string) {
  const resend = getResend()
  if (!resend) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`)
    return
  }
  await resend.emails.send({ from: FROM, to, subject, html })
}

export async function sendPackageReadyEmail(to: string, formCode: string, applicationUrl: string) {
  await send(
    to,
    `Your ${formCode} filing package is ready`,
    `<p>Your Smart USA Visa preparation service is complete.</p>
     <p>Your completed ${formCode} forms, document checklist, and filing instructions are ready to download.</p>
     <p><a href="${applicationUrl}">View and download your package</a></p>
     <p style="color:#5d6874;font-size:12px">Smart USA Visa is not affiliated with USCIS and does not file your application for you.</p>`
  )
}

export async function sendTranslationReadyEmail(to: string, applicationUrl: string) {
  await send(
    to,
    'Your certified translation is ready',
    `<p>Your certified translation has been completed and added to your document checklist.</p>
     <p><a href="${applicationUrl}">View your documents</a></p>`
  )
}

export async function sendSupportAcknowledgementEmail(to: string, subject: string) {
  await send(
    to,
    "We've received your message",
    `<p>Thanks for contacting Smart USA Visa about "${subject}". A real person will respond within 2 business days.</p>`
  )
}

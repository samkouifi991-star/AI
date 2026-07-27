import { Resend } from 'resend';
import { logger } from './logger';

let cachedClient: Resend | null = null;

/**
 * Lazily-constructed Resend client — called only at request runtime, never
 * at module scope, for the same reason lib/openai.ts's getOpenAI() is lazy:
 * Next.js imports every route module while collecting page data at build
 * time, and RESEND_API_KEY may not be set then.
 */
function getResend(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendContactFormEmail(params: {
  name: string;
  email: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const to = process.env.CONTACT_FORM_RECIPIENT;
  if (!to) {
    return { ok: false, error: 'Contact form is not configured yet — CONTACT_FORM_RECIPIENT is not set.' };
  }

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Business Pilot AI Contact Form <onboarding@resend.dev>',
      to,
      replyTo: params.email,
      subject: `New contact form message from ${params.name}`,
      text: `From: ${params.name} <${params.email}>\n\n${params.message}`
    });
    return { ok: true };
  } catch (err: any) {
    logger.error('contact_form_send_failed', { message: err.message });
    return { ok: false, error: 'Could not send your message right now — please try again shortly.' };
  }
}

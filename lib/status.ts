/**
 * Every integration in the product (Twilio, Vapi, Stripe, Google Calendar,
 * ElevenLabs, webhooks...) has its own raw status shape. This file is the
 * single place that translates all of them into one simple vocabulary a
 * non-technical business owner can act on, plus a plain-English next
 * action — while keeping the real technical detail available separately
 * for an expandable "advanced" section, never hidden entirely.
 */

export type SimpleStatus = 'not_connected' | 'connecting' | 'connected' | 'needs_attention' | 'limited' | 'failed';

export interface StatusResult {
  status: SimpleStatus;
  label: string;          // shown on the badge
  message: string;         // plain-English explanation
  nextAction?: string;     // what the owner should do, if anything
  technicalDetail?: string; // raw provider error/detail — shown only when "Show details" is expanded
}

export function twilioConnectionStatus(connection: { status: string; error_message?: string | null } | null): StatusResult {
  if (!connection) return { status: 'not_connected', label: 'Not connected', message: 'No phone provider connected yet.', nextAction: 'Choose a phone option to get started.' };
  switch (connection.status) {
    case 'connecting':
      return { status: 'connecting', label: 'Connecting', message: 'Verifying your Twilio account…' };
    case 'connected':
      return { status: 'connected', label: 'Connected', message: 'Twilio is connected and working.' };
    case 'error':
      return {
        status: 'failed',
        label: 'Failed',
        message: 'Twilio connected credentials could not be verified.',
        nextAction: 'Double-check your Account SID and Auth Token and try again.',
        technicalDetail: connection.error_message ?? undefined
      };
    default:
      return { status: 'not_connected', label: 'Not connected', message: 'Twilio is not connected yet.' };
  }
}

export function assistantStatus(vapiAssistantId: string | null | undefined): StatusResult {
  if (!vapiAssistantId) {
    return { status: 'not_connected', label: 'Not set up', message: 'Your AI assistant hasn\'t been created yet.', nextAction: 'Finish phone setup to create it automatically.' };
  }
  return { status: 'connected', label: 'Active', message: 'Your AI assistant is set up and ready to take calls.' };
}

export function webhookStatus(webhook: { last_status?: string | null; last_received_at?: string | null; failure_count?: number } | null): StatusResult {
  if (!webhook || !webhook.last_received_at) {
    return { status: 'not_connected', label: 'No activity yet', message: 'No calls or messages have reached this webhook yet.', nextAction: 'Make a test call or send a test SMS.' };
  }
  const daysSinceLast = (Date.now() - new Date(webhook.last_received_at).getTime()) / (1000 * 60 * 60 * 24);
  if (webhook.last_status === 'signature_invalid') {
    return { status: 'failed', label: 'Unreachable', message: 'Recent requests to this webhook failed a security check.', nextAction: 'Contact support — this usually means a configuration mismatch.', technicalDetail: 'signature_invalid' };
  }
  if (daysSinceLast > 30) {
    return { status: 'needs_attention', label: 'Inactive', message: 'No activity in over 30 days.', nextAction: 'Place a test call to confirm everything still works.' };
  }
  return { status: 'connected', label: 'Healthy', message: 'Receiving requests normally.' };
}

export function smsRegistrationStatus(registrationStatus: string): StatusResult {
  switch (registrationStatus) {
    case 'registered':
      return { status: 'connected', label: 'Registered', message: 'SMS messaging is fully registered.' };
    case 'pending':
      return { status: 'needs_attention', label: 'Registration pending', message: 'Your SMS registration is being reviewed by the carrier network.', nextAction: 'This is normal — it can take a few business days.' };
    case 'restricted':
      return { status: 'limited', label: 'Limited', message: 'SMS is working but may be rate-limited or filtered by carriers.', nextAction: 'Complete messaging registration to remove these limits.' };
    default:
      return { status: 'needs_attention', label: 'Not registered', message: 'SMS registration hasn\'t been started.', nextAction: 'Required for higher-volume SMS in the US — see SMS settings.' };
  }
}

export function stripeModeStatus(mode: 'test' | 'live' | null): StatusResult {
  if (!mode) return { status: 'not_connected', label: 'Not connected', message: 'Stripe is not connected yet.' };
  if (mode === 'test') {
    return { status: 'limited', label: 'Test mode active', message: 'Payments are in test mode — no real charges will occur.', nextAction: 'Switch to live keys when you\'re ready to accept real payments.' };
  }
  return { status: 'connected', label: 'Live', message: 'Stripe is connected and accepting real payments.' };
}

export function calendarConnectionStatus(connected: boolean): StatusResult {
  return connected
    ? { status: 'connected', label: 'Connected', message: 'Google Calendar is connected — your AI checks real availability.' }
    : { status: 'not_connected', label: 'Not connected', message: 'Connect Google Calendar so your AI can check availability and book appointments.', nextAction: 'Click Connect Google Calendar.' };
}

export const STATUS_BADGE_CLASS: Record<SimpleStatus, string> = {
  not_connected: 'badge-warning',
  connecting: 'badge-warning',
  connected: 'badge-success',
  needs_attention: 'badge-warning',
  limited: 'badge-warning',
  failed: 'badge-danger'
};

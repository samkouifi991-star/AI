import twilio from 'twilio';
import { logger } from './logger';
import { decryptSecret } from './crypto';

export function twilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN is not set');
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Builds a Twilio client from a business's own (BYO) connected account,
 * decrypting the stored auth token only at the moment of use — never
 * cached in a variable longer than this call needs, never logged.
 */
export function twilioClientForConnection(accountSid: string, encryptedAuthToken: string) {
  const authToken = decryptSecret(encryptedAuthToken);
  return twilio(accountSid, authToken);
}

/**
 * Creates a Twilio subaccount under the platform master account for one
 * business. This is what makes per-business number isolation a provider-
 * level guarantee: the subaccount has its own auth token and its own
 * number inventory, so purchasing/releasing/listing numbers for business A
 * can never touch business B's numbers even if application code has a bug.
 * Returns the subaccount's own SID and (plaintext, caller must encrypt
 * before persisting) auth token — Twilio only returns the auth token at
 * creation time, so callers must store it immediately.
 */
export async function createSubaccount(friendlyName: string, client = twilioClient()) {
  const account = await client.api.v2010.accounts.create({ friendlyName });
  return { subaccountSid: account.sid, subaccountAuthToken: account.authToken };
}

/**
 * Builds a client scoped to a business's own subaccount, decrypting the
 * stored subaccount auth token only at the moment of use.
 */
export function twilioClientForSubaccount(subaccountSid: string, encryptedAuthToken: string) {
  const authToken = decryptSecret(encryptedAuthToken);
  return twilio(subaccountSid, authToken);
}

/**
 * Suspends (closes) a business's subaccount as part of account deletion.
 * Twilio subaccounts cannot be hard-deleted via the API — 'closed' is the
 * terminal, billing-stopped state. Any numbers still attached must be
 * released first (Twilio refuses to close a subaccount with active
 * numbers), which the deletion flow does explicitly and only on the
 * customer's confirmed choice.
 */
export async function closeSubaccount(subaccountSid: string, client = twilioClient()) {
  await client.api.v2010.accounts(subaccountSid).update({ status: 'closed' });
}

export interface NumberSearchParams {
  country?: string;         // ISO country code, e.g. 'US'
  areaCode?: string;
  region?: string;          // state/province
  locality?: string;        // city
  numberType?: 'local' | 'toll_free';
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  limit?: number;
}

export interface AvailableNumberResult {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  // Twilio's search API doesn't return price directly — pricing comes from
  // the separate Pricing API. monthlyPrice here is populated by the search
  // route from lib/twilio.ts getNumberPricing(), not fabricated.
  monthlyPrice?: number;
}

/**
 * Real search against Twilio's Available Phone Numbers API. Uses the
 * platform account by default; pass a client built from
 * twilioClientForConnection() for a BYO search instead.
 *
 * Twilio's `availablePhoneNumbers(country).local` / `.tollFree` are
 * distinct SDK resources with their own overloaded `list()` signatures —
 * accessing one dynamically via `[resource]` collapses them into a union
 * TypeScript can't safely call. Explicit branches keep each resource's
 * real parameter shape intact instead. Toll-free numbers aren't scoped to
 * an area code or region the way local numbers are, so that branch
 * deliberately doesn't accept those fields — passing them wouldn't just be
 * a type error, they're not meaningful for a toll-free search.
 */
export async function searchAvailableNumbers(
  params: NumberSearchParams,
  client = twilioClient()
): Promise<AvailableNumberResult[]> {
  const country = params.country ?? 'US';
  const available = client.availablePhoneNumbers(country);
  const limit = params.limit ?? 20;

  let results;

  switch (params.numberType ?? 'local') {
    case 'local':
      results = await available.local.list({
        areaCode: params.areaCode ? Number(params.areaCode) : undefined,
        inRegion: params.region,
        inLocality: params.locality,
        voiceEnabled: params.voiceEnabled,
        smsEnabled: params.smsEnabled,
        mmsEnabled: params.mmsEnabled,
        limit
      });
      break;

    case 'toll_free':
      results = await available.tollFree.list({
        voiceEnabled: params.voiceEnabled,
        smsEnabled: params.smsEnabled,
        mmsEnabled: params.mmsEnabled,
        limit
      });
      break;

    default:
      // Should be unreachable given NumberSearchParams' type, but this is
      // what "return a clear user-facing error if unsupported" means in
      // practice for a value that got here anyway (e.g. from a not-fully-
      // validated request body).
      throw new Error(`Unsupported phone number type: ${params.numberType}`);
  }

  return results.map((r) => ({
    phoneNumber: r.phoneNumber,
    friendlyName: r.friendlyName,
    locality: r.locality ?? undefined,
    region: r.region ?? undefined,
    capabilities: {
      voice: !!r.capabilities?.voice,
      sms: !!r.capabilities?.sms,
      mms: !!r.capabilities?.mms
    }
  }));
}

/** Real per-number monthly pricing from Twilio's Pricing API. */
export async function getNumberMonthlyPrice(
  country: string,
  numberType: 'local' | 'toll_free',
  client = twilioClient()
): Promise<number | null> {
  try {
    const pricing = await client.pricing.v1.phoneNumbers.countries(country).fetch();
    const entry = pricing.phoneNumberPrices?.find((p: any) => p.numberType === numberType);
    return entry ? Number(entry.currentPrice) : null;
  } catch (err: any) {
    logger.error('twilio_pricing_lookup_failed', { country, numberType, message: err.message });
    return null;
  }
}

/**
 * Purchases a number and points its voice/SMS webhooks at this
 * deployment's Vapi/Twilio webhook routes immediately — a number is never
 * left purchased-but-unconfigured, per the provisioning workflow's
 * "no partial state" requirement.
 */
export async function purchaseNumber(
  phoneNumber: string,
  webhookBaseUrl: string,
  client = twilioClient()
) {
  return client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${webhookBaseUrl}/api/twilio/voice`,
    voiceMethod: 'POST',
    smsUrl: `${webhookBaseUrl}/api/webhooks/twilio-sms`,
    smsMethod: 'POST'
  });
}

export async function releaseNumber(twilioSid: string, client = twilioClient()) {
  await client.incomingPhoneNumbers(twilioSid).remove();
}

export async function updateNumberWebhooks(
  twilioSid: string,
  webhookBaseUrl: string,
  client = twilioClient()
) {
  return client.incomingPhoneNumbers(twilioSid).update({
    voiceUrl: `${webhookBaseUrl}/api/twilio/voice`,
    voiceMethod: 'POST',
    smsUrl: `${webhookBaseUrl}/api/webhooks/twilio-sms`,
    smsMethod: 'POST'
  });
}

/** Lists numbers already present in a (typically BYO) Twilio account, for
 * the "Import an existing Twilio number" flow. */
export async function listAccountNumbers(client = twilioClient()) {
  const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
  return numbers.map((n) => ({
    sid: n.sid,
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    capabilities: { voice: !!n.capabilities.voice, sms: !!n.capabilities.sms, mms: !!n.capabilities.mms }
  }));
}

/**
 * Verifies an inbound Twilio webhook request actually came from Twilio,
 * using Twilio's own signature validation (HMAC-SHA1 of the URL + sorted
 * POST params, against the account's auth token). Call this before trusting
 * ANY Twilio webhook payload.
 */
export function verifyTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
  authToken = process.env.TWILIO_AUTH_TOKEN
): boolean {
  if (!signature || !authToken) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/**
 * Sends an SMS and returns { ok, error } instead of throwing, so callers in
 * the call webhook and checkout flow can degrade gracefully (e.g. still
 * confirm a booking even if the confirmation text fails to send) rather
 * than taking down the whole request.
 */
export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.TWILIO_PHONE_NUMBER) {
    logger.error('twilio_sms_missing_from_number');
    return { ok: false, error: 'TWILIO_PHONE_NUMBER is not set' };
  }
  try {
    const client = twilioClient();
    await client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body });
    return { ok: true };
  } catch (err: any) {
    logger.error('twilio_sms_send_failed', { to, message: err.message });
    return { ok: false, error: err.message ?? 'Failed to send SMS' };
  }
}

export function appointmentConfirmationSms(params: {
  businessName: string;
  when: string;
  address?: string;
}) {
  const { businessName, when, address } = params;
  return (
    `${businessName}: You're confirmed for ${when}` +
    (address ? ` at ${address}.` : '.') +
    ` Reply to this text if you need to reschedule.`
  );
}


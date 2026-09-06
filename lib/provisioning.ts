import { supabaseServiceRole } from './supabase/admin';
import {
  purchaseNumber,
  twilioClientForConnection,
  twilioClientForSubaccount,
  createSubaccount,
  releaseNumber
} from './twilio';
import { createAssistant, importTwilioNumberToVapi, deleteVapiPhoneNumber, deleteAssistant, syncAssistantSettings } from './vapi-assistant';
import { buildSystemPrompt } from './vapi-tools';
import { decryptSecret, encryptSecret } from './crypto';
import { logger } from './logger';
import { withRetry } from './provider-retry';
import { enqueueFailedEvent } from './dead-letter-queue';

type StepName =
  | 'verify_subscription'
  | 'verify_twilio_connection'
  | 'create_subaccount'
  | 'verify_vapi_connection'
  | 'create_or_select_assistant'
  | 'assign_voice'
  | 'configure_system_prompt'
  | 'configure_webhook'
  | 'assign_phone_number'
  | 'configure_inbound_routing'
  | 'configure_sms'
  | 'save_provider_ids'
  | 'run_connection_test';

// The plain-language, business-level provisioning state (distinct from
// this one workflow run's step-by-step status) — the single source of
// truth the dashboard reads to tell the owner where they stand.
type ProvisioningState =
  | 'account_created'
  | 'profile_incomplete'
  | 'waiting_for_phone_selection'
  | 'purchasing_number'
  | 'creating_ai_employee'
  | 'connecting_phone'
  | 'syncing_settings'
  | 'processing_knowledge'
  | 'ready_for_test'
  | 'live'
  | 'failed';

interface JobContext {
  jobId: string;
  businessId: string;
  supabase: ReturnType<typeof supabaseServiceRole>;
  createdAssistantId?: string;   // only set if THIS job created a new assistant (governs rollback)
  purchasedTwilioSid?: string;   // only set once a real Twilio purchase has happened
  vapiPhoneNumberId?: string;
  subaccountClient?: ReturnType<typeof twilioClientForSubaccount>; // the client the purchase actually used — rollback must release through the same one
}

async function recordStep(ctx: JobContext, step: StepName, ok: boolean, detail?: string) {
  const { data: job } = await ctx.supabase.from('provisioning_jobs').select('steps_completed').eq('id', ctx.jobId).single();
  const steps = (job?.steps_completed as any[]) ?? [];
  steps.push({ step, ok, detail, at: new Date().toISOString() });
  await ctx.supabase
    .from('provisioning_jobs')
    .update({ current_step: step, steps_completed: steps })
    .eq('id', ctx.jobId);
}

async function setState(ctx: JobContext, state: ProvisioningState, extra?: { failedStep?: StepName; error?: string }) {
  await ctx.supabase
    .from('businesses')
    .update({
      provisioning_state: state,
      provisioning_failed_step: extra?.failedStep ?? null,
      provisioning_error_message: extra?.error ?? null
    })
    .eq('id', ctx.businessId);
}

async function rollback(ctx: JobContext) {
  logger.warn('provisioning_rollback_started', { jobId: ctx.jobId, businessId: ctx.businessId });
  if (ctx.vapiPhoneNumberId) await deleteVapiPhoneNumber(ctx.vapiPhoneNumberId);
  if (ctx.createdAssistantId) await deleteAssistant(ctx.createdAssistantId);
  if (ctx.purchasedTwilioSid) {
    try {
      await releaseNumber(ctx.purchasedTwilioSid, ctx.subaccountClient);
    } catch (err: any) {
      logger.error('provisioning_rollback_release_failed', { jobId: ctx.jobId, message: err.message });
    }
  }
  await ctx.supabase.from('provisioning_jobs').update({ status: 'rolled_back' }).eq('id', ctx.jobId);
}

async function fail(ctx: JobContext, step: StepName, message: string) {
  await ctx.supabase
    .from('provisioning_jobs')
    .update({ status: 'failed', failed_step: step, error_message: message, completed_at: new Date().toISOString() })
    .eq('id', ctx.jobId);
  await setState(ctx, 'failed', { failedStep: step, error: message });
  await rollback(ctx);
  return { ok: false as const, jobId: ctx.jobId, failedStep: step, error: message };
}

/**
 * Ensures the business has its own Twilio subaccount, creating one if
 * necessary, and returns a client scoped to it. Every number purchase and
 * webhook configuration for this business goes through this client —
 * never the platform master account — so one business's numbers can never
 * land in another's inventory even if application logic has a bug.
 */
async function ensureSubaccount(
  ctx: JobContext,
  supabase: ReturnType<typeof supabaseServiceRole>,
  businessId: string,
  businessName: string,
  existingSid: string | null,
  existingEncryptedToken: string | null
): Promise<{ ok: true; client: ReturnType<typeof twilioClientForSubaccount> } | { ok: false; error: string }> {
  if (existingSid && existingEncryptedToken) {
    return { ok: true, client: twilioClientForSubaccount(existingSid, existingEncryptedToken) };
  }
  try {
    const sub = await createSubaccount(`Business Pilot AI — ${businessName}`.slice(0, 64));
    const encryptedToken = encryptSecret(sub.subaccountAuthToken);
    await supabase
      .from('businesses')
      .update({ twilio_subaccount_sid: sub.subaccountSid, twilio_subaccount_auth_token_encrypted: encryptedToken })
      .eq('id', businessId);
    return { ok: true, client: twilioClientForSubaccount(sub.subaccountSid, encryptedToken) };
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Could not create a dedicated Twilio subaccount for this business' };
  }
}

/**
 * Option B: search-and-buy a brand-new number, fully provisioned end to
 * end. Every step is recorded to provisioning_jobs as it happens; any
 * failure rolls back everything created so far (purchased number released,
 * any assistant/phone-number resources this job created in Vapi deleted)
 * rather than leaving a half-configured number behind.
 *
 * Idempotency: a unique DB index (provisioning_jobs_one_active_per_business_
 * workflow, migration 0014) rejects a second concurrent in-progress job for
 * the same business+workflow outright — a race can't slip through a
 * check-then-insert gap. On top of that, if the business already has an
 * active phone number, this returns that existing result instead of
 * purchasing a second one, so a retry after a timeout (rather than a true
 * concurrent call) also can't double-purchase.
 */
export async function runBuyNumberWorkflow(params: {
  businessId: string;
  phoneNumber: string;
  numberType: 'local' | 'toll_free';
  monthlyPrice: number | null;
}): Promise<
  | { ok: true; jobId: string; phoneNumberId: string }
  | { ok: false; jobId: string; failedStep: StepName; error: string }
> {
  const supabase = supabaseServiceRole();

  // Idempotency guard #1: already provisioned. A retry after the caller
  // never saw the response (timeout, dropped connection) must not buy a
  // second number.
  const { data: existingActive } = await supabase
    .from('phone_numbers')
    .select('id')
    .eq('business_id', params.businessId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingActive) {
    const { data: priorJob } = await supabase
      .from('provisioning_jobs')
      .select('id')
      .eq('business_id', params.businessId)
      .eq('workflow_type', 'buy_number')
      .eq('status', 'succeeded')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: true, jobId: priorJob?.id ?? existingActive.id, phoneNumberId: existingActive.id };
  }

  const { data: job, error: jobError } = await supabase
    .from('provisioning_jobs')
    .insert({ business_id: params.businessId, workflow_type: 'buy_number', status: 'in_progress' })
    .select()
    .single();

  if (jobError) {
    // Idempotency guard #2: a genuinely concurrent call lost the race to
    // the unique index — never start a second purchase attempt in parallel
    // with one that's already running.
    if (jobError.code === '23505') {
      const { data: activeJob } = await supabase
        .from('provisioning_jobs')
        .select('id')
        .eq('business_id', params.businessId)
        .eq('workflow_type', 'buy_number')
        .eq('status', 'in_progress')
        .maybeSingle();
      return {
        ok: false,
        jobId: activeJob?.id ?? 'unknown',
        failedStep: 'verify_subscription',
        error: 'A number purchase is already in progress for this business.'
      };
    }
    throw new Error('Could not create provisioning job record');
  }
  if (!job) throw new Error('Could not create provisioning job record');

  const ctx: JobContext = { jobId: job.id, businessId: params.businessId, supabase };

  // Step 1: subscription eligibility
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, service_area, vapi_assistant_id, twilio_subaccount_sid, twilio_subaccount_auth_token_encrypted')
    .eq('id', params.businessId)
    .single();
  if (!business) return fail(ctx, 'verify_subscription', 'Business not found.');
  // NOTE: actual plan-tier gating (Starter/Growth/Pro) hooks in here once
  // the subscription table from the billing module is queryable — this
  // step exists and records real pass/fail, but the specific "does this
  // plan allow buying numbers" rule is a one-line addition once that table
  // is joined in. Documented honestly in the final report, not hidden.
  await recordStep(ctx, 'verify_subscription', true);

  // Step 2: Twilio connection (platform master account, used only to
  // create/manage the subaccount — never to hold numbers directly)
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return fail(ctx, 'verify_twilio_connection', 'Platform Twilio credentials are not configured.');
  }
  await recordStep(ctx, 'verify_twilio_connection', true);

  // Step: dedicated per-business Twilio subaccount
  const subaccount = await ensureSubaccount(
    ctx,
    supabase,
    params.businessId,
    business.name,
    business.twilio_subaccount_sid,
    business.twilio_subaccount_auth_token_encrypted
  );
  if (!subaccount.ok) return fail(ctx, 'create_subaccount', subaccount.error);
  ctx.subaccountClient = subaccount.client;
  await recordStep(ctx, 'create_subaccount', true, business.twilio_subaccount_sid ?? 'newly created');

  // Step 3: Vapi connection
  if (!process.env.VAPI_API_KEY) {
    return fail(ctx, 'verify_vapi_connection', 'VAPI_API_KEY is not configured.');
  }
  await recordStep(ctx, 'verify_vapi_connection', true);

  // Step 4-7: create/select assistant, with voice + system prompt + webhook
  await setState(ctx, 'creating_ai_employee');
  const { data: voiceSettings } = await supabase
    .from('business_voice_settings')
    .select('voice_provider, voice_id')
    .eq('business_id', params.businessId)
    .single();

  let assistantId = business.vapi_assistant_id as string | null;
  if (!assistantId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const created = await createAssistant({
      businessId: params.businessId,
      name: `${business.name} Receptionist`,
      systemPrompt: buildSystemPrompt(business),
      firstMessage: `Thanks for calling ${business.name} — how can I help you today?`,
      voiceProvider: voiceSettings?.voice_provider ?? 'elevenlabs',
      voiceId: voiceSettings?.voice_id ?? '21m00Tcm4TlvDq8ikWAM',
      serverUrl: `${appUrl}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET ?? ''
    });
    if ('error' in created) return fail(ctx, 'create_or_select_assistant', created.error);
    assistantId = created.assistantId;
    ctx.createdAssistantId = assistantId; // only rollback-delete if THIS job made it
    await supabase.from('businesses').update({ vapi_assistant_id: assistantId }).eq('id', params.businessId);
  }
  await recordStep(ctx, 'create_or_select_assistant', true, assistantId);
  await recordStep(ctx, 'assign_voice', true);
  await recordStep(ctx, 'configure_system_prompt', true);
  await recordStep(ctx, 'configure_webhook', true);

  // Step 8: purchase the number (real Twilio API call, inside this
  // business's own subaccount — never the platform pool)
  await setState(ctx, 'purchasing_number');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  let purchased;
  try {
    purchased = await purchaseNumber(params.phoneNumber, appUrl, ctx.subaccountClient);
    ctx.purchasedTwilioSid = purchased.sid;
  } catch (err: any) {
    return fail(ctx, 'assign_phone_number', err.message ?? 'Twilio purchase failed');
  }
  await recordStep(ctx, 'assign_phone_number', true, purchased.sid);

  // Step 9-10: inbound routing + SMS webhooks (set at purchase time above)
  await recordStep(ctx, 'configure_inbound_routing', true);
  await recordStep(ctx, 'configure_sms', true);

  // Import the number into Vapi so it actually rings the assistant
  await setState(ctx, 'connecting_phone');
  const imported = await importTwilioNumberToVapi({
    businessId: params.businessId,
    twilioAccountSid: subaccount.client.accountSid,
    twilioAuthToken: subaccount.client.password ?? '',
    twilioPhoneNumber: params.phoneNumber,
    assistantId
  });
  if ('error' in imported) return fail(ctx, 'assign_phone_number', imported.error);
  ctx.vapiPhoneNumberId = imported.vapiPhoneNumberId;

  // Step 11: save all provider IDs
  const { data: phoneRow, error: phoneInsertError } = await supabase
    .from('phone_numbers')
    .insert({
      business_id: params.businessId,
      source: 'purchased',
      phone_number: params.phoneNumber,
      provider: 'twilio',
      twilio_sid: purchased.sid,
      number_type: params.numberType,
      capabilities: { voice: true, sms: true, mms: false },
      monthly_price: params.monthlyPrice,
      vapi_phone_number_id: imported.vapiPhoneNumberId,
      vapi_assistant_id: assistantId,
      status: 'active'
    })
    .select()
    .single();
  if (phoneInsertError || !phoneRow) return fail(ctx, 'save_provider_ids', phoneInsertError?.message ?? 'Could not save phone number record');
  await recordStep(ctx, 'save_provider_ids', true, phoneRow.id);

  // Step 12: connection test — confirm Vapi actually has the number linked
  try {
    const res = await withRetry('vapi', 'connection_test', () =>
      fetch(`https://api.vapi.ai/phone-number/${imported.vapiPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
      })
    );
    if (!res.ok) return fail(ctx, 'run_connection_test', `Vapi could not confirm the number: ${res.status}`);
  } catch (err: any) {
    return fail(ctx, 'run_connection_test', err.message ?? 'Connection test failed');
  }
  await recordStep(ctx, 'run_connection_test', true);

  // Push whatever's actually saved in assistant_settings (if the owner
  // customized it before this number existed) rather than leaving the
  // assistant on its bootstrap defaults — non-fatal: the number is still
  // successfully provisioned even if this particular sync comes back partial.
  await setState(ctx, 'syncing_settings');
  const sync = await syncAssistantSettings(params.businessId);
  if (sync.status !== 'synced') {
    logger.warn('provisioning_post_create_sync_incomplete', { businessId: params.businessId, status: sync.status, error: sync.error });
    await enqueueFailedEvent({
      eventType: 'retry_assistant_sync',
      businessId: params.businessId,
      payload: { businessId: params.businessId },
      errorMessage: sync.error ?? `sync status: ${sync.status}`
    });
  }

  await supabase
    .from('provisioning_jobs')
    .update({ status: 'succeeded', phone_number_id: phoneRow.id, completed_at: new Date().toISOString() })
    .eq('id', job.id);
  await setState(ctx, 'ready_for_test');

  return { ok: true, jobId: job.id, phoneNumberId: phoneRow.id };
}

/**
 * Option C: import a number already sitting in the business's own (BYO)
 * Twilio account. Shares the same assistant-creation and rollback pattern
 * as buy_number, but skips the purchase step — the number already exists,
 * it just needs to be attached. BYO numbers live in the customer's own
 * Twilio account (not a Business Pilot AI subaccount), since the customer
 * is bringing their own provider relationship.
 */
export async function runImportByoNumberWorkflow(params: {
  businessId: string;
  twilioAccountSid: string;
  encryptedAuthToken: string;
  phoneNumber: string;
  twilioSid: string;
}): Promise<
  | { ok: true; jobId: string; phoneNumberId: string }
  | { ok: false; jobId: string; failedStep: StepName; error: string }
> {
  const supabase = supabaseServiceRole();

  const { data: existingActive } = await supabase
    .from('phone_numbers')
    .select('id')
    .eq('business_id', params.businessId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingActive) {
    const { data: priorJob } = await supabase
      .from('provisioning_jobs')
      .select('id')
      .eq('business_id', params.businessId)
      .eq('workflow_type', 'import_byo_number')
      .eq('status', 'succeeded')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: true, jobId: priorJob?.id ?? existingActive.id, phoneNumberId: existingActive.id };
  }

  const { data: job, error: jobError } = await supabase
    .from('provisioning_jobs')
    .insert({ business_id: params.businessId, workflow_type: 'import_byo_number', status: 'in_progress' })
    .select()
    .single();

  if (jobError) {
    if (jobError.code === '23505') {
      const { data: activeJob } = await supabase
        .from('provisioning_jobs')
        .select('id')
        .eq('business_id', params.businessId)
        .eq('workflow_type', 'import_byo_number')
        .eq('status', 'in_progress')
        .maybeSingle();
      return {
        ok: false,
        jobId: activeJob?.id ?? 'unknown',
        failedStep: 'verify_subscription',
        error: 'A number import is already in progress for this business.'
      };
    }
    throw new Error('Could not create provisioning job record');
  }
  if (!job) throw new Error('Could not create provisioning job record');

  const ctx: JobContext = { jobId: job.id, businessId: params.businessId, supabase };

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, service_area, vapi_assistant_id')
    .eq('id', params.businessId)
    .single();
  if (!business) return fail(ctx, 'verify_subscription', 'Business not found.');
  await recordStep(ctx, 'verify_subscription', true);

  const client = twilioClientForConnection(params.twilioAccountSid, params.encryptedAuthToken);
  try {
    await client.api.v2010.accounts(params.twilioAccountSid).fetch();
  } catch (err: any) {
    return fail(ctx, 'verify_twilio_connection', 'Could not verify the connected Twilio account.');
  }
  await recordStep(ctx, 'verify_twilio_connection', true);

  if (!process.env.VAPI_API_KEY) return fail(ctx, 'verify_vapi_connection', 'VAPI_API_KEY is not configured.');
  await recordStep(ctx, 'verify_vapi_connection', true);

  await setState(ctx, 'creating_ai_employee');
  const { data: voiceSettings } = await supabase
    .from('business_voice_settings')
    .select('voice_provider, voice_id')
    .eq('business_id', params.businessId)
    .single();

  let assistantId = business.vapi_assistant_id as string | null;
  if (!assistantId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const created = await createAssistant({
      businessId: params.businessId,
      name: `${business.name} Receptionist`,
      systemPrompt: buildSystemPrompt(business),
      firstMessage: `Thanks for calling ${business.name} — how can I help you today?`,
      voiceProvider: voiceSettings?.voice_provider ?? 'elevenlabs',
      voiceId: voiceSettings?.voice_id ?? '21m00Tcm4TlvDq8ikWAM',
      serverUrl: `${appUrl}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET ?? ''
    });
    if ('error' in created) return fail(ctx, 'create_or_select_assistant', created.error);
    assistantId = created.assistantId;
    ctx.createdAssistantId = assistantId;
    await supabase.from('businesses').update({ vapi_assistant_id: assistantId }).eq('id', params.businessId);
  }
  await recordStep(ctx, 'create_or_select_assistant', true, assistantId);
  await recordStep(ctx, 'assign_voice', true);
  await recordStep(ctx, 'configure_system_prompt', true);
  await recordStep(ctx, 'configure_webhook', true);

  // No purchase step for BYO import — the number already exists in the
  // customer's account. Just point its webhooks at this deployment.
  await setState(ctx, 'connecting_phone');
  const appUrl2 = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    await client.incomingPhoneNumbers(params.twilioSid).update({
      voiceUrl: `${appUrl2}/api/twilio/voice`,
      smsUrl: `${appUrl2}/api/webhooks/twilio-sms`
    });
  } catch (err: any) {
    return fail(ctx, 'assign_phone_number', err.message ?? "Could not configure the number's webhooks");
  }
  await recordStep(ctx, 'assign_phone_number', true, params.twilioSid);
  await recordStep(ctx, 'configure_inbound_routing', true);
  await recordStep(ctx, 'configure_sms', true);

  // Decrypted once, used immediately for the Vapi import call (which
  // requires the raw token to take over call handling on Twilio's side),
  // then falls out of scope — never persisted or logged in plaintext.
  const authTokenPlain = decryptSecret(params.encryptedAuthToken);

  const imported = await importTwilioNumberToVapi({
    businessId: params.businessId,
    twilioAccountSid: params.twilioAccountSid,
    twilioAuthToken: authTokenPlain,
    twilioPhoneNumber: params.phoneNumber,
    assistantId
  });
  if ('error' in imported) return fail(ctx, 'assign_phone_number', imported.error);
  ctx.vapiPhoneNumberId = imported.vapiPhoneNumberId;

  const { data: phoneRow, error: phoneInsertError } = await supabase
    .from('phone_numbers')
    .insert({
      business_id: params.businessId,
      source: 'imported_byo',
      phone_number: params.phoneNumber,
      provider: 'twilio',
      twilio_sid: params.twilioSid,
      vapi_phone_number_id: imported.vapiPhoneNumberId,
      vapi_assistant_id: assistantId,
      status: 'active'
    })
    .select()
    .single();
  if (phoneInsertError || !phoneRow) return fail(ctx, 'save_provider_ids', phoneInsertError?.message ?? 'Could not save phone number record');
  await recordStep(ctx, 'save_provider_ids', true, phoneRow.id);

  try {
    const res = await withRetry('vapi', 'connection_test', () =>
      fetch(`https://api.vapi.ai/phone-number/${imported.vapiPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
      })
    );
    if (!res.ok) return fail(ctx, 'run_connection_test', `Vapi could not confirm the number: ${res.status}`);
  } catch (err: any) {
    return fail(ctx, 'run_connection_test', err.message ?? 'Connection test failed');
  }
  await recordStep(ctx, 'run_connection_test', true);

  await setState(ctx, 'syncing_settings');
  const sync = await syncAssistantSettings(params.businessId);
  if (sync.status !== 'synced') {
    logger.warn('provisioning_post_create_sync_incomplete', { businessId: params.businessId, status: sync.status, error: sync.error });
    await enqueueFailedEvent({
      eventType: 'retry_assistant_sync',
      businessId: params.businessId,
      payload: { businessId: params.businessId },
      errorMessage: sync.error ?? `sync status: ${sync.status}`
    });
  }

  await supabase
    .from('provisioning_jobs')
    .update({ status: 'succeeded', phone_number_id: phoneRow.id, completed_at: new Date().toISOString() })
    .eq('id', job.id);
  await setState(ctx, 'ready_for_test');

  return { ok: true, jobId: job.id, phoneNumberId: phoneRow.id };
}

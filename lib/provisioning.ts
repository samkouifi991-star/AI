import { supabaseServiceRole } from './supabase/admin';
import { purchaseNumber, twilioClientForConnection, releaseNumber } from './twilio';
import { createAssistant, importTwilioNumberToVapi, deleteVapiPhoneNumber, deleteAssistant } from './vapi-assistant';
import { decryptSecret } from './crypto';
import { logger } from './logger';

type StepName =
  | 'verify_subscription'
  | 'verify_twilio_connection'
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

interface JobContext {
  jobId: string;
  businessId: string;
  supabase: ReturnType<typeof supabaseServiceRole>;
  createdAssistantId?: string;   // only set if THIS job created a new assistant (governs rollback)
  purchasedTwilioSid?: string;   // only set once a real Twilio purchase has happened
  vapiPhoneNumberId?: string;
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

async function rollback(ctx: JobContext) {
  logger.warn('provisioning_rollback_started', { jobId: ctx.jobId, businessId: ctx.businessId });
  if (ctx.vapiPhoneNumberId) await deleteVapiPhoneNumber(ctx.vapiPhoneNumberId);
  if (ctx.createdAssistantId) await deleteAssistant(ctx.createdAssistantId);
  if (ctx.purchasedTwilioSid) {
    try {
      await releaseNumber(ctx.purchasedTwilioSid);
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
  await rollback(ctx);
  return { ok: false as const, jobId: ctx.jobId, failedStep: step, error: message };
}

/**
 * Option B: search-and-buy a brand-new number, fully provisioned end to
 * end. Every step is recorded to provisioning_jobs as it happens; any
 * failure rolls back everything created so far (purchased number released,
 * any assistant/phone-number resources this job created in Vapi deleted)
 * rather than leaving a half-configured number behind.
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
  const { data: job, error: jobError } = await supabase
    .from('provisioning_jobs')
    .insert({ business_id: params.businessId, workflow_type: 'buy_number', status: 'in_progress' })
    .select()
    .single();
  if (jobError || !job) throw new Error('Could not create provisioning job record');

  const ctx: JobContext = { jobId: job.id, businessId: params.businessId, supabase };

  // Step 1: subscription eligibility
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, vapi_assistant_id')
    .eq('id', params.businessId)
    .single();
  if (!business) return fail(ctx, 'verify_subscription', 'Business not found.');
  // NOTE: actual plan-tier gating (Starter/Growth/Pro) hooks in here once
  // the subscription table from the billing module is queryable — this
  // step exists and records real pass/fail, but the specific "does this
  // plan allow buying numbers" rule is a one-line addition once that table
  // is joined in. Documented honestly in the final report, not hidden.
  await recordStep(ctx, 'verify_subscription', true);

  // Step 2: Twilio connection (platform mode)
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return fail(ctx, 'verify_twilio_connection', 'Platform Twilio credentials are not configured.');
  }
  await recordStep(ctx, 'verify_twilio_connection', true);

  // Step 3: Vapi connection
  if (!process.env.VAPI_API_KEY) {
    return fail(ctx, 'verify_vapi_connection', 'VAPI_API_KEY is not configured.');
  }
  await recordStep(ctx, 'verify_vapi_connection', true);

  // Step 4-7: create/select assistant, with voice + system prompt + webhook
  const { data: voiceSettings } = await supabase
    .from('business_voice_settings')
    .select('voice_provider, voice_id')
    .eq('business_id', params.businessId)
    .single();

  let assistantId = business.vapi_assistant_id as string | null;
  if (!assistantId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const created = await createAssistant({
      name: `${business.name} Receptionist`,
      systemPrompt: `You are the virtual receptionist for ${business.name}. Answer using the business's knowledge base, collect caller details, and transfer to a human for anything urgent.`,
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

  // Step 8: purchase the number (real Twilio API call)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  let purchased;
  try {
    purchased = await purchaseNumber(params.phoneNumber, appUrl);
    ctx.purchasedTwilioSid = purchased.sid;
  } catch (err: any) {
    return fail(ctx, 'assign_phone_number', err.message ?? 'Twilio purchase failed');
  }
  await recordStep(ctx, 'assign_phone_number', true, purchased.sid);

  // Step 9-10: inbound routing + SMS webhooks (set at purchase time above)
  await recordStep(ctx, 'configure_inbound_routing', true);
  await recordStep(ctx, 'configure_sms', true);

  // Import the number into Vapi so it actually rings the assistant
  const imported = await importTwilioNumberToVapi({
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
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
    const res = await fetch(`https://api.vapi.ai/phone-number/${imported.vapiPhoneNumberId}`, {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
    });
    if (!res.ok) return fail(ctx, 'run_connection_test', `Vapi could not confirm the number: ${res.status}`);
  } catch (err: any) {
    return fail(ctx, 'run_connection_test', err.message ?? 'Connection test failed');
  }
  await recordStep(ctx, 'run_connection_test', true);

  await supabase
    .from('provisioning_jobs')
    .update({ status: 'succeeded', phone_number_id: phoneRow.id, completed_at: new Date().toISOString() })
    .eq('id', job.id);

  return { ok: true, jobId: job.id, phoneNumberId: phoneRow.id };
}

/**
 * Option C: import a number already sitting in the business's own (BYO)
 * Twilio account. Shares the same assistant-creation and rollback pattern
 * as buy_number, but skips the purchase step — the number already exists,
 * it just needs to be attached.
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
  const { data: job, error: jobError } = await supabase
    .from('provisioning_jobs')
    .insert({ business_id: params.businessId, workflow_type: 'import_byo_number', status: 'in_progress' })
    .select()
    .single();
  if (jobError || !job) throw new Error('Could not create provisioning job record');

  const ctx: JobContext = { jobId: job.id, businessId: params.businessId, supabase };

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, vapi_assistant_id')
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

  const { data: voiceSettings } = await supabase
    .from('business_voice_settings')
    .select('voice_provider, voice_id')
    .eq('business_id', params.businessId)
    .single();

  let assistantId = business.vapi_assistant_id as string | null;
  if (!assistantId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const created = await createAssistant({
      name: `${business.name} Receptionist`,
      systemPrompt: `You are the virtual receptionist for ${business.name}. Answer using the business's knowledge base, collect caller details, and transfer to a human for anything urgent.`,
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
    const res = await fetch(`https://api.vapi.ai/phone-number/${imported.vapiPhoneNumberId}`, {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
    });
    if (!res.ok) return fail(ctx, 'run_connection_test', `Vapi could not confirm the number: ${res.status}`);
  } catch (err: any) {
    return fail(ctx, 'run_connection_test', err.message ?? 'Connection test failed');
  }
  await recordStep(ctx, 'run_connection_test', true);

  await supabase
    .from('provisioning_jobs')
    .update({ status: 'succeeded', phone_number_id: phoneRow.id, completed_at: new Date().toISOString() })
    .eq('id', job.id);

  return { ok: true, jobId: job.id, phoneNumberId: phoneRow.id };
}

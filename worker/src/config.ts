import { logger } from '../../lib/logger';

/**
 * Every environment variable this service needs to actually work, read
 * once at startup and validated eagerly — a missing one should fail the
 * process immediately (and loudly, in the startup logs Railway shows) not
 * surface as a confusing error the first time a real call comes in.
 *
 * Shares the exact same variable names as the Next.js app
 * (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY,
 * TWILIO_*) since this service is configured as a second deployment of
 * the same project, not a separate one with its own naming — see
 * worker/README.md for the exact Railway environment variable list.
 */
export interface WorkerConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

const REQUIRED_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const;

export function loadConfig(): WorkerConfig {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    logger.error('worker_config_missing_env', { missing: missing.join(', ') });
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return {
    port: Number(process.env.PORT) || 8080,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    openaiApiKey: process.env.OPENAI_API_KEY!,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!
  };
}

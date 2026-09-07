import OpenAI from 'openai';
import { OpenAIRealtimeWS } from 'openai/beta/realtime/ws';
import { logger } from './logger';

export interface RealtimeDiagnosticResult {
  authenticated: boolean;
  realtimeModelAccessible: string | null;
  websocketConnected: boolean;
  functionCallingConfigured: boolean;
  error: string | null;
  timings: { modelsListMs?: number; websocketMs?: number; sessionUpdateMs?: number };
}

// In the order we'd actually want to use one — the flagship realtime
// model first, its mini/cheaper sibling as a fallback signal only.
const CANDIDATE_REALTIME_MODELS = [
  'gpt-4o-realtime-preview-2024-12-17',
  'gpt-4o-realtime-preview',
  'gpt-4o-mini-realtime-preview-2024-12-17',
  'gpt-4o-mini-realtime-preview'
] as const;

const HANDSHAKE_TIMEOUT_MS = 10_000;

/** Strips anything that looks like a bearer token before an error message is logged or returned — defense in depth on top of the SDK never embedding the key in its own error text. */
function redact(message: string): string {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-[redacted]');
}

function describeError(err: any, context: string): string {
  const status = err?.status ?? err?.response?.status;
  const message = err?.message ?? err?.error?.message ?? String(err);
  return `[${context}]${status ? ` HTTP ${status}` : ''}: ${redact(message)}`;
}

/**
 * Verifies OpenAI Realtime access end to end, without ever exposing
 * OPENAI_API_KEY: authenticates against the REST API, opens a real
 * WebSocket session, and confirms the server accepts a function-calling
 * tool definition — the same three things the voice worker needs to
 * actually work. Returns exactly what succeeded and, on any failure, the
 * verbatim (key-redacted) provider error rather than a generic message,
 * so a real problem is never mistaken for a pass.
 */
export async function runRealtimeDiagnostic(): Promise<RealtimeDiagnosticResult> {
  const result: RealtimeDiagnosticResult = {
    authenticated: false,
    realtimeModelAccessible: null,
    websocketConnected: false,
    functionCallingConfigured: false,
    error: null,
    timings: {}
  };

  if (!process.env.OPENAI_API_KEY) {
    result.error = 'OPENAI_API_KEY is not set in this environment.';
    return result;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const t0 = Date.now();
    const models = await client.models.list();
    result.timings.modelsListMs = Date.now() - t0;
    result.authenticated = true;
    const ids = new Set(models.data.map((m) => m.id));
    result.realtimeModelAccessible = CANDIDATE_REALTIME_MODELS.find((m) => ids.has(m)) ?? null;
  } catch (err: any) {
    result.error = describeError(err, 'models.list (authentication check)');
    logger.error('realtime_diagnostic_auth_failed', { message: result.error });
    return result;
  }

  // models.list() doesn't reliably enumerate every model an account can
  // actually reach (Realtime access can be account-gated separately) — the
  // real test is whether the websocket handshake itself succeeds, so this
  // proceeds even if none of the candidates showed up above.
  const modelToTry = result.realtimeModelAccessible ?? CANDIDATE_REALTIME_MODELS[0];

  return new Promise((resolve) => {
    let settled = false;
    const finish = (patch?: Partial<RealtimeDiagnosticResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      Object.assign(result, patch);
      try {
        rt.close();
      } catch {
        // already closed/never opened — nothing to do
      }
      resolve(result);
    };

    const timeoutHandle = setTimeout(() => {
      finish({ error: result.error ?? `Timed out after ${HANDSHAKE_TIMEOUT_MS}ms waiting for a Realtime session (model: ${modelToTry}).` });
    }, HANDSHAKE_TIMEOUT_MS);

    let rt: OpenAIRealtimeWS;
    try {
      rt = new OpenAIRealtimeWS({ model: modelToTry }, client);
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      result.error = describeError(err, 'websocket construction');
      resolve(result);
      return;
    }

    const wsStartedAt = Date.now();

    rt.on('session.created', () => {
      result.websocketConnected = true;
      result.timings.websocketMs = Date.now() - wsStartedAt;
      if (!result.realtimeModelAccessible) result.realtimeModelAccessible = modelToTry;

      const updateStartedAt = Date.now();
      rt.send({
        type: 'session.update',
        session: {
          tools: [
            {
              type: 'function',
              name: 'diagnostic_ping',
              description: 'Diagnostic-only placeholder tool used to confirm function calling is accepted by this session. Never actually called.',
              parameters: { type: 'object', properties: {} }
            }
          ],
          tool_choice: 'auto'
        }
      });

      rt.on('session.updated', (updated) => {
        result.timings.sessionUpdateMs = Date.now() - updateStartedAt;
        const tools = (updated.session as any)?.tools;
        finish({ functionCallingConfigured: Array.isArray(tools) && tools.some((t: any) => t.name === 'diagnostic_ping') });
      });
    });

    rt.on('error', (err: any) => {
      finish({ error: describeError(err, 'realtime websocket') });
    });
  });
}

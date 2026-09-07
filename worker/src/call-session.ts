import type { WebSocket } from 'ws';
import { logger } from '../../lib/logger';
import { getOrCreateCallConfigSnapshot, type CallConfigSnapshot } from '../../lib/call-config-snapshot';
// The whole point of this worker: reuse the exact same tool dispatcher
// and tool schema live Vapi calls and /practice already use — never a
// second implementation of what a tool does or how it's described.
import { dispatchTool } from '../../lib/ava-dispatcher';
import { VAPI_TOOLS } from '../../lib/vapi-tools';
import { attachTwilioStreamHandler } from './twilio-stream';
import { RealtimeSession, type RealtimeTool } from './realtime-session';
import { upsertCallStart, markCallEnded } from './call-lifecycle';
import type { WorkerConfig } from './config';

// This prototype only offers the caller the one tool named in its own
// instructions (buildPrototypeInstructions below) — filtered from the
// same VAPI_TOOLS list Vapi's assistant and /practice draw from, not a
// separately typed-out copy of find_menu_item's schema.
const PROTOTYPE_TOOLS: RealtimeTool[] = VAPI_TOOLS.filter((t) => t.name === 'find_menu_item');

const TONE_CLAUSES: Record<string, string> = {
  friendly: 'warm and friendly',
  professional: 'polished and professional',
  concise: 'brief and to the point — do not over-explain'
};

/**
 * Deliberately NOT the full production system prompt (lib/vapi-tools.ts's
 * buildSystemPrompt, used for Vapi's persistent assistant) — that prompt
 * references tools this prototype hasn't wired yet (get_business_knowledge,
 * check_business_hours, save_lead, transfer_call, the rest of ordering),
 * and handing the model instructions for tools it doesn't actually have
 * access to in this session risks it trying to call them anyway. This
 * stays honest about exactly what this call can do, while still driven by
 * the business's real, frozen config — not a hardcoded placeholder.
 */
function buildPrototypeInstructions(snapshot: CallConfigSnapshot): string {
  const tone = TONE_CLAUSES[snapshot.aiEmployeeSettings.tone ?? 'friendly'] ?? TONE_CLAUSES.friendly;
  return `You are the virtual receptionist for ${snapshot.business.name}, a restaurant. Speak in a ${tone} tone. This is an early prototype of a new phone system: you can look up menu items with find_menu_item, but you cannot yet take orders, quote final prices, book anything, transfer calls, or send texts — if the caller asks for any of those, say so honestly and let them know a person will follow up. Never invent a menu item, price, or availability that find_menu_item didn't actually return. Keep responses brief.`;
}

/**
 * Owns one call end to end: accepts the Twilio Media Stream events
 * (worker/src/twilio-stream.ts), resolves the business and loads its
 * immutable call-config snapshot (lib/call-config-snapshot.ts — the same
 * one live calls and practice mode use, keyed here by Twilio's callSid),
 * opens and tears down the matching OpenAI Realtime session
 * (worker/src/realtime-session.ts), and forwards caller audio between
 * them.
 */
export function handleCallSession(ws: WebSocket, config: WorkerConfig): void {
  let realtime: RealtimeSession | null = null;
  let sessionStarting = false;
  let callId: string | null = null;

  attachTwilioStreamHandler(ws, {
    onStart: (msg) => {
      const businessId = msg.start.customParameters?.businessId;
      if (!businessId) {
        // No way to know whose business logic to run — refuse rather
        // than guess. Real business isolation depends on this staying a
        // hard stop, not a fallback to some default.
        logger.error('call_session_missing_business_id', { streamSid: msg.start.streamSid });
        ws.close();
        return;
      }

      sessionStarting = true;
      void (async () => {
        // Independent of each other — run together rather than one after
        // the other to keep the caller's wait for the greeting shorter.
        const [snapshotResult, callRowId] = await Promise.all([
          getOrCreateCallConfigSnapshot({ businessId, providerCallId: msg.start.callSid }).then(
            (value) => ({ ok: true as const, value }),
            (err: any) => ({ ok: false as const, err })
          ),
          upsertCallStart({
            businessId,
            providerCallId: msg.start.callSid,
            fromNumber: msg.start.customParameters?.from,
            toNumber: msg.start.customParameters?.to
          })
        ]);
        callId = callRowId;

        if (!snapshotResult.ok) {
          logger.error('call_session_snapshot_load_failed', { streamSid: msg.start.streamSid, businessId, errorMessage: snapshotResult.err.message });
          ws.close();
          return;
        }
        const snapshot: CallConfigSnapshot = snapshotResult.value;

        logger.info('call_session_config_loaded', {
          streamSid: msg.start.streamSid,
          businessId,
          businessName: snapshot.business.name,
          runtime: snapshot.runtime
        });

        const session = new RealtimeSession({
          apiKey: config.openaiApiKey,
          instructions: buildPrototypeInstructions(snapshot),
          streamSid: msg.start.streamSid,
          twilioWs: ws,
          tools: PROTOTYPE_TOOLS,
          onFunctionCall: async (name, argsJson) => {
            let params: Record<string, any> = {};
            try {
              params = argsJson ? JSON.parse(argsJson) : {};
            } catch (err: any) {
              logger.error('call_session_function_call_bad_json', { streamSid: msg.start.streamSid, tool: name, errorMessage: err.message });
            }
            const result = await dispatchTool(name, params, {
              businessId,
              mode: 'live',
              callId,
              providerCallId: msg.start.callSid
            });
            return JSON.stringify(result);
          },
          onError: () => {
            try {
              ws.close();
            } catch {
              // already closing
            }
          },
          onReady: () => {
            logger.info('call_session_first_message_triggered', { streamSid: msg.start.streamSid });
            session.triggerFirstMessage();
          }
        });
        realtime = session;
        sessionStarting = false;
      })();
    },

    onMedia: (payloadBase64) => {
      // Twilio starts sending media almost immediately after "start" —
      // frames that arrive before the snapshot load + Realtime handshake
      // finish are dropped rather than queued, same as RealtimeSession's
      // own readiness gate. Acceptable for this prototype's first
      // controlled call; revisit with a short pre-buffer if real calls
      // show a clipped opening.
      realtime?.sendCallerAudio(payloadBase64);
    },

    onStop: () => {
      realtime?.close();
      realtime = null;
      if (callId) void markCallEnded(callId);
    }
  });

  ws.on('close', () => {
    if (sessionStarting) {
      logger.warn('call_session_closed_during_startup', {});
    }
    realtime?.close();
    realtime = null;
    // Twilio normally sends "stop" before closing the socket, so this is
    // usually a no-op double-mark (idempotent — it's just an update to
    // the same row) — kept as a safety net for a connection that drops
    // without a clean "stop" ever arriving.
    if (callId) void markCallEnded(callId);
  });
}

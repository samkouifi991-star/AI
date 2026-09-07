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
        let snapshot: CallConfigSnapshot;
        try {
          snapshot = await getOrCreateCallConfigSnapshot({ businessId, providerCallId: msg.start.callSid });
        } catch (err: any) {
          logger.error('call_session_snapshot_load_failed', { streamSid: msg.start.streamSid, businessId, errorMessage: err.message });
          ws.close();
          return;
        }

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
            // callId is null — no `calls` row exists for this call yet
            // (that lands in the next milestone); dispatchTool's
            // find_menu_item case doesn't read it, only businessId.
            const result = await dispatchTool(name, params, {
              businessId,
              mode: 'live',
              callId: null,
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
    }
  });

  ws.on('close', () => {
    if (sessionStarting) {
      logger.warn('call_session_closed_during_startup', {});
    }
    realtime?.close();
    realtime = null;
  });
}

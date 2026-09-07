import type { WebSocket } from 'ws';
import { logger } from '../../lib/logger';
import { attachTwilioStreamHandler } from './twilio-stream';
import { RealtimeSession } from './realtime-session';
import type { WorkerConfig } from './config';

/**
 * Owns one call end to end: accepts the Twilio Media Stream events
 * (worker/src/twilio-stream.ts), opens and tears down the matching
 * OpenAI Realtime session (worker/src/realtime-session.ts), and forwards
 * caller audio between them. Business resolution, the immutable config
 * snapshot, the first message, and the shared dispatchTool() wiring land
 * here in later milestones — this one proves the audio path itself
 * works: Twilio media in, a real Realtime session configured and
 * receiving it, Realtime audio out back to Twilio.
 */
export function handleCallSession(ws: WebSocket, config: WorkerConfig): void {
  let realtime: RealtimeSession | null = null;

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

      realtime = new RealtimeSession({
        apiKey: config.openaiApiKey,
        // Placeholder — replaced by the business's real call-config
        // snapshot (instructions, hours, voice) in the next milestone.
        instructions: 'You are a helpful phone receptionist for a restaurant. Keep responses brief and friendly.',
        streamSid: msg.start.streamSid,
        twilioWs: ws,
        tools: [],
        onFunctionCall: async () => JSON.stringify({ result: 'Tool calling is wired in a later milestone.' }),
        onError: () => {
          try {
            ws.close();
          } catch {
            // already closing
          }
        }
      });
    },

    onMedia: (payloadBase64) => {
      realtime?.sendCallerAudio(payloadBase64);
    },

    onStop: () => {
      realtime?.close();
      realtime = null;
    }
  });

  ws.on('close', () => {
    realtime?.close();
    realtime = null;
  });
}

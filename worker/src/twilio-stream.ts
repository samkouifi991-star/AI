import type { WebSocket } from 'ws';
import { logger } from '../../lib/logger';

// Twilio's Media Streams protocol — JSON text frames over the WebSocket
// it opens to us when a call's TwiML includes <Connect><Stream>. Only the
// fields this worker actually reads are typed; Twilio sends more per
// message than this.
export interface TwilioConnectedMessage {
  event: 'connected';
  protocol: string;
  version: string;
}

export interface TwilioStartMessage {
  event: 'start';
  sequenceNumber: string;
  start: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
    // How business resolution reaches the worker: the TwiML that opens
    // this stream (app/api/twilio/voice/route.ts) sets <Parameter
    // name="businessId" value="..."/> — Twilio echoes it back here.
    customParameters?: Record<string, string>;
  };
}

export interface TwilioMediaMessage {
  event: 'media';
  sequenceNumber: string;
  streamSid: string;
  media: { track: string; chunk: string; timestamp: string; payload: string };
}

export interface TwilioStopMessage {
  event: 'stop';
  sequenceNumber: string;
  streamSid: string;
  stop: { accountSid: string; callSid: string };
}

export interface TwilioMarkMessage {
  event: 'mark';
  streamSid: string;
  mark: { name: string };
}

export type TwilioStreamMessage = TwilioConnectedMessage | TwilioStartMessage | TwilioMediaMessage | TwilioStopMessage | TwilioMarkMessage;

export interface TwilioStreamHandlers {
  onStart?: (msg: TwilioStartMessage) => void;
  /** Base64 μ-law 8kHz audio payload, one chunk per Twilio "media" frame. */
  onMedia?: (payloadBase64: string, msg: TwilioMediaMessage) => void;
  onStop?: (msg: TwilioStopMessage) => void;
  onMark?: (msg: TwilioMarkMessage) => void;
}

/**
 * Parses and dispatches Twilio's Media Stream protocol for one WebSocket
 * connection. Deliberately just parsing + callbacks here — what actually
 * happens with the audio (bridging to OpenAI Realtime) is wired in by the
 * caller via `handlers`, kept separate so this file's only job is
 * correctly speaking Twilio's protocol, testable on its own without a
 * real OpenAI connection.
 */
export function attachTwilioStreamHandler(ws: WebSocket, handlers: TwilioStreamHandlers): void {
  let streamSid: string | undefined;
  let callSid: string | undefined;
  let mediaFrameCount = 0;

  ws.on('message', (raw) => {
    let msg: TwilioStreamMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err: any) {
      logger.error('twilio_stream_invalid_json', { errorMessage: err.message });
      return;
    }

    switch (msg.event) {
      case 'connected':
        logger.info('twilio_stream_connected', { protocol: msg.protocol, version: msg.version });
        break;

      case 'start':
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        logger.info('twilio_stream_started', {
          streamSid,
          callSid,
          businessId: msg.start.customParameters?.businessId,
          encoding: msg.start.mediaFormat.encoding,
          sampleRate: msg.start.mediaFormat.sampleRate
        });
        handlers.onStart?.(msg);
        break;

      case 'media':
        mediaFrameCount += 1;
        handlers.onMedia?.(msg.media.payload, msg);
        break;

      case 'stop':
        logger.info('twilio_stream_stopped', { streamSid, callSid, mediaFramesReceived: mediaFrameCount });
        handlers.onStop?.(msg);
        break;

      case 'mark':
        handlers.onMark?.(msg);
        break;

      default:
        logger.warn('twilio_stream_unknown_event', { event: (msg as any).event });
    }
  });

  ws.on('close', (code, reason) => {
    logger.info('twilio_stream_ws_closed', { streamSid, callSid, code, reason: reason.toString() });
  });

  ws.on('error', (err: any) => {
    logger.error('twilio_stream_ws_error', { streamSid, callSid, errorMessage: err.message });
  });
}

/** Sends one outbound audio chunk to Twilio — base64 audio in whatever format the stream was started with (μ-law 8kHz, matched 1:1 with OpenAI Realtime's own g711_ulaw option, so no transcoding happens anywhere in this bridge). */
export function sendTwilioMedia(ws: WebSocket, streamSid: string, payloadBase64: string): void {
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: payloadBase64 } }));
}

/** Tells Twilio to drop any audio it has queued to play but hasn't yet — used for barge-in, when the caller starts talking over Ava. */
export function sendTwilioClear(ws: WebSocket, streamSid: string): void {
  ws.send(JSON.stringify({ event: 'clear', streamSid }));
}

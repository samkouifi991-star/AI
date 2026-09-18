import OpenAI from 'openai';
// Non-beta import: the GA Realtime API (gpt-realtime and later) lives at
// openai/realtime/*, not openai/beta/realtime/* — the beta path still
// exists in the SDK for the old preview-snapshot models, but its session
// schema is the old flat one (modalities/input_audio_format/...) and does
// not speak for gpt-realtime-2.1. See the schema comment on DEFAULT_MODEL
// below for what actually changed.
import { OpenAIRealtimeWS } from 'openai/realtime/ws';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';
import type { WebSocket as TwilioWebSocket } from 'ws';
import { logger } from '../../lib/logger';
import { sendTwilioMedia } from './twilio-stream';

export interface RealtimeTool {
  name: string;
  description: string;
  parameters: unknown;
}

/**
 * The subset of OpenAIRealtimeWS this class actually uses. Narrowed to
 * an interface (rather than depending on the concrete class directly) so
 * a test can inject a fake transport and exercise the event-correlation
 * logic below — the trickiest part of this bridge, and the part least
 * safe to ship unverified — without opening a real network connection.
 * See worker/src/realtime-session.test.ts.
 */
export interface RealtimeTransport {
  on<T extends RealtimeServerEvent['type'] | 'error'>(
    event: T,
    listener: (event: T extends 'error' ? any : Extract<RealtimeServerEvent, { type: T }>) => void
  ): void;
  send(event: RealtimeClientEvent): void;
  close(): void;
}

export interface RealtimeSessionOptions {
  apiKey: string;
  model?: string;
  instructions: string;
  voice?: string;
  tools?: RealtimeTool[];
  streamSid: string;
  twilioWs: TwilioWebSocket;
  /** Called when the model finishes emitting a function call's arguments. Must resolve to the tool's result — a JSON string — which is fed back into the conversation. */
  onFunctionCall: (name: string, argsJson: string) => Promise<string>;
  onError?: (err: Error) => void;
  /** Fires once the session is configured and ready to speak — the hook worker/src/call-session.ts uses to trigger the greeting via triggerFirstMessage(). */
  onReady?: () => void;
  /** Test-only seam — defaults to a real OpenAIRealtimeWS connection. */
  transport?: RealtimeTransport;
}

// gpt-realtime-2.1 is the current GA Realtime model (confirmed against the
// `openai` npm package's own published type definitions — this sandbox
// cannot reach api.openai.com to verify anything live, so the SDK's types
// are the ground truth used here, not memory or a guess). The GA API
// changed the session.update schema from the old preview shape this file
// used to send:
//   - session now needs an explicit `type: 'realtime'` (was implicit)
//   - `modalities` -> `output_modalities`, and only `['audio']` is valid
//     (the old `['audio', 'text']` is rejected: GA no longer allows both)
//   - `voice`, `input_audio_format`/`output_audio_format`, and
//     `turn_detection` moved off the top level and into a nested `audio:
//     { input: {...}, output: {...} }` object
//   - audio format is now an object (`{ type: 'audio/pcmu' }` for G.711
//     μ-law) instead of the old flat string `'g711_ulaw'`
//   - output events renamed: `response.audio.delta` ->
//     `response.output_audio.delta`, `response.audio_transcript.done` ->
//     `response.output_audio_transcript.done`
// Tool definitions, conversation.item.create/function_call_output,
// response.create, response.output_item.added, and
// response.function_call_arguments.done are unchanged.
//
// Before the real test call, hit the deployed app's
// /api/admin/verify-realtime (it runs on Vercel, which isn't
// network-restricted the way this sandbox is) and confirm it reports this
// model as accessible. If a different model needs to be used, set
// OPENAI_REALTIME_MODEL in Railway's env vars rather than editing this
// file — config.ts reads it as an override, so a wrong default here never
// requires a redeploy to fix.
const DEFAULT_MODEL = 'gpt-realtime-2.1';

/**
 * One OpenAI Realtime session per call, bridging exactly two things: raw
 * μ-law audio both directions (g711_ulaw is a native Realtime format, so
 * Twilio's own encoding is relayed as-is — no resampling anywhere in this
 * path), and function calls, dispatched through whatever `onFunctionCall`
 * the caller wires up (worker/src/call-session.ts routes this straight
 * into the shared dispatchTool(), never a reimplementation).
 */
export class RealtimeSession {
  private rt: RealtimeTransport;
  private twilioWs: TwilioWebSocket;
  private streamSid: string;
  private ready = false;
  private pendingFunctionCallNames = new Map<string, string>(); // call_id -> function name
  private transcriptLines: string[] = [];

  constructor(options: RealtimeSessionOptions) {
    this.twilioWs = options.twilioWs;
    this.streamSid = options.streamSid;

    if (options.transport) {
      this.rt = options.transport;
    } else {
      const client = new OpenAI({ apiKey: options.apiKey });
      this.rt = new OpenAIRealtimeWS({ model: options.model ?? DEFAULT_MODEL }, client);
    }

    this.rt.on('session.created', () => {
      this.rt.send({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: options.instructions,
          output_modalities: ['audio'],
          audio: {
            input: {
              format: { type: 'audio/pcmu' },
              turn_detection: { type: 'server_vad', create_response: true },
              // Runs the caller's audio through a separate ASR pass
              // (independent of the conversational model) purely so
              // there's a caller-side transcript to save alongside the
              // assistant's own response.output_audio_transcript.done
              // text below. Not "recording" in the excluded-scope sense:
              // no audio is stored, only text.
              transcription: { model: 'whisper-1' }
            },
            output: {
              format: { type: 'audio/pcmu' },
              voice: options.voice ?? 'alloy'
            }
          },
          tools: (options.tools ?? []).map((t) => ({ type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters })),
          tool_choice: options.tools && options.tools.length > 0 ? 'auto' : 'none'
        }
      });
    });

    this.rt.on('session.updated', () => {
      const wasReady = this.ready;
      this.ready = true;
      logger.info('realtime_session_ready', { streamSid: this.streamSid });
      if (!wasReady) options.onReady?.();
    });

    this.rt.on('response.output_audio.delta', (event) => {
      sendTwilioMedia(this.twilioWs, this.streamSid, event.delta);
    });

    // Two independent transcript sources, both appended in the order
    // their "done" event arrives — close enough to conversational order
    // for a first-prototype call record, without trying to interleave by
    // timestamp.
    this.rt.on('response.output_audio_transcript.done', (event) => {
      if (event.transcript) this.transcriptLines.push(`Ava: ${event.transcript}`);
    });
    this.rt.on('conversation.item.input_audio_transcription.completed', (event) => {
      if (event.transcript) this.transcriptLines.push(`Caller: ${event.transcript}`);
    });

    // Function-call items arrive in two parts: this event names which
    // function is being called (correlated by call_id — the arguments
    // event below doesn't carry the name at all), then the arguments
    // stream in and complete separately.
    this.rt.on('response.output_item.added', (event) => {
      if (event.item.type === 'function_call' && event.item.call_id && event.item.name) {
        this.pendingFunctionCallNames.set(event.item.call_id, event.item.name);
      }
    });

    this.rt.on('response.function_call_arguments.done', (event) => {
      const name = this.pendingFunctionCallNames.get(event.call_id);
      this.pendingFunctionCallNames.delete(event.call_id);
      if (!name) {
        logger.error('realtime_function_call_unknown_name', { streamSid: this.streamSid, callId: event.call_id });
        return;
      }
      void this.handleFunctionCall(name, event.arguments, event.call_id, options.onFunctionCall);
    });

    this.rt.on('error', (err: any) => {
      logger.error('realtime_session_error', { streamSid: this.streamSid, errorMessage: err?.message ?? String(err) });
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  }

  private async handleFunctionCall(name: string, argsJson: string, callId: string, onFunctionCall: RealtimeSessionOptions['onFunctionCall']) {
    logger.info('realtime_function_call_started', { streamSid: this.streamSid, tool: name });
    let output: string;
    try {
      output = await onFunctionCall(name, argsJson);
    } catch (err: any) {
      logger.error('realtime_function_call_failed', { streamSid: this.streamSid, tool: name, errorMessage: err.message });
      output = JSON.stringify({ result: "I'm having trouble with that right now." });
    }

    this.rt.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output }
    });
    this.rt.send({ type: 'response.create' });
  }

  /** Forwards one Twilio "media" frame's base64 μ-law payload straight into the Realtime input buffer. Dropped (not queued) if the session isn't configured yet — acceptable for this prototype's first controlled test call, revisited if real calls show clipped openings. */
  sendCallerAudio(payloadBase64: string): void {
    if (!this.ready) return;
    this.rt.send({ type: 'input_audio_buffer.append', audio: payloadBase64 });
  }

  /** Has the assistant speak first, once the session is configured — see worker/src/call-session.ts. */
  triggerFirstMessage(): void {
    this.rt.send({ type: 'response.create' });
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Plain-text transcript accumulated so far, one line per completed turn — null once there's nothing to save (nothing was transcribed, e.g. the call ended before either side finished a turn). */
  getTranscript(): string | null {
    return this.transcriptLines.length > 0 ? this.transcriptLines.join('\n') : null;
  }

  close(): void {
    try {
      this.rt.close();
    } catch {
      // already closed — nothing to do
    }
  }
}

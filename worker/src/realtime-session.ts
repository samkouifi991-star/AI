import OpenAI from 'openai';
import { OpenAIRealtimeWS } from 'openai/beta/realtime/ws';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/beta/realtime/realtime';
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
  /** Test-only seam — defaults to a real OpenAIRealtimeWS connection. */
  transport?: RealtimeTransport;
}

const DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

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
          modalities: ['audio', 'text'],
          instructions: options.instructions,
          voice: (options.voice as any) ?? 'alloy',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: { type: 'server_vad', create_response: true },
          tools: (options.tools ?? []).map((t) => ({ type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters })),
          tool_choice: options.tools && options.tools.length > 0 ? 'auto' : 'none'
        }
      });
    });

    this.rt.on('session.updated', () => {
      this.ready = true;
      logger.info('realtime_session_ready', { streamSid: this.streamSid });
    });

    this.rt.on('response.audio.delta', (event) => {
      sendTwilioMedia(this.twilioWs, this.streamSid, event.delta);
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

  close(): void {
    try {
      this.rt.close();
    } catch {
      // already closed — nothing to do
    }
  }
}

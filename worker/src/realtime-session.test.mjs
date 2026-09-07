// Not a committed test suite (no test runner is configured for this
// project yet — see Phase 0's report on that) — a one-shot verification
// script for the trickiest logic in realtime-session.ts, run manually via
// `node --experimental-strip-types worker/src/realtime-session.test.mjs`
// during development. Exercises the full event sequence a real call
// produces using a fake RealtimeTransport (no network) and a fake Twilio
// WebSocket, and asserts on both what gets sent to "OpenAI" and what gets
// sent back to "Twilio".
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RealtimeSession } from './realtime-session.ts';

class FakeTransport extends EventEmitter {
  sent = [];
  send(event) {
    this.sent.push(event);
  }
  close() {}
  on(event, listener) {
    return super.on(event, listener);
  }
}

class FakeTwilioWs extends EventEmitter {
  sentFrames = [];
  send(data) {
    this.sentFrames.push(JSON.parse(data));
  }
}

async function run() {
  const transport = new FakeTransport();
  const twilioWs = new FakeTwilioWs();
  const functionCallLog = [];

  let onReadyFired = 0;
  const session = new RealtimeSession({
    apiKey: 'unused-fake-key',
    instructions: 'Test instructions',
    streamSid: 'MZ_test',
    twilioWs,
    tools: [{ name: 'find_menu_item', description: 'Find a menu item', parameters: { type: 'object', properties: {} } }],
    onFunctionCall: async (name, argsJson) => {
      functionCallLog.push({ name, argsJson });
      return JSON.stringify({ result: 'found', matches: [{ name: 'Cheeseburger' }] });
    },
    onReady: () => {
      onReadyFired += 1;
      session.triggerFirstMessage();
    },
    transport
  });

  // 1. session.created -> session.update must be sent with the right shape
  transport.emit('session.created', { type: 'session.created', event_id: 'evt_1', session: {} });
  assert.equal(transport.sent.length, 1, 'expected exactly one session.update after session.created');
  const updateEvent = transport.sent[0];
  assert.equal(updateEvent.type, 'session.update');
  assert.equal(updateEvent.session.input_audio_format, 'g711_ulaw');
  assert.equal(updateEvent.session.output_audio_format, 'g711_ulaw');
  assert.equal(updateEvent.session.turn_detection.type, 'server_vad');
  assert.equal(updateEvent.session.tools.length, 1);
  assert.equal(updateEvent.session.tools[0].name, 'find_menu_item');
  assert.equal(updateEvent.session.instructions, 'Test instructions');
  console.log('PASS: session.update sent with correct config after session.created');

  // 2. session.updated -> session becomes ready, onReady fires exactly
  //    once and triggers the greeting (response.create), audio forwards
  transport.emit('session.updated', { type: 'session.updated', event_id: 'evt_2', session: updateEvent.session });
  assert.equal(session.isReady(), true, 'expected session to be ready after session.updated');
  assert.equal(onReadyFired, 1, 'expected onReady to fire exactly once');
  assert.equal(transport.sent.filter((e) => e.type === 'response.create').length, 1, 'expected triggerFirstMessage to have sent one response.create');

  // A second session.updated (shouldn't normally happen, but defensively) must not re-fire onReady or double-greet.
  transport.emit('session.updated', { type: 'session.updated', event_id: 'evt_2b', session: updateEvent.session });
  assert.equal(onReadyFired, 1, 'expected onReady NOT to fire again on a second session.updated');
  console.log('PASS: onReady fires exactly once and triggers exactly one greeting response.create');

  session.sendCallerAudio('ZmFrZS1hdWRpbw==');
  const audioAppendEvents = transport.sent.filter((e) => e.type === 'input_audio_buffer.append');
  assert.equal(audioAppendEvents.length, 1, 'expected caller audio forwarded as input_audio_buffer.append');
  assert.equal(audioAppendEvents[0].audio, 'ZmFrZS1hdWRpbw==');
  console.log('PASS: caller audio forwarded to Realtime after ready');

  // 3. response.audio.delta -> must relay to Twilio as a media frame
  transport.emit('response.audio.delta', { type: 'response.audio.delta', event_id: 'evt_3', delta: 'ZmFrZS1yZXNwb25zZS1hdWRpbw==', item_id: 'item_1', output_index: 0, content_index: 0, response_id: 'resp_1' });
  assert.equal(twilioWs.sentFrames.length, 1, 'expected one Twilio media frame sent');
  assert.equal(twilioWs.sentFrames[0].event, 'media');
  assert.equal(twilioWs.sentFrames[0].streamSid, 'MZ_test');
  assert.equal(twilioWs.sentFrames[0].media.payload, 'ZmFrZS1yZXNwb25zZS1hdWRpbw==');
  console.log('PASS: response.audio.delta relayed to Twilio as a media frame');

  // 4. function-call correlation: output_item.added (name) then
  //    function_call_arguments.done (args, no name) must resolve to the
  //    right tool being invoked, and the result must round-trip back as
  //    conversation.item.create + response.create.
  transport.emit('response.output_item.added', {
    type: 'response.output_item.added',
    event_id: 'evt_4',
    output_index: 0,
    response_id: 'resp_1',
    item: { id: 'item_2', type: 'function_call', call_id: 'call_abc123', name: 'find_menu_item' }
  });
  transport.emit('response.function_call_arguments.done', {
    type: 'response.function_call_arguments.done',
    event_id: 'evt_5',
    call_id: 'call_abc123',
    item_id: 'item_2',
    output_index: 0,
    response_id: 'resp_1',
    arguments: '{"query":"burger"}'
  });

  // handleFunctionCall awaits onFunctionCall — give the microtask queue a turn.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(functionCallLog.length, 1, 'expected onFunctionCall invoked exactly once');
  assert.equal(functionCallLog[0].name, 'find_menu_item', 'expected the call_id -> name correlation to resolve the right tool');
  assert.equal(functionCallLog[0].argsJson, '{"query":"burger"}');

  const outputEvent = transport.sent.find((e) => e.type === 'conversation.item.create');
  assert.ok(outputEvent, 'expected a conversation.item.create carrying the tool result');
  assert.equal(outputEvent.item.type, 'function_call_output');
  assert.equal(outputEvent.item.call_id, 'call_abc123');
  assert.equal(JSON.parse(outputEvent.item.output).matches[0].name, 'Cheeseburger');

  const responseCreateEvents = transport.sent.filter((e) => e.type === 'response.create');
  // One from the greeting (step 2) plus one more to continue the
  // conversation after the tool result -- two total, not a duplicate.
  assert.equal(responseCreateEvents.length, 2, 'expected the greeting response.create plus one more after the tool result');
  console.log('PASS: function-call name/args correlation and result round-trip all correct');

  console.log('\nALL ASSERTIONS PASSED');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

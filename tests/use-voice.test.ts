import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appendTurn, applyTool, createSession, replayStep, type Session } from '../lib/handoff';
import { useVoice } from '../lib/use-voice';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => Promise<void>) | null = null;
  constructor() { FakeSocket.instances.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  async message(value: Record<string, unknown>) { await this.onmessage?.({ data: JSON.stringify(value) }); }
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  async resume() {}
  async close() { this.state = 'closed'; }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(t: TestContext, initial = createSession()) {
  // Render the real hook once to obtain its event callbacks. Rendering state is
  // intentionally not tested here; no DOM, microphone, or external service is used.
  let session = initial;
  let api!: ReturnType<typeof useVoice>;
  let mutations = 0;
  FakeSocket.instances = [];
  for (const [name, value] of [['WebSocket', FakeSocket], ['AudioContext', FakeAudioContext]] as const) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
  }
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const options = {
    session,
    getSession: () => session,
    role: 'sender' as 'sender' | 'receiver',
    onTurn: (role: 'sender' | 'receiver' | 'agent', text: string, id: string) => { session = appendTurn(session, { role, text, id }); },
    onTool: (name: string, args: Record<string, unknown>, id: string) => {
      mutations++;
      const result = applyTool(session, name, args, id);
      session = result.session;
      return result.result;
    },
  };
  function HookHarness() { api = useVoice(options); return null; }
  renderToStaticMarkup(createElement(HookHarness));
  t.after(() => { api.stop(); t.mock.timers.tick(2500); });
  return {
    api, options,
    session: () => session,
    reset: () => { session = createSession(); },
    mutations: () => mutations,
    async connect() {
      const starting = api.start({ microphone: false, accessCode: 'test-only' });
      await flush();
      const socket = FakeSocket.instances.at(-1)!;
      assert.ok(socket);
      socket.onopen?.();
      await socket.message({ type: 'session.ready' });
      await socket.message({ type: 'reply.done', status: 'completed' });
      await starting;
      return socket;
    },
  };
}

test('shutdown discards late transcripts and an in-flight plan after the board is reset', async (t) => {
  let releaseAnalysis!: (value: Response) => void;
  let sourceId = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (url === '/api/voice-token') return new Response(JSON.stringify({ token: 'test-token' }));
    assert.equal(url, '/api/analyze');
    sourceId = JSON.parse(String(init?.body)).turnId;
    return new Promise<Response>((resolve) => { releaseAnalysis = resolve; });
  });
  const h = harness(t);
  const socket = await h.connect();
  assert.equal(h.api.sendText('Dr Lee will review the pending result at 3 PM.'), true);
  await flush();
  assert.ok(releaseAnalysis);
  h.api.stop();
  h.reset();
  await socket.message({ type: 'transcript.user', item_id: 'late-human', text: 'Old handoff statement.' });
  await socket.message({ type: 'transcript.agent', reply_id: 'late-agent', text: 'Old handoff response.' });
  releaseAnalysis(new Response(JSON.stringify({ actions: [{ name: 'capture_pending_item', args: { task: 'Review the result', owner: 'Dr Lee', due: '3 PM', sourceTurnIds: [sourceId] } }], reply: 'Please confirm.' })));
  await flush();
  assert.equal(h.session().turns.length, 0);
  assert.equal(h.session().items.length, 0);
  assert.equal(h.mutations(), 0);
  assert.equal(socket.sent.filter((message) => message.type === 'reply.create').length, 0);
  await socket.message({ type: 'session.ended' });
  assert.equal(socket.readyState, 3);
});

test('a role change during analysis uses the committed board and current role for the next prompt', async (t) => {
  let releaseAnalysis!: (value: Response) => void;
  let sourceId = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (url === '/api/voice-token') return new Response(JSON.stringify({ token: 'test-token' }));
    assert.equal(url, '/api/analyze');
    sourceId = JSON.parse(String(init?.body)).turnId;
    return new Promise<Response>((resolve) => { releaseAnalysis = resolve; });
  });
  const h = harness(t, replayStep(createSession('clean'), 0));
  const socket = await h.connect();
  h.api.sendText('I confirm the captured plan.');
  await flush();
  h.options.role = 'receiver';
  releaseAnalysis(new Response(JSON.stringify({
    actions: [{ name: 'record_clarification', args: { itemId: 'item_1', expectedRevision: 1, sourceTurnIds: [sourceId], clarification: 'The sender confirms the captured plan.', reviewed: true } }],
    reply: 'Switch to Receiver, then read back the plan.',
  })));
  await flush();
  assert.equal(h.session().items[0].reviewed, true);
  assert.equal(h.session().items[0].acceptance, null);
  const spokenPrompt = socket.sent.find((message) => message.type === 'reply.create');
  assert.ok(spokenPrompt);
  assert.match(String(spokenPrompt.instructions), /state your name/);
  assert.equal(String(spokenPrompt.instructions).includes('Switch to Receiver'), false);
});

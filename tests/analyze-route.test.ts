import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/analyze/route';
import { appendTurn, createSession, type Session } from '../lib/handoff';

const fakeKey = 'analysis-unit-test-key-not-a-credential';
const fakeAccessCode = 'analysis-demo-only';
let requestIndex = 0;

function sourceSession(): Session {
  return appendTurn(createSession(), {
    id: 'human-source-1', role: 'sender',
    text: 'The scan result is pending. Discharge is waiting for review.',
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return { accessCode: fakeAccessCode, role: 'sender', turnId: 'human-source-1', session: sourceSession(), ...overrides };
}

function request(value: unknown = body(), options: { origin?: string; raw?: boolean; ip?: string } = {}): NextRequest {
  return new NextRequest('https://carethread.test/api/analyze', {
    method: 'POST',
    headers: {
      origin: options.origin ?? 'https://carethread.test', host: 'carethread.test',
      'content-type': 'application/json', 'x-forwarded-for': options.ip ?? `198.51.100.${++requestIndex}`,
    },
    body: options.raw ? String(value) : JSON.stringify(value),
  });
}

async function environment(overrides: Record<string, string | undefined>, work: () => Promise<void>): Promise<void> {
  const settings = { NODE_ENV: 'production', ASSEMBLYAI_API_KEY: fakeKey, DEMO_ACCESS_CODE: fakeAccessCode, ...overrides };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await work(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const capture = (turnId = 'human-source-1') => ({
  name: 'capture_pending_item',
  arguments: {
    task: 'Review the scan result', owner: null, due: null,
    condition: 'Discharge is waiting for review', uncertainty: 'The scan result is pending',
    sourceTurnIds: [turnId],
  },
});

function providerResponse(actions: unknown[] = [capture()], question = 'Who will review the scan result?') {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actions, question }) } }], privateProviderField: fakeKey }), { status: 200 });
}

test('analysis gate rejects unauthorized and malformed requests before provider access', async (t) => {
  const neverFetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider access'); });
  const agentSession = appendTurn(createSession(), { id: 'agent-source', role: 'agent', text: 'I guessed the result.' });
  const corruptSession = sourceSession();
  corruptSession.turns[0].time = 'invalid';
  const cases = [
    { name: 'missing key', env: { ASSEMBLYAI_API_KEY: undefined }, expected: 503, req: () => request() },
    { name: 'production requires private gate', env: { DEMO_ACCESS_CODE: undefined }, expected: 503, req: () => request() },
    { name: 'missing code', env: {}, expected: 401, req: () => request(body({ accessCode: undefined })) },
    { name: 'wrong code length', env: {}, expected: 401, req: () => request(body({ accessCode: 'wrong' })) },
    { name: 'wrong code of equal length', env: {}, expected: 401, req: () => request(body({ accessCode: 'x'.repeat(fakeAccessCode.length) })) },
    { name: 'non-string code', env: {}, expected: 401, req: () => request(body({ accessCode: { value: fakeAccessCode } })) },
    { name: 'foreign origin', env: {}, expected: 403, req: () => request(undefined, { origin: 'https://foreign.test' }) },
    { name: 'opaque origin', env: {}, expected: 403, req: () => request(undefined, { origin: 'null' }) },
    { name: 'malformed origin', env: {}, expected: 403, req: () => request(undefined, { origin: 'not-a-url' }) },
    { name: 'invalid JSON', env: {}, expected: 400, req: () => request('{not-json', { raw: true }) },
    { name: 'null body', env: {}, expected: 400, req: () => request(null) },
    { name: 'oversized body', env: {}, expected: 413, req: () => request('x'.repeat(300001), { raw: true }) },
    { name: 'invalid participant role', env: {}, expected: 400, req: () => request(body({ role: 'agent' })) },
    { name: 'corrupt state', env: {}, expected: 400, req: () => request(body({ session: corruptSession })) },
    { name: 'invented human ID', env: {}, expected: 400, req: () => request(body({ turnId: 'invented-source' })) },
    { name: 'wrong human role', env: {}, expected: 400, req: () => request(body({ role: 'receiver' })) },
    { name: 'agent ID presented as human', env: {}, expected: 400, req: () => request(body({ session: agentSession, turnId: 'agent-source' })) },
  ];
  for (const row of cases) {
    await t.test(row.name, async () => {
      await environment(row.env, async () => {
        const response = await POST(row.req());
        assert.equal(response.status, row.expected);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        const result = await response.json();
        assert.equal(typeof result.error, 'string');
        assert.equal('actions' in result, false);
        assert.equal(JSON.stringify(result).includes(fakeKey), false);
        assert.equal(neverFetch.mock.callCount(), 0);
      });
    });
  }
});

test('authorized analysis returns validated proposals without mutating or persisting client state', async (t) => {
  const input = body();
  const before = structuredClone(input);
  const mockedFetch = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), 'https://llm-gateway.assemblyai.com/v1/chat/completions');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), fakeKey);
    assert.equal(init?.cache, 'no-store');
    const payload = JSON.parse(String(init?.body));
    assert.equal(JSON.stringify(payload).includes(fakeAccessCode), false);
    assert.equal(JSON.stringify(payload).includes(fakeKey), false);
    assert.match(payload.messages[1].content, /human-source-1/);
    assert.equal('tools' in payload, false);
    return providerResponse();
  });
  await environment({}, async () => {
    const response = await POST(request(input));
    assert.equal(response.status, 200);
    const plan = await response.json();
    assert.deepEqual(plan.actions, [{ name: capture().name, args: capture().arguments }]);
    assert.equal(typeof plan.reply, 'string');
    assert.equal('session' in plan, false);
    assert.equal(JSON.stringify(plan).includes(fakeKey), false);
    assert.deepEqual(input, before);
    assert.equal(input.session.items.length, 0);
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test('a later invalid action rejects the entire plan without returning a partial mutation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => providerResponse([
    capture(),
    { name: 'revise_item', arguments: { itemId: 'missing-item', expectedRevision: 1, sourceTurnIds: ['human-source-1'], changes: { owner: 'Dr Lee' } } },
  ]));
  const input = body();
  const before = structuredClone(input);
  await environment({}, async () => {
    const response = await POST(request(input));
    assert.equal(response.status, 422);
    assert.equal('actions' in await response.json(), false);
    assert.deepEqual(input, before);
  });
});

test('model output cannot cite invented, older, or agent source statements', async (t) => {
  let session = sourceSession();
  session = appendTurn(session, { id: 'other-human', role: 'sender', text: 'Earlier statement.' });
  session = appendTurn(session, { id: 'agent-source', role: 'agent', text: 'I guessed a result.' });
  let proposedId = '';
  t.mock.method(globalThis, 'fetch', async () => providerResponse([capture(proposedId)]));
  await environment({}, async () => {
    for (const id of ['invented', 'other-human', 'agent-source']) {
      proposedId = id;
      const response = await POST(request(body({ session })));
      assert.equal(response.status, 422);
      assert.equal('actions' in await response.json(), false);
    }
  });
});

test('malformed model output is routed to a sanitized validation error', async (t) => {
  let providerBody = '';
  t.mock.method(globalThis, 'fetch', async () => new Response(providerBody, { status: 200 }));
  await environment({}, async () => {
    for (const value of [
      '{not-json',
      JSON.stringify({ choices: [] }),
      JSON.stringify({ choices: [{ message: { content: 'not a plan' } }] }),
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actions: [{ name: 'authorize_discharge', arguments: { sourceTurnIds: ['human-source-1'] } }], question: fakeKey }) } }] }),
    ]) {
      providerBody = value;
      const response = await POST(request());
      assert.equal(response.status, 422);
      const result = await response.text();
      assert.equal(result.includes(fakeKey), false);
      assert.equal(result.includes('authorize_discharge'), false);
    }
  });
});

test('provider rate limits retain only a bounded retry hint and never provider details', async (t) => {
  let retryAfter = '999';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: fakeKey }), { status: 429, headers: { 'retry-after': retryAfter } }));
  await environment({}, async () => {
    for (const [header, expected] of [['999', 30], ['-5', 3], ['unparseable', 10]] as const) {
      retryAfter = header;
      const response = await POST(request());
      assert.equal(response.status, 429);
      const result = await response.json();
      assert.equal(result.retryAfter, expected);
      assert.equal(JSON.stringify(result).includes(fakeKey), false);
      assert.equal('actions' in result, false);
    }
  });
});

test('non-rate provider errors and thrown network errors do not expose private details', async (t) => {
  let failNetwork = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (failNetwork) throw new Error(`Private network exception: ${fakeKey}`);
    return new Response(JSON.stringify({ detail: fakeKey }), { status: 401 });
  });
  await environment({}, async () => {
    const upstreamFailure = await POST(request());
    assert.equal(upstreamFailure.status, 502);
    assert.equal((await upstreamFailure.text()).includes(fakeKey), false);
    failNetwork = true;
    const networkFailure = await POST(request());
    assert.equal(networkFailure.status, 422);
    assert.equal((await networkFailure.text()).includes(fakeKey), false);
  });
});

test('local request backstop blocks excess analysis before contacting the provider', async (t) => {
  const mockedFetch = t.mock.method(globalThis, 'fetch', async () => providerResponse([], 'Who owns the pending work?'));
  await environment({}, async () => {
    for (let index = 0; index < 20; index++) {
      const response = await POST(request(undefined, { ip: '203.0.113.200' }));
      assert.equal(response.status, 200);
    }
    const limited = await POST(request(undefined, { ip: '203.0.113.200' }));
    assert.equal(limited.status, 429);
    assert.equal(mockedFetch.mock.callCount(), 20);
    assert.equal('actions' in await limited.json(), false);
  });
});

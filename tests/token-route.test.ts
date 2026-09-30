import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/voice-token/route';

const fakeKey = 'unit-test-key-not-a-real-credential';
const fakeAccessCode = 'demo-only-code';
let requestIndex = 0;

function request(body: unknown = { accessCode: fakeAccessCode }, origin = 'https://carethread.test', raw = false): NextRequest {
  return new NextRequest('https://carethread.test/api/voice-token', {
    method: 'POST',
    headers: { origin, host: 'carethread.test', 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++requestIndex}` },
    body: raw ? String(body) : JSON.stringify(body),
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

test('token endpoint enforces access before any upstream request', async (t) => {
  const neverFetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected upstream request in an access-control test'); });
  const cases = [
    { name: 'missing service key', env: { ASSEMBLYAI_API_KEY: undefined }, expected: 503, req: () => request() },
    { name: 'production without demo gate', env: { DEMO_ACCESS_CODE: undefined }, expected: 503, req: () => request() },
    { name: 'missing access code', env: {}, expected: 401, req: () => request({}) },
    { name: 'wrong length code', env: {}, expected: 401, req: () => request({ accessCode: 'wrong' }) },
    { name: 'wrong same-length code', env: {}, expected: 401, req: () => request({ accessCode: 'wrong-demo-key' }) },
    { name: 'non-string code', env: {}, expected: 401, req: () => request({ accessCode: 123 }) },
    { name: 'invalid JSON', env: {}, expected: 400, req: () => request('{not-json', undefined, true) },
    { name: 'null JSON body', env: {}, expected: 400, req: () => request(null) },
    { name: 'foreign origin', env: {}, expected: 403, req: () => request(undefined, 'https://unrelated.test') },
    { name: 'opaque origin', env: {}, expected: 403, req: () => request(undefined, 'null') },
    { name: 'malformed origin', env: {}, expected: 403, req: () => request(undefined, 'not-a-url') },
  ];
  for (const row of cases) {
    await t.test(row.name, async () => {
      await environment(row.env, async () => {
        const response = await POST(row.req());
        assert.equal(response.status, row.expected);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        const body = await response.json();
        assert.equal(typeof body.error, 'string');
        assert.equal('token' in body, false);
        assert.equal(JSON.stringify(body).includes(fakeKey), false);
        assert.equal(neverFetch.mock.callCount(), 0);
      });
    });
  }
});

test('authorized token issuance forwards only a temporary token and capped session duration', async (t) => {
  const mockedFetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://agents.assemblyai.com');
    assert.equal(url.pathname, '/v1/token');
    assert.equal(url.searchParams.get('expires_in_seconds'), '60');
    assert.equal(url.searchParams.get('max_session_duration_seconds'), '180');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${fakeKey}`);
    assert.equal(init?.cache, 'no-store');
    return new Response(JSON.stringify({ token: 'temporary-unit-test-token', internalSecret: fakeKey }), { status: 200 });
  });
  await environment({}, async () => {
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { token: 'temporary-unit-test-token', maxSessionSeconds: 180 });
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test('upstream errors are sanitized and cannot expose service response details', async (t) => {
  const mockedFetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ key: fakeKey, detail: 'private upstream detail' }), { status: 401 }));
  await environment({}, async () => {
    const response = await POST(request());
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.equal(body.includes(fakeKey), false);
    assert.equal(body.includes('private upstream detail'), false);
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test('invalid token payload is rejected even when upstream reports success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ token: 123 }), { status: 200 }));
  await environment({}, async () => {
    const response = await POST(request());
    assert.equal(response.status, 502);
    assert.equal('token' in await response.json(), false);
  });
});

test('network failure is handled without leaking exception details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(`Private provider failure: ${fakeKey}`); });
  await environment({}, async () => {
    const response = await POST(request());
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes(fakeKey), false);
  });
});

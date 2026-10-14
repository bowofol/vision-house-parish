'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createD1 } = require('./helpers/d1-harness');
const { createHandler } = require('../api/register');
const { validateWorkerUrl } = require('../lib/registration-cloudflare');

const workerPromise = import('../cloudflare/registration/src/worker.mjs').then(module => module.default);
const ORIGIN = 'https://church.example';
const ENDPOINT = 'https://registration.fixture-account.workers.dev/api/register';
const SECRET = 'fixture-worker-secret-not-a-real-credential-1234567890';
const ABUSE = 'a'.repeat(64);
const application = { fullName: 'Test Applicant', email: 'test@example.test', phone: '+234 800 000 0000',
  selectedClass: "Believers' Class", preferredContact: 'Email', website: '' };

function setup(t, options = {}) {
  const storage = createD1(options.database || {});
  t.after(storage.close);
  const calls = [];
  const env = { REGISTRATION_ENABLED: 'true', REGISTRATION_ALLOWED_ORIGIN: ORIGIN,
    REGISTRATION_WORKER_SECRET: SECRET, DB: storage.db,
    REGISTRATION_RATE_LIMITER: { async limit({ key }) { calls.push(key); return { success: true }; } }, ...options.env };
  return { ...storage, env, calls };
}
function incoming(body = application, { id = randomUUID(), headers = {}, method = 'POST', path = '/api/register', raw } = {}) {
  return new Request('https://registration.fixture-account.workers.dev' + path, { method,
    headers: { origin: ORIGIN, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json',
      'idempotency-key': id, 'x-registration-abuse-key': ABUSE, ...headers },
    ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) ? { body: raw === undefined ? JSON.stringify(body) : raw } : {}) });
}
async function submit(fixture, body, options) {
  const response = await (await workerPromise).fetch(incoming(body, options), fixture.env);
  return { status: response.status, headers: response.headers, body: await response.json() };
}
function rows(fixture) { return fixture.sqlite.prepare('SELECT * FROM vh_registrations').all(); }

test('Worker stores a verified Pending D1 record and returns only receipt fields', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  const result = await submit(fixture, undefined, { id });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['applicationId', 'message', 'submissionId', 'success']);
  assert.equal(result.body.submissionId, id);
  assert.equal(rows(fixture)[0].phone, application.phone);
  assert.equal(rows(fixture)[0].status, 'Pending');
  assert.equal(rows(fixture)[0].reviewed_at, null);
  assert.match(rows(fixture)[0].created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(fixture.state.sessions, ['first-primary']);
  assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(result.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(result.headers.get('access-control-allow-credentials'), null);
});

for (const [name, change] of [
  ['missing field', { fullName: undefined }], ['unknown field', { extra: 'unexpected' }],
  ['short name', { fullName: 'A' }], ['long name', { fullName: 'a'.repeat(101) }],
  ['formula name', { fullName: '=unsafe()' }], ['control name', { fullName: 'A\nB' }],
  ['invalid email', { email: 'invalid' }], ['missing email contact', { email: '' }],
  ['short phone', { phone: '123' }], ['invalid phone', { phone: 'not-a-number' }],
  ['invalid class', { selectedClass: 'Unknown' }], ['invalid contact', { preferredContact: 'Unknown' }],
  ['honeypot', { website: 'bot' }], ['whitespace honeypot', { website: ' ' }],
  ['non-string field', { phone: 2348000000000 }]
]) {
  test(`Worker rejects ${name} before database or limiter access`, async t => {
    const fixture = setup(t);
    const result = await submit(fixture, { ...application, ...change });
    assert.equal(result.status, 400);
    assert.equal(result.body.retrySafe, true);
    assert.equal(fixture.state.reads, 0);
    assert.equal(fixture.state.batches, 0);
    assert.equal(fixture.calls.length, 0);
  });
}

test('phone contact allows no email and preserves leading zeroes and SQL punctuation as text', async t => {
  const fixture = setup(t);
  const result = await submit(fixture, { ...application, fullName: "O'Brien; SELECT 1; --", email: '',
    preferredContact: 'Phone', phone: '08000000000' });
  assert.equal(result.status, 200);
  assert.equal(rows(fixture)[0].full_name, "O'Brien; SELECT 1; --");
  assert.equal(rows(fixture)[0].phone, '08000000000');
});

test('closed Worker and missing bindings cannot save registrations', async t => {
  for (const env of [{ REGISTRATION_ENABLED: 'false' }, { DB: undefined }, { REGISTRATION_RATE_LIMITER: undefined },
    { REGISTRATION_WORKER_SECRET: undefined }, { REGISTRATION_ALLOWED_ORIGIN: '*' }]) {
    const fixture = setup(t, { env });
    const result = await submit(fixture);
    assert.equal(result.status, 503);
    assert.equal(fixture.state.batches, 0);
    assert.equal(rows(fixture).length, 0);
  }
});

for (const headers of [{ authorization: '' }, { authorization: `Bearer ${SECRET}x` },
  { origin: 'https://untrusted.example' }, { 'idempotency-key': 'not-a-uuid' }, { 'x-registration-abuse-key': 'not-a-digest' }]) {
  test(`Worker rejects unauthorized or invalid envelope ${Object.keys(headers)[0]}`, async t => {
    const fixture = setup(t);
    const result = await submit(fixture, undefined, { headers });
    assert.ok([400, 403].includes(result.status));
    assert.equal(fixture.state.reads, 0);
    assert.equal(fixture.state.batches, 0);
  });
}

test('CORS preflight is restricted to the approved origin, method and headers', async t => {
  const fixture = setup(t);
  const worker = await workerPromise;
  const allowed = await worker.fetch(incoming(undefined, { method: 'OPTIONS', headers: {
    'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,idempotency-key'
  } }), fixture.env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  for (const headers of [{ origin: 'https://bad.example' }, { 'access-control-request-method': 'GET' },
    { 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-untrusted' }]) {
    const denied = await worker.fetch(incoming(undefined, { method: 'OPTIONS', headers }), fixture.env);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(fixture.state.reads, 0);
});

test('Worker has no public read/list route and rejects query URLs', async t => {
  const fixture = setup(t);
  assert.equal((await submit(fixture, undefined, { method: 'GET' })).status, 405);
  assert.equal((await submit(fixture, undefined, { path: '/api/registrations' })).status, 404);
  assert.equal((await submit(fixture, undefined, { path: '/api/register?list=1' })).status, 404);
  assert.equal(fixture.state.reads, 0);
});

test('oversized, malformed, compressed and non-JSON requests are rejected without database access', async t => {
  const fixture = setup(t);
  for (const options of [{ raw: '{' }, { raw: 'x'.repeat(4097) }, { headers: { 'content-length': '999999' } },
    { headers: { 'content-type': 'text/plain' } }, { headers: { 'content-encoding': 'gzip' } }]) {
    const result = await submit(fixture, undefined, options);
    assert.ok([400, 413, 415].includes(result.status));
    assert.equal(result.body.retrySafe, true);
  }
  assert.equal(fixture.state.reads, 0);
});

test('same submission replays its original receipt and never changes Approved status or review date', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  const first = await submit(fixture, undefined, { id });
  fixture.sqlite.prepare("UPDATE vh_registrations SET status = 'Approved', reviewed_at = '2026-10-14' WHERE submission_id = ?").run(id);
  const replay = await submit(fixture, { ...application, fullName: 'TEST  Applicant', email: 'TEST@example.test', phone: '2348000000000' }, { id: id.toUpperCase() });
  assert.deepEqual(replay.body, first.body);
  assert.equal(fixture.state.inserts, 1);
  assert.equal(rows(fixture)[0].status, 'Approved');
  assert.equal(rows(fixture)[0].reviewed_at, '2026-10-14');
  assert.equal(fixture.sqlite.prepare("SELECT count FROM vh_registration_limits WHERE bucket = 'global'").get().count, 1);
});

test('same ID with different details produces a conflict without modifying its row', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  await submit(fixture, undefined, { id });
  const saved = { ...rows(fixture)[0] };
  const result = await submit(fixture, { ...application, selectedClass: 'Baptismal Class' }, { id });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'SUBMISSION_CONFLICT');
  assert.equal(result.body.retrySafe, false);
  assert.deepEqual({ ...rows(fixture)[0] }, saved);
});

test('concurrent same-ID submissions produce exactly one durable row and one receipt', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, () => submit(fixture, undefined, { id })));
  assert.ok(results.every(result => result.status === 200));
  assert.equal(new Set(results.map(result => result.body.applicationId)).size, 1);
  assert.equal(rows(fixture).length, 1);
  assert.equal(fixture.state.inserts, 1);
});

test('concurrent changed-data submissions cannot reuse or overwrite another payload receipt', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  const results = await Promise.all([
    submit(fixture, undefined, { id }), submit(fixture, { ...application, fullName: 'Different Applicant' }, { id })
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(rows(fixture).length, 1);
});

test('durable D1 per-IP limit allows five new IDs and still permits receipt replay', async t => {
  const fixture = setup(t);
  const id = randomUUID();
  const first = await submit(fixture, undefined, { id });
  for (let i = 0; i < 4; i++) assert.equal((await submit(fixture)).status, 200);
  const limited = await submit(fixture);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.retrySafe, true);
  assert.equal(limited.body.retryAfter, 900);
  assert.deepEqual((await submit(fixture, undefined, { id })).body, first.body);
  assert.equal(rows(fixture).length, 5);
});

test('concurrent requests cannot exceed the durable per-IP submission quota', async t => {
  const fixture = setup(t);
  const results = await Promise.all(Array.from({ length: 12 }, () => submit(fixture)));
  assert.equal(results.filter(result => result.status === 200).length, 5);
  assert.equal(results.filter(result => result.status === 429).length, 7);
  assert.equal(rows(fixture).length, 5);
});

test('global quota limits new records across different IP digests', async t => {
  const fixture = setup(t);
  for (let i = 0; i < 100; i++) {
    assert.equal((await submit(fixture, undefined, { headers: { 'x-registration-abuse-key': i.toString(16).padStart(64, '0') } })).status, 200);
  }
  assert.equal((await submit(fixture, undefined, { headers: { 'x-registration-abuse-key': 'f'.repeat(64) } })).status, 429);
  assert.equal(rows(fixture).length, 100);
});

test('expired quota windows reset without deleting registration records', async t => {
  const fixture = setup(t);
  for (let i = 0; i < 5; i++) await submit(fixture);
  fixture.sqlite.exec('UPDATE vh_registration_limits SET window_start = 0');
  assert.equal((await submit(fixture)).status, 200);
  assert.equal(rows(fixture).length, 6);
});

test('edge rate limiter fails closed before D1 access', async t => {
  const fixture = setup(t, { env: { REGISTRATION_RATE_LIMITER: { async limit() { return { success: false }; } } } });
  assert.equal((await submit(fixture)).status, 429);
  assert.equal(fixture.state.reads, 0);
});

test('malformed edge limiter results cannot authorize a database write', async t => {
  for (const result of [undefined, {}, { success: 'true' }, { success: 1 }]) {
    const fixture = setup(t, { env: { REGISTRATION_RATE_LIMITER: { async limit() { return result; } } } });
    assert.equal((await submit(fixture)).status, 429);
    assert.equal(fixture.state.reads, 0);
    assert.equal(fixture.state.batches, 0);
  }
});

for (const fault of ['readFails', 'failBefore', 'failDuring', 'failAfter']) {
  test(`database ${fault} is unconfirmed, never automatically retried, and never leaks errors`, async t => {
    const fixture = setup(t, { database: { [fault]: true } });
    const id = randomUUID();
    const result = await submit(fixture, undefined, { id });
    assert.equal(result.status, 502);
    assert.equal(result.body.retrySafe, false);
    assert.equal(JSON.stringify(result.body).includes('Private'), false);
    assert.equal(rows(fixture).length, fault === 'failAfter' ? 1 : 0);
    if (fault === 'failDuring') assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM vh_registration_limits').get().count, 0);
    fixture.options[fault] = false;
    const recovered = await submit(fixture, undefined, { id }); // Explicit test recovery, never an automatic retry.
    assert.equal(recovered.status, 200);
    assert.equal(rows(fixture).length, 1);
  });
}

for (const [name, transform] of [
  ['missing row', results => { results[1].results = []; }],
  ['wrong application ID', results => { results[1].results[0].application_id = randomUUID(); }],
  ['changed phone', results => { results[1].results[0].phone = '2348000000000'; }],
  ['invalid stored name', results => { results[1].results[0].full_name = ''; }],
  ['extra whitespace', results => { results[1].results[0].full_name += ' '; }],
  ['wrong hash', results => { results[1].results[0].payload_hash = 'b'.repeat(64); }],
  ['premature approval', results => { results[1].results[0].status = 'Approved'; }]
]) {
  test(`corrupted receipt ${name} cannot claim success or a safe retry`, async t => {
    const fixture = setup(t, { database: { transformResults: transform } });
    const result = await submit(fixture);
    assert.equal(result.status, 502);
    assert.equal(result.body.retrySafe, false);
    assert.equal(fixture.state.batches, 1);
    assert.equal(rows(fixture).length, 1);
  });
}

test('migration is additive and reapplying it preserves existing D1 records', async t => {
  const fixture = setup(t);
  await submit(fixture);
  const existing = rows(fixture);
  const fs = require('node:fs');
  fixture.sqlite.exec(fs.readFileSync(require('node:path').join(__dirname, '../cloudflare/registration/migrations/0001_registration.sql'), 'utf8'));
  assert.deepEqual(rows(fixture), existing);
});

async function gateway(fixture, env = {}, fetchImpl) {
  const requests = [];
  const handler = createHandler({ env: { REGISTRATION_ENABLED: 'true', REGISTRATION_BACKEND: 'cloudflare',
    REGISTRATION_ALLOWED_ORIGIN: ORIGIN, REGISTRATION_WORKER_URL: ENDPOINT, REGISTRATION_WORKER_SECRET: SECRET,
    VERCEL: '1', NODE_ENV: 'production', ...env }, upstreamTimeoutMs: 1000,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return fetchImpl ? fetchImpl(url, options) : (await workerPromise).fetch(new Request(url, options), fixture.env);
    } });
  async function post(body = application, id = randomUUID()) {
    let output;
    const response = { statusCode: 200, setHeader() {}, end(value) { output = value; } };
    await handler({ method: 'POST', body, headers: { origin: ORIGIN, 'content-type': 'application/json',
      'idempotency-key': id, 'sec-fetch-site': 'same-origin', 'x-vercel-forwarded-for': '203.0.113.10' } }, response);
    return { status: response.statusCode, body: JSON.parse(output) };
  }
  return { requests, post };
}

test('existing Vercel API integrates with Worker/D1 without any Google credentials', async t => {
  const fixture = setup(t);
  const bridge = await gateway(fixture);
  const result = await bridge.post();
  assert.equal(result.status, 200);
  assert.equal(rows(fixture).length, 1);
  assert.equal(bridge.requests.length, 1);
  const sent = bridge.requests[0];
  assert.equal(sent.url, ENDPOINT);
  assert.equal(sent.options.redirect, 'manual');
  assert.equal(sent.options.headers.Authorization, `Bearer ${SECRET}`);
  assert.match(sent.options.headers['X-Registration-Abuse-Key'], /^[a-f0-9]{64}$/);
  for (const value of [SECRET, ENDPOINT, application.email, application.phone]) assert.equal(JSON.stringify(result.body).includes(value), false);
});

test('closed Vercel/Worker gates and invalid backend selection fail closed', async t => {
  const fixture = setup(t);
  for (const env of [{ REGISTRATION_ENABLED: 'false' }, { REGISTRATION_BACKEND: 'unknown' },
    { REGISTRATION_WORKER_URL: undefined }, { REGISTRATION_WORKER_SECRET: undefined }]) {
    const bridge = await gateway(fixture, env);
    assert.equal((await bridge.post()).status, 503);
    assert.equal(bridge.requests.length, 0);
  }
  fixture.env.REGISTRATION_ENABLED = 'false';
  const closed = await (await gateway(fixture)).post();
  assert.equal(closed.status, 503);
  assert.equal(closed.body.code, 'REGISTRATION_CLOSED');
});

test('Worker database failure reaches the existing browser contract without fallback to Google', async t => {
  const fixture = setup(t, { database: { failAfter: true } });
  const bridge = await gateway(fixture, { APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/fixture/exec',
    APPS_SCRIPT_SHARED_SECRET: SECRET });
  const result = await bridge.post();
  assert.equal(result.status, 502);
  assert.equal(result.body.retrySafe, false);
  assert.equal(rows(fixture).length, 1);
  assert.equal(bridge.requests.length, 1);
  assert.equal(bridge.requests[0].url, ENDPOINT);
});

test('gateway forwards duplicate/conflict and quota outcomes without creating extra D1 rows', async t => {
  const fixture = setup(t);
  const bridge = await gateway(fixture);
  const id = randomUUID();
  const first = await bridge.post(undefined, id);
  assert.deepEqual((await bridge.post(undefined, id)).body, first.body);
  const conflict = await bridge.post({ ...application, selectedClass: 'Baptismal Class' }, id);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(conflict.body.retrySafe, false);
  for (let i = 0; i < 4; i++) await bridge.post();
  const throttled = await bridge.post();
  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.code, 'RATE_LIMITED');
  assert.equal(rows(fixture).length, 5);
});

test('Worker diagnostics never log private driver exceptions or applicant fields', async t => {
  const logs = [];
  t.mock.method(console, 'error', entry => logs.push(JSON.parse(entry)));
  const fixture = setup(t, { database: { failAfter: true } });
  const id = randomUUID();
  await submit(fixture, undefined, { id });
  assert.deepEqual(logs, [{ event: 'registration_worker_failure', stage: 'database_transaction' }]);
  for (const value of [SECRET, ENDPOINT, id, application.fullName, application.email, application.phone, 'Private']) {
    assert.equal(JSON.stringify(logs).includes(value), false);
  }
});

test('a failed Worker diagnostic logger cannot change an uncertain write response', async t => {
  t.mock.method(console, 'error', () => { throw new Error('Logger unavailable.'); });
  const fixture = setup(t, { database: { failAfter: true } });
  const result = await submit(fixture);
  assert.equal(result.status, 502);
  assert.equal(result.body.retrySafe, false);
  assert.equal(rows(fixture).length, 1);
});

test('gateway timeout makes one attempt and cannot automatically switch to Google', async t => {
  const fixture = setup(t);
  let calls = 0;
  const handler = createHandler({ env: { REGISTRATION_ENABLED: 'true', REGISTRATION_BACKEND: 'cloudflare',
    REGISTRATION_ALLOWED_ORIGIN: ORIGIN, REGISTRATION_WORKER_URL: ENDPOINT, REGISTRATION_WORKER_SECRET: SECRET,
    APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/fixture/exec', APPS_SCRIPT_SHARED_SECRET: SECRET,
    VERCEL: '1', NODE_ENV: 'production' }, upstreamTimeoutMs: 20,
    fetchImpl: () => { calls++; return new Promise(() => {}); } });
  let output;
  const response = { statusCode: 200, setHeader() {}, end(value) { output = JSON.parse(value); } };
  await handler({ method: 'POST', body: application, headers: { origin: ORIGIN, 'content-type': 'application/json',
    'idempotency-key': randomUUID(), 'x-vercel-forwarded-for': '203.0.113.10' } }, response);
  assert.equal(response.statusCode, 504);
  assert.equal(output.retrySafe, false);
  assert.equal(calls, 1);
  assert.equal(fixture.state.batches, 0);
});

test('gateway refuses redirects, mismatched receipts, unsafe failures and oversized responses', async t => {
  const fixture = setup(t);
  for (const response of [
    new Response(null, { status: 302, headers: { Location: 'https://untrusted.example' } }),
    new Response('<h1>Private error</h1>', { headers: { 'Content-Type': 'text/html' } }),
    Response.json({ success: true, message: 'Saved.', applicationId: randomUUID(), submissionId: randomUUID() }),
    Response.json({ success: false, message: 'Private error', code: 'DATABASE_ERROR', retrySafe: true }),
    Response.json({ success: true, message: 'x'.repeat(17000) })
  ]) {
    const bridge = await gateway(fixture, {}, async () => response);
    const result = await bridge.post();
    assert.equal(result.status, 502);
    assert.equal(result.body.retrySafe, false);
    assert.equal(bridge.requests.length, 1);
    assert.equal(JSON.stringify(result.body).includes('Private'), false);
  }
});

test('gateway endpoint validation rejects secrets, non-Cloudflare hosts and alternate paths', () => {
  assert.equal(validateWorkerUrl(ENDPOINT), ENDPOINT);
  for (const url of ['http://registration.fixture-account.workers.dev/api/register',
    'https://127.0.0.1/api/register', 'https://untrusted.example/api/register', ENDPOINT + '?token=fixture',
    ENDPOINT + '#fragment', ENDPOINT.replace('/api/register', '/other'),
    ENDPOINT.replace('https://', 'https://user:password@')]) assert.throws(() => validateWorkerUrl(url));
});

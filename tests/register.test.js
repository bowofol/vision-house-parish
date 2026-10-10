'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { createHandler } = require('../api/register');
const { submitToAppsScript, validateAppsScriptUrl, validateSharedSecret } = require('../lib/registration-upstream');

// These deliberately invented URLs and applicants exist only in tests. No
// test makes a real request to Google Apps Script or a production spreadsheet.
const ORIGIN = 'https://church.example';
const ENDPOINT = 'https://script.google.com/macros/s/unit-test-only/exec';
const CONTENT_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=unit-test-only';
const SHARED_SECRET = 'unit-test-only-not-a-production-secret-1234567890';
const TEST_ID = '12345678-1234-4234-8234-123456789012';
const TEST_ABUSE_KEY = 'a'.repeat(64);
const environment = {
  REGISTRATION_ENABLED: 'true',
  REGISTRATION_ALLOWED_ORIGIN: ORIGIN,
  APPS_SCRIPT_EXEC_URL: ENDPOINT,
  APPS_SCRIPT_SHARED_SECRET: SHARED_SECRET,
  VERCEL: '1',
  NODE_ENV: 'production'
};
const application = {
  fullName: 'Test Applicant',
  email: 'applicant@example.test',
  phone: '+234 801 234 5678',
  selectedClass: 'Workers-in-Training',
  preferredContact: 'WhatsApp',
  website: ''
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
}

function request(body = { ...application }, options = {}) {
  return {
    method: options.method || 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'idempotency-key': randomUUID(),
      'x-vercel-forwarded-for': '203.0.113.10',
      ...options.headers
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...options.request
  };
}

async function invoke(handler, incoming = request()) {
  const headers = {};
  let source;
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(value) { source = value; }
  };
  await handler(incoming, response);
  assert.equal(typeof source, 'string', 'handler must finish its response');
  return { status: response.statusCode, headers, body: JSON.parse(source) };
}

function setup({ env, fetchImpl, timeoutMs } = {}) {
  const calls = { fetch: [] };
  const handler = createHandler({
    env: { ...environment, ...env },
    upstreamTimeoutMs: timeoutMs || 100,
    async fetchImpl(url, options) {
      calls.fetch.push({ url, options });
      return fetchImpl ? fetchImpl(url, options) : jsonResponse({ success: true, message: 'Saved.', applicationId: 'VH-test-001',
        submissionId: new URLSearchParams(options.body).get('submissionId') });
    }
  });
  return { handler, calls };
}

test('valid registration forwards nine authenticated parameters and requires a verified matching receipt', async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler, request(undefined, { headers: { 'idempotency-key': TEST_ID } }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, message: 'Your registration is confirmed.', applicationId: 'VH-test-001', submissionId: TEST_ID });
  assert.equal(calls.fetch.length, 1);
  const forwarded = calls.fetch[0];
  assert.equal(forwarded.url, ENDPOINT);
  assert.equal(forwarded.options.method, 'POST');
  assert.equal(forwarded.options.redirect, 'manual');
  assert.equal(forwarded.options.credentials, 'omit');
  assert.equal(forwarded.options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  const parameters = Object.fromEntries(new URLSearchParams(forwarded.options.body));
  assert.deepEqual(parameters, { ...application, submissionId: TEST_ID, sharedSecret: SHARED_SECRET,
    abuseKey: createHmac('sha256', SHARED_SECRET).update('registration-ip-v1\0' + '203.0.113.10').digest('hex') });
  assert.equal(JSON.stringify(result.body).includes(SHARED_SECRET), false);
  assert.equal(forwarded.url.includes(SHARED_SECRET), false);
  assert.equal(result.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.equal(result.headers['access-control-allow-origin'], undefined);
});

for (const selectedClass of ['Workers-in-Training', "Believers' Class", 'Baptismal Class']) {
  for (const preferredContact of ['Phone', 'WhatsApp', 'Email']) {
    test(`accepts exact class ${selectedClass} and contact ${preferredContact}`, async () => {
      const { handler } = setup();
      const result = await invoke(handler, request({ ...application, selectedClass, preferredContact }));
      assert.equal(result.status, 200);
    });
  }
}

test('email is optional for Phone/WhatsApp and required for Email', async () => {
  for (const preferredContact of ['Phone', 'WhatsApp']) {
    const { handler } = setup();
    assert.equal((await invoke(handler, request({ ...application, email: '', preferredContact }))).status, 200);
  }
  const { handler, calls } = setup();
  const result = await invoke(handler, request({ ...application, email: '', preferredContact: 'Email' }));
  assert.equal(result.status, 400);
  assert.ok(result.body.fields.email);
  assert.equal(calls.fetch.length, 0);
});

const invalidFields = [
  ['missing required name', { fullName: '' }, 'fullName'],
  ['short name', { fullName: 'A' }, 'fullName'],
  ['overlong name', { fullName: 'A'.repeat(101) }, 'fullName'],
  ['name control character', { fullName: 'Test\nApplicant' }, 'fullName'],
  ['spreadsheet formula name', { fullName: '=IMPORTXML("test")' }, 'fullName'],
  ['missing required phone', { phone: '' }, 'phone'],
  ['invalid email', { email: 'not-an-email' }, 'email'],
  ['email without a domain', { email: 'someone@' }, 'email'],
  ['email with bad domain', { email: 'someone@-invalid.test' }, 'email'],
  ['email with whitespace', { email: 'some one@example.test' }, 'email'],
  ['overlong email', { email: `${'a'.repeat(245)}@example.test` }, 'email'],
  ['invalid phone letters', { phone: '+234 invalid' }, 'phone'],
  ['short phone', { phone: '123456' }, 'phone'],
  ['long phone digits', { phone: '1234567890123456' }, 'phone'],
  ['overlong phone formatting', { phone: `+234${' '.repeat(33)}8012345678` }, 'phone'],
  ['phone control character', { phone: '0801\t2345678' }, 'phone'],
  ['invalid class', { selectedClass: 'Youth Class' }, 'selectedClass'],
  ['incorrect class case', { selectedClass: 'workers-in-training' }, 'selectedClass'],
  ['padded class value', { selectedClass: " Believers' Class " }, 'selectedClass'],
  ['invalid contact', { preferredContact: 'SMS' }, 'preferredContact'],
  ['incorrect contact case', { preferredContact: 'whatsapp' }, 'preferredContact']
];
for (const [description, changes, field] of invalidFields) {
  test(`rejects ${description} before contacting Google`, async () => {
    const { handler, calls } = setup();
    const result = await invoke(handler, request({ ...application, ...changes }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_FIELDS');
    assert.equal(result.body.retrySafe, true);
    assert.equal(typeof result.body.fields[field], 'string');
    assert.equal(calls.fetch.length, 0);
    assert.equal(JSON.stringify(result.body).includes(application.email), false);
  });
}

test('rejects a honeypot submission, including whitespace', async () => {
  for (const website of ['https://spam.example', ' ']) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request({ ...application, website }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'HONEYPOT_REJECTED');
    assert.equal(calls.fetch.length, 0);
  }
});

test('API stays closed unless the explicit server gate is true', async () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    const { handler, calls } = setup({ env: { REGISTRATION_ENABLED: flag } });
    const result = await invoke(handler);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'REGISTRATION_CLOSED');
    assert.equal(calls.fetch.length, 0);
  }
});

test('accepts POST only; no GET or preflight workaround', async () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(undefined, { method }));
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'POST');
    assert.equal(calls.fetch.length, 0);
  }
});

test('rejects missing, mismatched and cross-site Origin requests', async () => {
  for (const headers of [
    { origin: undefined },
    { origin: 'https://attacker.example' },
    { origin: `${ORIGIN}/` },
    { origin: `${ORIGIN}.attacker.example` },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' }
  ]) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(undefined, { headers }));
    assert.equal(result.status, 403);
    assert.equal(calls.fetch.length, 0);
  }
});

test('rejects an absent or invalid UUIDv4 idempotency key', async () => {
  for (const value of [undefined, '', 'arbitrary-key', `${randomUUID()},${randomUUID()}`]) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(undefined, { headers: { 'idempotency-key': value } }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_IDEMPOTENCY_KEY');
    assert.equal(calls.fetch.length, 0);
  }
});

test('trusts only the Vercel client-IP header in production', async () => {
  for (const trustedIp of [undefined, '', '203.0.113.10, 192.0.2.2', 'not-an-address']) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(undefined, { headers: {
      'x-vercel-forwarded-for': trustedIp,
      'x-forwarded-for': '203.0.113.10'
    } }));
    assert.equal(result.status, 503);
    assert.equal(calls.fetch.length, 0);
  }
});

test('local development accepts only loopback requests and explicitly configured local origin', async () => {
  const { handler } = setup({ env: { VERCEL: undefined, NODE_ENV: 'development', REGISTRATION_ALLOWED_ORIGIN: 'http://localhost:3000' } });
  const result = await invoke(handler, request(undefined, { headers: { origin: 'http://localhost:3000' } }));
  assert.equal(result.status, 200);
  const denied = await invoke(handler, request(undefined, {
    headers: { origin: 'http://localhost:3000' }, request: { socket: { remoteAddress: '203.0.113.10' } }
  }));
  assert.equal(denied.status, 503);
});

test('rejects malformed, missing, extra and non-text JSON fields', async () => {
  const missing = { ...application };
  delete missing.website;
  for (const body of ['{not json', null, [], missing, { ...application, extra: 'x' },
    { ...application, phone: 8012345678 }, { ...application, fullName: { value: 'Test' } }]) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(body));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_REQUEST');
    assert.equal(calls.fetch.length, 0);
  }
});

test('requires JSON and rejects compressed input', async () => {
  for (const headers of [{ 'content-type': 'application/x-www-form-urlencoded' }, { 'content-encoding': 'gzip' }]) {
    const { handler, calls } = setup();
    const result = await invoke(handler, request(undefined, { headers }));
    assert.equal(result.status, 415);
    assert.equal(calls.fetch.length, 0);
  }
});

test('enforces 4KiB on declared length and actual Vercel-parsed body', async () => {
  const { handler, calls } = setup();
  const declared = await invoke(handler, request(undefined, { headers: { 'content-length': '4097' } }));
  assert.equal(declared.status, 413);
  const parsed = await invoke(handler, request({ ...application, fullName: 'a'.repeat(4097) }));
  assert.equal(parsed.status, 413);
  const raw = await invoke(handler, request(Buffer.from(JSON.stringify({ ...application, website: 'a'.repeat(4097) }))));
  assert.equal(raw.status, 413);
  assert.equal(calls.fetch.length, 0);
});

test('enforces 4KiB for chunked raw Node requests without content-length', async () => {
  const { handler, calls } = setup();
  const incoming = request();
  delete incoming.body;
  incoming[Symbol.asyncIterator] = async function* () { yield Buffer.alloc(3000, 'a'); yield Buffer.alloc(2000, 'b'); };
  const result = await invoke(handler, incoming);
  assert.equal(result.status, 413);
  assert.equal(calls.fetch.length, 0);
});

test('handles a valid raw Node JSON stream as well as Vercel parsed objects', async () => {
  const { handler } = setup();
  const incoming = request();
  delete incoming.body;
  incoming[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(application)); };
  assert.equal((await invoke(handler, incoming)).status, 200);
});

test('safe Google ContentService redirects retrieve JSON by GET without repeating POST data', async () => {
  let submissionId;
  const { handler, calls } = setup({ fetchImpl(url, options) {
    if (options.method === 'POST') submissionId = new URLSearchParams(options.body).get('submissionId');
    return url === ENDPOINT
      ? new Response(null, { status: 302, headers: { Location: CONTENT_URL } })
      : jsonResponse({ success: true, message: 'Saved.', applicationId: 'VH-test-redirect', submissionId });
  } });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.fetch[0].options.method, 'POST');
  assert.equal(calls.fetch[1].options.method, 'GET');
  assert.equal(calls.fetch[1].options.body, undefined);
  assert.equal(calls.fetch[1].options.headers['Content-Type'], undefined);
  assert.equal(calls.fetch[1].url.includes(SHARED_SECRET), false);
});

for (const location of [
  'http://script.googleusercontent.com/macros/echo',
  'https://attacker.example/steal',
  'https://script.googleusercontent.com.attacker.example/macros/echo',
  'https://script.googleusercontent.com:444/macros/echo',
  'https://username:password@script.googleusercontent.com/macros/echo',
  'https://script.googleusercontent.com/macros/echo#fragment',
  'https://script.googleusercontent.com/unrelated',
  'https://accounts.google.com/login',
  ENDPOINT
]) {
  test(`does not forward applicant data to unsafe redirect ${location}`, async () => {
    const { handler, calls } = setup({ fetchImpl: () => new Response(null, { status: 302, headers: { Location: location } }) });
    const result = await invoke(handler);
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'INVALID_UPSTREAM_RESPONSE');
    assert.equal(result.body.retrySafe, false);
    assert.equal(calls.fetch.length, 1);
  });
}

test('307/308 and redirect loops never replay a POST', async () => {
  for (const status of [307, 308]) {
    const { handler, calls } = setup({ fetchImpl: () => new Response(null, { status, headers: { Location: CONTENT_URL } }) });
    const result = await invoke(handler);
    assert.equal(result.status, 502);
    assert.equal(calls.fetch.length, 1);
  }
  const { handler, calls } = setup({ fetchImpl: () => new Response(null, { status: 302, headers: { Location: CONTENT_URL } }) });
  const result = await invoke(handler);
  assert.equal(result.status, 502);
  assert.equal(calls.fetch.length, 4);
  assert.equal(calls.fetch.filter((call) => call.options.method === 'POST').length, 1);
});

for (const [description, responseFactory, code] of [
  ['explicit Apps Script failure', () => jsonResponse({ success: false, message: 'Rejected.' }), 'UPSTREAM_FAILED'],
  ['HTTP failure', () => new Response('Internal error', { status: 500 }), 'UPSTREAM_FAILED'],
  ['HTML response', () => new Response('<h1>Login</h1>', { headers: { 'Content-Type': 'text/html' } }), 'INVALID_UPSTREAM_RESPONSE'],
  ['malformed JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), 'INVALID_UPSTREAM_RESPONSE'],
  ['success without application ID', () => jsonResponse({ success: true, message: 'Saved.' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['success without matching submission ID', () => jsonResponse({ success: true, message: 'Saved.', applicationId: 'VH-legacy' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['success for a different submission ID', () => jsonResponse({ success: true, message: 'Saved.', applicationId: 'VH-wrong-id', submissionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['truthy non-boolean success', () => jsonResponse({ success: 'true', message: 'Saved.', applicationId: 'VH-false-proof' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['unsafe receipt ID', () => jsonResponse({ success: true, message: 'Saved.', applicationId: '<script>bad</script>' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['overlong receipt ID', () => jsonResponse({ success: true, message: 'Saved.', applicationId: 'a'.repeat(129) }), 'INVALID_UPSTREAM_RESPONSE'],
  ['missing message', () => jsonResponse({ success: true, applicationId: 'VH-no-message' }), 'INVALID_UPSTREAM_RESPONSE'],
  ['array response', () => jsonResponse([{ success: true, message: 'Saved.', applicationId: 'VH-array' }]), 'INVALID_UPSTREAM_RESPONSE'],
  ['oversized body', () => jsonResponse({ success: true, message: 'Saved.', applicationId: 'VH-large', extra: 'a'.repeat(16385) }), 'INVALID_UPSTREAM_RESPONSE']
]) {
  test(`${description} yields a clear unconfirmed error without retrying`, async () => {
    const { handler, calls } = setup({ fetchImpl: responseFactory });
    const result = await invoke(handler);
    assert.equal(result.status, 502);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, code);
    assert.equal(result.body.retrySafe, false);
    assert.equal(calls.fetch.length, 1);
    assert.equal(JSON.stringify(result.body).includes(application.fullName), false);
  });
}

test('network failure does not trigger any automatic retry', async () => {
  const { handler, calls } = setup({ fetchImpl() { throw new Error('Sensitive provider diagnostic'); } });
  const result = await invoke(handler);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'UPSTREAM_FAILED');
  assert.equal(result.body.retrySafe, false);
  assert.equal(calls.fetch.length, 1);
  assert.equal(JSON.stringify(result.body).includes('Sensitive'), false);
});

test('deadline covers a stalled network request even if transport ignores abort', async () => {
  const { handler, calls } = setup({ timeoutMs: 15, fetchImpl: () => new Promise(() => {}) });
  const result = await invoke(handler);
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'UPSTREAM_TIMEOUT');
  assert.equal(result.body.retrySafe, false);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].options.signal.aborted, true);
});

test('deadline also covers a stalled response body', async () => {
  const { handler } = setup({ timeoutMs: 15, fetchImpl: () => new Response(new ReadableStream({ start() {} }), {
    headers: { 'Content-Type': 'application/json' }
  }) });
  const result = await invoke(handler);
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'UPSTREAM_TIMEOUT');
});

test('faulty response cancellation cannot stall an error or redirect cleanup', { timeout: 1000 }, async () => {
  const { handler } = setup({ fetchImpl: () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('Not JSON')); },
    cancel() { return new Promise(() => {}); }
  }), { headers: { 'Content-Type': 'text/html' } }) });
  const result = await invoke(handler);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'INVALID_UPSTREAM_RESPONSE');
});

test('an oversized stream with stalled cancellation still returns an unconfirmed error', { timeout: 1000 }, async () => {
  const { handler, calls } = setup({ timeoutMs: 15, fetchImpl: () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(16385)); },
    cancel() { return new Promise(() => {}); }
  }), { headers: { 'Content-Type': 'application/json' } }) });
  const result = await invoke(handler);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(result.body.retrySafe, false);
  assert.equal(calls.fetch.length, 1);
});

for (const [code, status, publicCode] of [
  ['VALIDATION_ERROR', 400, 'INVALID_FIELDS'],
  ['HONEYPOT_REJECTED', 400, 'HONEYPOT_REJECTED'],
  ['AUTH_FAILED', 503, 'SERVICE_UNAVAILABLE'],
  ['CONFIG_ERROR', 503, 'SERVICE_UNAVAILABLE'],
  ['THROTTLED', 429, 'RATE_LIMITED']
]) {
  test(`authenticated pre-write ${code} rejection permits only a safe manual retry`, async () => {
    const { handler, calls } = setup({ fetchImpl: () => jsonResponse({
      success: false, message: 'Private provider message not forwarded.', code, retrySafe: true, retryAfter: 900
    }) });
    const result = await invoke(handler);
    assert.equal(result.status, status);
    assert.equal(result.body.code, publicCode);
    assert.equal(result.body.retrySafe, true);
    assert.equal(calls.fetch.length, 1);
    assert.equal(JSON.stringify(result.body).includes('Private'), false);
    if (code === 'THROTTLED') {
      assert.equal(result.headers['retry-after'], '900');
      assert.equal(result.body.retryAfter, 900);
    }
  });
}

test('unknown errors cannot claim a safe retry and known codes require explicit boolean permission', async () => {
  for (const receipt of [
    { code: 'WRITE_UNCERTAIN', retrySafe: true },
    { code: 'LOCK_TIMEOUT', retrySafe: true },
    { code: 'LOCK_TIMEOUT', retrySafe: false },
    { code: 'AUTH_FAILED', retrySafe: 'true' },
    { code: 'CONFIG_ERROR' },
    { code: 'READBACK_ERROR', retrySafe: false }
  ]) {
    const { handler, calls } = setup({ fetchImpl: () => jsonResponse({ success: false, message: 'Not confirmed.', ...receipt }) });
    const result = await invoke(handler);
    assert.equal(result.status, 502);
    assert.equal(result.body.retrySafe, false);
    assert.equal(calls.fetch.length, 1);
  }
});

test('submission ID conflict is always unsafe to replace with a new ID', async () => {
  const { handler } = setup({ fetchImpl: () => jsonResponse({
    success: false, message: 'Conflict.', code: 'SUBMISSION_CONFLICT', retrySafe: true
  }) });
  const result = await invoke(handler);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(result.body.retrySafe, false);
});

test('uppercase browser UUID is canonicalized consistently for Sheets duplicate checking', async () => {
  const { handler, calls } = setup();
  const id = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
  const result = await invoke(handler, request(undefined, { headers: { 'idempotency-key': id.toUpperCase() } }));
  assert.equal(result.status, 200);
  assert.equal(result.body.submissionId, id);
  assert.equal(new URLSearchParams(calls.fetch[0].options.body).get('submissionId'), id);
});

test('same browser submission ID is forwarded unchanged on manual retries', async () => {
  const { handler, calls } = setup();
  const incoming = () => request(undefined, { headers: { 'idempotency-key': TEST_ID } });
  const first = await invoke(handler, incoming());
  const retry = await invoke(handler, incoming());
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(calls.fetch.length, 2);
  for (const call of calls.fetch) assert.equal(new URLSearchParams(call.options.body).get('submissionId'), TEST_ID);
});

test('timed-out manual retry carries the original ID for Apps Script to reconcile', async () => {
  let attempt = 0;
  const { handler, calls } = setup({ timeoutMs: 15, fetchImpl(_, options) {
    if (++attempt === 1) return new Promise(() => {});
    return jsonResponse({ success: true, message: 'Previously saved.', applicationId: 'VH-previous',
      submissionId: new URLSearchParams(options.body).get('submissionId') });
  } });
  const incoming = () => request(undefined, { headers: { 'idempotency-key': TEST_ID } });
  const timedOut = await invoke(handler, incoming());
  assert.equal(timedOut.status, 504);
  assert.equal(timedOut.body.retrySafe, false);
  assert.equal(calls.fetch.length, 1, 'bridge must not automatically retry');
  const retry = await invoke(handler, incoming());
  assert.equal(retry.status, 200);
  assert.equal(retry.body.applicationId, 'VH-previous');
  for (const call of calls.fetch) assert.equal(new URLSearchParams(call.options.body).get('submissionId'), TEST_ID);
});

test('does not reflect an upstream applicant message or server endpoint to the browser', async () => {
  const { handler } = setup({ fetchImpl: (_, options) => jsonResponse({
    success: true, message: `${application.fullName} ${application.email} ${ENDPOINT} ${SHARED_SECRET}`, applicationId: 'VH-private',
    submissionId: new URLSearchParams(options.body).get('submissionId')
  }) });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  const output = JSON.stringify(result.body);
  for (const privateValue of [application.fullName, application.email, ENDPOINT, SHARED_SECRET]) assert.equal(output.includes(privateValue), false);
});

test('server URL configuration accepts only HTTPS canonical Google /exec deployment URLs', () => {
  assert.equal(validateAppsScriptUrl(ENDPOINT), ENDPOINT);
  for (const bad of [undefined, '', 'https://attacker.example/exec', 'http://script.google.com/macros/s/test/exec',
    'https://script.google.com/macros/s/test/dev', `${ENDPOINT}?secret=bad`, `${ENDPOINT}#fragment`,
    'https://user:pass@script.google.com/macros/s/test/exec', 'https://script.google.com:444/macros/s/test/exec']) {
    assert.throws(() => validateAppsScriptUrl(bad));
  }
});

test('missing or unsafe configuration fails before any applicant POST', async () => {
  for (const env of [
    { APPS_SCRIPT_EXEC_URL: undefined },
    { APPS_SCRIPT_EXEC_URL: 'https://attacker.example/exec' },
    { REGISTRATION_ALLOWED_ORIGIN: undefined },
    { REGISTRATION_ALLOWED_ORIGIN: `${ORIGIN}/` },
    { REGISTRATION_ALLOWED_ORIGIN: 'http://church.example' },
    { APPS_SCRIPT_SHARED_SECRET: undefined },
    { APPS_SCRIPT_SHARED_SECRET: 'too-short' },
    { APPS_SCRIPT_SHARED_SECRET: 'x'.repeat(257) },
    { APPS_SCRIPT_SHARED_SECRET: `x${' '.repeat(40)}` },
    { APPS_SCRIPT_SHARED_SECRET: `x${'\n'.repeat(40)}` }
  ]) {
    const { handler, calls } = setup({ env });
    const result = await invoke(handler);
    assert.equal(result.status, 503);
    assert.equal(calls.fetch.length, 0);
  }
});

test('upstream response size guard also checks declared content length', async () => {
  await assert.rejects(() => submitToAppsScript(application, {
    endpoint: ENDPOINT,
    sharedSecret: SHARED_SECRET, submissionId: TEST_ID, abuseKey: TEST_ABUSE_KEY,
    fetchImpl: () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '16385' } })
  }), (error) => error.code === 'INVALID_UPSTREAM_RESPONSE');
});

test('shared-secret validation requires a bounded server-configured printable ASCII value', () => {
  assert.equal(validateSharedSecret(SHARED_SECRET), SHARED_SECRET);
  for (const value of [undefined, '', 'short', 'x'.repeat(257), ' '.repeat(32), 'é'.repeat(32), '\n'.repeat(32)]) {
    assert.throws(() => validateSharedSecret(value));
  }
});

test('invalid secret, submission ID or abuse key cannot trigger an upstream request', async () => {
  const valid = { endpoint: ENDPOINT, sharedSecret: SHARED_SECRET, submissionId: TEST_ID, abuseKey: TEST_ABUSE_KEY };
  let requests = 0;
  for (const invalid of [{ sharedSecret: undefined }, { submissionId: 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF' }, { abuseKey: 'raw-client-ip' }]) {
    await assert.rejects(() => submitToAppsScript(application, {
      ...valid, ...invalid, fetchImpl() { requests++; throw new Error('Must not run'); }
    }));
  }
  assert.equal(requests, 0);
});

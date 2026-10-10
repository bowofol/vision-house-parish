'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHandler } = require('../api/register');
const { createHarness, makeEvent, TEST_SECRET, VALID_APPLICATION } = require('./helpers/apps-script-harness');

// Execute the actual API and proposed Code.gs together with a mocked Google
// redirect transport and Google services. No network or live Sheet is used.
const ORIGIN = 'https://integration.example.test';
const ENDPOINT = 'https://script.google.com/macros/s/local-integration-fixture/exec';
const FIELDS = ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact', 'website'];
const application = Object.fromEntries(FIELDS.map(key => [key, VALID_APPLICATION[key]]));

function bridge({ scriptOptions, deliveryFault, timeoutMs = 100 } = {}) {
  const script = createHarness(scriptOptions);
  const content = new Map();
  const calls = [];
  let firstFault = deliveryFault;
  const handler = createHandler({
    env: {
      REGISTRATION_ENABLED: 'true', REGISTRATION_ALLOWED_ORIGIN: ORIGIN,
      APPS_SCRIPT_EXEC_URL: ENDPOINT, APPS_SCRIPT_SHARED_SECRET: TEST_SECRET,
      VERCEL: '1', NODE_ENV: 'production'
    },
    upstreamTimeoutMs: timeoutMs,
    async fetchImpl(url, options) {
      calls.push({ url, options });
      if (options.method === 'POST') {
        assert.equal(url, ENDPOINT);
        const parameters = Object.fromEntries(new URLSearchParams(options.body));
        assert.equal(parameters.sharedSecret, TEST_SECRET);
        const receipt = script.invoke(makeEvent(parameters));
        const destination = 'https://script.googleusercontent.com/macros/echo?fixture=' + randomUUID();
        content.set(destination, receipt);
        return new Response(null, { status: 302, headers: { Location: destination } });
      }
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined, 'redirects cannot forward private POST data');
      assert.equal(content.has(url), true);
      if (firstFault) {
        const fault = firstFault;
        firstFault = undefined;
        if (fault === 'timeout') return new Promise(() => {});
        throw new Error('Fixture lost the response after the Sheet write.');
      }
      return new Response(JSON.stringify(content.get(url)), { headers: { 'Content-Type': 'application/json' } });
    }
  });
  async function submit(id, body = application) {
    let source;
    const headers = {};
    const response = { statusCode: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(value) { source = value; } };
    await handler({
      method: 'POST', body: JSON.stringify(body),
      headers: { origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin',
        'idempotency-key': id, 'x-vercel-forwarded-for': '192.0.2.40' }
    }, response);
    return { status: response.statusCode, body: JSON.parse(source), headers };
  }
  return { script, calls, submit };
}

test('API and proposed Code.gs confirm the same Pending row through the Google GET redirect', async () => {
  const fixture = bridge();
  const id = randomUUID();
  const result = await fixture.submit(id);
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.submissionId, id);
  assert.equal(fixture.script.state.rows.length, 2);
  const saved = fixture.script.state.rows[1];
  assert.equal(saved[1], result.body.applicationId);
  assert.equal(saved[4], application.phone);
  assert.equal(saved[7], 'Pending');
  assert.equal(saved[8], id);
  assert.equal(fixture.script.state.flushes, 1);
  assert.equal(JSON.stringify(result.body).includes(TEST_SECRET), false);
  assert.equal(fixture.script.state.logs.length, 0);
});

test('concurrent API requests with one ID replay one mocked Sheet row and receipt', async () => {
  const fixture = bridge();
  const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, () => fixture.submit(id)));
  assert.equal(results.every(result => result.status === 200 && result.body.submissionId === id), true);
  assert.equal(new Set(results.map(result => result.body.applicationId)).size, 1);
  assert.equal(fixture.script.state.writes.length, 1);
  assert.equal(fixture.script.state.rows.length, 2);
  assert.equal(fixture.calls.filter(call => call.options.method === 'POST').length, 12);
});

test('same-ID changed-data conflicts cannot add a second row or reset a reviewed status', async () => {
  const fixture = bridge();
  const id = randomUUID();
  const original = await fixture.submit(id);
  fixture.script.state.rows[1][7] = 'Approved'; // Only this isolated mock is changed.
  const conflict = await fixture.submit(id, { ...application, fullName: 'Different Applicant' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.retrySafe, false);
  const replay = await fixture.submit(id.toUpperCase());
  assert.equal(replay.body.applicationId, original.body.applicationId);
  assert.equal(fixture.script.state.rows[1][7], 'Approved');
  assert.equal(fixture.script.state.writes.length, 1);
});

for (const fault of ['network', 'timeout']) {
  test(`a ${fault} after saving stays uncertain; controlled same-ID recovery returns one row`, async () => {
    const fixture = bridge({ deliveryFault: fault, timeoutMs: 30 });
    const id = randomUUID();
    const uncertain = await fixture.submit(id);
    assert.equal(uncertain.status, fault === 'timeout' ? 504 : 502);
    assert.equal(uncertain.body.success, false);
    assert.equal(uncertain.body.retrySafe, false);
    assert.equal(fixture.calls.filter(call => call.options.method === 'POST').length, 1, 'no automatic repost');
    assert.equal(fixture.script.state.writes.length, 1);
    const receipt = await fixture.submit(id); // Explicit controlled recovery, not a browser retry.
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.applicationId, fixture.script.state.rows[1][1]);
    assert.equal(fixture.script.state.rows.length, 2);
    assert.equal(fixture.script.state.writes.length, 1);
  });
}

test('mismatched server secrets reject before mocked Sheet/cache/lock access', async () => {
  const fixture = bridge({ scriptOptions: { properties: { APPS_SCRIPT_SHARED_SECRET: TEST_SECRET + '-different' } } });
  const result = await fixture.submit(randomUUID());
  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);
  assert.equal(fixture.script.state.spreadsheetOpens, 0);
  assert.equal(fixture.script.state.cacheReads, 0);
  assert.equal(fixture.script.state.lockCalls, 0);
  assert.equal(fixture.script.state.writes.length, 0);
});

test('lock contention is uncertain and cannot create a row before same-ID controlled recovery', async () => {
  const fixture = bridge({ scriptOptions: { lockUnavailable: true } });
  const id = randomUUID();
  const busy = await fixture.submit(id);
  assert.equal(busy.body.success, false);
  assert.equal(busy.body.retrySafe, false);
  assert.equal(fixture.script.state.writes.length, 0);
  fixture.script.options.lockUnavailable = false;
  const recovered = await fixture.submit(id);
  assert.equal(recovered.body.success, true);
  assert.equal(recovered.body.submissionId, id);
  assert.equal(fixture.script.state.writes.length, 1);
});

test('Apps Script cache throttle reaches the API and saved IDs remain recoverable', async () => {
  const fixture = bridge();
  const firstId = randomUUID();
  const first = await fixture.submit(firstId);
  for (let count = 0; count < 4; count += 1) assert.equal((await fixture.submit(randomUUID())).status, 200);
  const limited = await fixture.submit(randomUUID());
  assert.equal(limited.status, 429);
  assert.equal(limited.body.retrySafe, true);
  assert.equal(limited.body.retryAfter, 900);
  assert.equal(fixture.script.state.writes.length, 5);
  const replay = await fixture.submit(firstId);
  assert.equal(replay.body.applicationId, first.body.applicationId);
  assert.equal(fixture.script.state.writes.length, 5);
});

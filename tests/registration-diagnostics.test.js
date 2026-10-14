'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { submitToAppsScript } = require('../lib/registration-upstream');
const { createHarness, VALID_APPLICATION, TEST_SECRET, SPREADSHEET_ID } = require('./helpers/apps-script-harness');

// Fixtures only: every upstream request is intercepted, never sent to Google.
const ENDPOINT = 'https://script.google.com/macros/s/diagnostic-fixture-only/exec';
const privateValues = [...Object.values(VALID_APPLICATION).filter(Boolean), TEST_SECRET, SPREADSHEET_ID, ENDPOINT];

function assertPrivate(logs, additional = []) {
  const serialized = JSON.stringify(logs);
  for (const value of [...privateValues, ...additional]) {
    assert.equal(serialized.includes(value), false, 'diagnostic must omit private values');
  }
}

async function upstream(receipt, options = {}) {
  const logs = [];
  let calls = 0;
  let error;
  try {
    await submitToAppsScript(VALID_APPLICATION, {
      endpoint: ENDPOINT, sharedSecret: TEST_SECRET,
      submissionId: VALID_APPLICATION.submissionId, abuseKey: VALID_APPLICATION.abuseKey,
      logDiagnostic: (entry) => logs.push(entry),
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify(receipt), { headers: { 'Content-Type': 'application/json' } });
      },
      ...options
    });
  } catch (caught) { error = caught; }
  return { logs, calls, error };
}

for (const code of ['LOCK_TIMEOUT', 'WRITE_UNCERTAIN']) {
  test(`private diagnostics retain ${code} while preserving the unsafe failure`, async () => {
    const result = await upstream({ success: false, code, message: VALID_APPLICATION.email, retrySafe: false });
    assert.equal(result.calls, 1, 'diagnostics must never retry a POST');
    assert.equal(result.error.code, 'UPSTREAM_FAILED');
    assert.equal(result.error.retrySafe, false);
    assert.deepEqual(result.logs, [{ event: 'registration_upstream_failure', stage: 'receipt_failure',
      upstreamCode: code, code: 'UPSTREAM_FAILED', retrySafe: false }]);
    assertPrivate(result.logs);
  });
}

test('modern configuration failures retain their pre-write retry classification', async () => {
  const result = await upstream({ success: false, code: 'CONFIG_ERROR', message: TEST_SECRET, retrySafe: true });
  assert.equal(result.error.code, 'CONFIG_ERROR');
  assert.equal(result.error.retrySafe, true);
  assert.equal(result.logs[0].upstreamCode, 'CONFIG_ERROR');
  assertPrivate(result.logs);
});

test('legacy receipts with a missing message expose only the known code and schema stage', async () => {
  const result = await upstream({ success: false, code: 'CONFIG_ERROR', error: TEST_SECRET });
  assert.equal(result.error.code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(result.logs[0].stage, 'receipt_shape');
  assert.equal(result.logs[0].upstreamCode, 'CONFIG_ERROR');
  assertPrivate(result.logs);
});

test('legacy receipts missing retrySafe remain unsafe failures', async () => {
  const result = await upstream({ success: false, code: 'CONFIG_ERROR', message: VALID_APPLICATION.email });
  assert.equal(result.error.code, 'UPSTREAM_FAILED');
  assert.equal(result.error.retrySafe, false);
  assert.equal(result.logs[0].upstreamCode, 'CONFIG_ERROR');
  assertPrivate(result.logs);
});

test('unknown upstream codes, messages and extra fields never enter logs', async () => {
  const result = await upstream({ success: false, code: TEST_SECRET, message: VALID_APPLICATION.email,
    privateUrl: ENDPOINT, details: VALID_APPLICATION });
  assert.equal(result.logs[0].upstreamCode, 'UNRECOGNIZED');
  assertPrivate(result.logs);
});

test('transport exception messages and stacks never enter logs', async () => {
  const result = await upstream(null, { fetchImpl: async () => { throw new Error(TEST_SECRET + ENDPOINT); } });
  assert.equal(result.error.code, 'UPSTREAM_FAILED');
  assert.equal(result.logs[0].stage, 'transport');
  assertPrivate(result.logs);
});

test('a broken diagnostic logger does not replace the original unsafe failure', async () => {
  const result = await upstream({ success: false, code: 'WRITE_UNCERTAIN', message: 'Unconfirmed.' },
    { logDiagnostic() { throw new Error('Logger unavailable.'); } });
  assert.equal(result.error.code, 'UPSTREAM_FAILED');
  assert.equal(result.error.retrySafe, false);
  assert.equal(result.calls, 1);
});

test('confirmed receipts are not logged', async () => {
  const result = await upstream({ success: true, message: 'Confirmed.', applicationId: 'fixture-receipt',
    submissionId: VALID_APPLICATION.submissionId });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.logs, []);
});

'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { createHarness, makeEvent, TEST_SECRET, DEFAULT_HEADERS, VALID_APPLICATION } = require('./helpers/apps-script-harness');

test('authenticated registration appends one Pending record only after flush and readback', () => {
  const harness = createHarness();
  const result = harness.submit();
  assert.equal(result.success, true);
  assert.match(result.applicationId, /^[0-9a-f-]{36}$/);
  assert.equal(result.submissionId, VALID_APPLICATION.submissionId);
  assert.equal(harness.state.rows.length, 2);
  assert.equal(harness.state.rows[1][7], 'Pending');
  assert.equal(harness.state.rows[1][8], VALID_APPLICATION.submissionId);
  assert.equal(harness.state.rows[1][4], VALID_APPLICATION.phone);
  assert.equal(harness.state.flushes, 1);
  assert.equal(harness.state.writes.length, 1);
  assert.equal(harness.state.lockHeld, false);
  assert.equal(harness.state.releases, 1);
  assert.ok(harness.state.formats.every((format) => format.row === 2 && format.format === '@'));
  assert.equal(harness.state.logs.length, 0);
});

test('the same submission ID returns its existing receipt without another write or throttle', () => {
  const harness = createHarness();
  const first = harness.submit();
  const second = harness.submit();
  assert.deepEqual(second, first);
  assert.equal(harness.state.writes.length, 1);
  assert.equal(harness.state.cacheReads, 1);
});

test('UUID case and harmless name/phone formatting changes still replay the saved receipt', () => {
  const harness = createHarness();
  const first = harness.submit();
  const replay = harness.submit({ submissionId: VALID_APPLICATION.submissionId.toUpperCase(),
    fullName: 'TEST  Applicant', email: 'APPLICANT@example.test', phone: '2348000000000' });
  assert.deepEqual(replay, first);
  assert.equal(harness.state.writes.length, 1);
});

test('same ID with changed class or personal data is a conflict and never rewrites its row', () => {
  const harness = createHarness();
  harness.submit();
  const existing = [...harness.state.rows[1]];
  for (const change of [{ fullName: 'Another Applicant' }, { selectedClass: 'Baptismal Class' },
    { email: 'different@example.test' }, { preferredContact: 'Phone' }]) {
    const result = harness.submit(change);
    assert.equal(result.code, 'SUBMISSION_CONFLICT');
    assert.equal(result.retrySafe, false);
  }
  assert.deepEqual(harness.state.rows[1], existing);
  assert.equal(harness.state.writes.length, 1);
});

test('mock concurrent duplicate contention holds the lock through writing and retry yields one receipt', () => {
  let contending;
  const harness = createHarness({ onBeforeWrite() { contending = harness.submit(); } });
  const first = harness.submit();
  assert.equal(contending.code, 'LOCK_TIMEOUT');
  assert.equal(contending.retrySafe, false);
  harness.options.onBeforeWrite = undefined;
  assert.deepEqual(harness.submit(), first);
  assert.equal(harness.state.writes.length, 1);
  assert.equal(harness.state.rows.length, 2);
});

for (const secret of ['', 'wrong-secret', 'x'.repeat(257)]) {
  test(`unauthorized shared secret length ${secret.length} never accesses Sheet, lock or cache`, () => {
    const harness = createHarness();
    const result = harness.submit({ sharedSecret: secret });
    assert.equal(result.code, 'AUTH_FAILED');
    assert.equal(harness.state.spreadsheetOpens, 0);
    assert.equal(harness.state.lockCalls, 0);
    assert.equal(harness.state.cacheReads, 0);
  });
}

test('missing/duplicate secret parameters cannot authorize access', () => {
  const harness = createHarness();
  const missing = makeEvent();
  delete missing.parameters.sharedSecret;
  assert.equal(harness.invoke(missing).code, 'AUTH_FAILED');
  const duplicate = makeEvent();
  duplicate.parameters.sharedSecret.push(TEST_SECRET);
  assert.equal(harness.invoke(duplicate).code, 'AUTH_FAILED');
  assert.equal(harness.state.spreadsheetOpens, 0);
  assert.equal(harness.state.lockCalls, 0);
});

for (const overrides of [
  { fullName: '' }, { fullName: 'X' }, { fullName: 'x'.repeat(101) }, { fullName: '=IMPORTXML()' },
  { fullName: 'Test\nApplicant' }, { email: 'bad-address' }, { email: 'a..b@example.test' },
  { email: '' }, { email: 'name@-bad.test' }, { email: 'x'.repeat(255) },
  { phone: 'abc' }, { phone: '123456' }, { phone: '1234567890123456' }, { phone: '+234\n8000000000' },
  { phone: '1'.repeat(33) }, { selectedClass: 'Youth Class' }, { selectedClass: "Believers' Class " },
  { preferredContact: 'email' }, { preferredContact: 'SMS' }, { submissionId: 'not-a-uuid' },
  { submissionId: VALID_APPLICATION.submissionId.replace('-48d9-', '-38d9-') }, { abuseKey: '192.0.2.1' }
]) {
  test(`invalid ${Object.keys(overrides).join('/')} is rejected before accessing Sheet`, () => {
    const harness = createHarness();
    const result = harness.submit(overrides);
    assert.equal(result.success, false);
    assert.equal(result.code, 'VALIDATION_ERROR');
    assert.equal(result.retrySafe, true);
    assert.equal(harness.state.spreadsheetOpens, 0);
    assert.equal(harness.state.lockCalls, 0);
  });
}

test('email remains optional when Phone or WhatsApp is preferred', () => {
  for (const preferredContact of ['Phone', 'WhatsApp']) {
    const harness = createHarness();
    assert.equal(harness.submit({ email: '', preferredContact }).success, true);
  }
});

test('honeypot rejects any value including whitespace before touching the Sheet', () => {
  for (const website of ['https://bot.example.test', ' ']) {
    const harness = createHarness();
    assert.equal(harness.submit({ website }).code, 'HONEYPOT_REJECTED');
    assert.equal(harness.state.spreadsheetOpens, 0);
    assert.equal(harness.state.lockCalls, 0);
  }
});

test('authenticated malformed, duplicate, unknown and query parameters are rejected', () => {
  for (const edit of [
    (event) => { delete event.parameters.email; },
    (event) => { event.parameters.fullName.push('Duplicate'); },
    (event) => { event.parameters.extra = ['unexpected']; },
    (event) => { event.parameters.phone = [12345678]; },
    (event) => { event.queryString = 'fullName=query'; },
    (event) => { event.postData.type = 'application/json'; },
    (event) => { event.postData.contents = 'x'.repeat(16385); },
    (event) => { event.postData.length = 16385; }
  ]) {
    const harness = createHarness();
    const event = makeEvent();
    edit(event);
    assert.equal(harness.invoke(event).code, 'VALIDATION_ERROR');
    assert.equal(harness.state.spreadsheetOpens, 0);
  }
});

test('missing configuration or malformed header map never writes or creates Sheet headers', () => {
  for (const properties of [
    { APPS_SCRIPT_SHARED_SECRET: null }, { APPS_SCRIPT_SHARED_SECRET: 'too-short' },
    { APPS_SCRIPT_SHARED_SECRET: ' '.repeat(32) }, { APPS_SCRIPT_SHARED_SECRET: 'x'.repeat(257) },
    { SPREADSHEET_ID: null }, { REGISTRATION_SHEET_NAME: '' },
    { REGISTRATION_HEADER_MAP: '{bad-json' }, { REGISTRATION_HEADER_MAP: '[]' },
    { REGISTRATION_HEADER_MAP: JSON.stringify({ submissionId: 'Another ID' }) },
    { REGISTRATION_HEADER_MAP: JSON.stringify({ fullName: 'Email' }) },
    { REGISTRATION_HEADER_MAP: JSON.stringify({ inventedField: 'Invented' }) }
  ]) {
    const harness = createHarness({ properties });
    assert.equal(harness.submit().code, 'CONFIG_ERROR');
    assert.equal(harness.state.writes.length, 0);
    assert.equal(harness.state.rows.length, 1);
  }
});

test('manual header mapping supports an existing column order and leaves all old records intact', () => {
  const headers = ['Name', 'Telephone', 'Class', 'Application ID', 'Status', 'Email',
    'Preferred Contact', 'Timestamp', 'Coordinator Notes', 'Submission ID'];
  const old = ['Existing Applicant', '08000000000', 'Baptismal Class', 'EXISTING-1', 'Approved',
    '', 'Phone', '2026-01-01', 'Existing private note', ''];
  const harness = createHarness({ headers, initialRows: [old], properties: {
    REGISTRATION_HEADER_MAP: JSON.stringify({ fullName: 'Name', phone: 'Telephone', selectedClass: 'Class' })
  } });
  assert.equal(harness.submit().success, true);
  assert.deepEqual(harness.state.rows[0], headers);
  assert.deepEqual(harness.state.rows[1], old);
  assert.equal(harness.state.rows[2][4], 'Pending');
  assert.equal(harness.state.rows[2][8], '');
  assert.equal(harness.state.rows[2][9], VALID_APPLICATION.submissionId);
});

test('missing or duplicate required headers fail without migration or writes', () => {
  for (const headers of [DEFAULT_HEADERS.slice(0, -1), [...DEFAULT_HEADERS, 'Submission ID']]) {
    const harness = createHarness({ headers });
    assert.equal(harness.submit().code, 'CONFIG_ERROR');
    assert.equal(harness.state.writes.length, 0);
    assert.deepEqual(harness.state.rows[0], headers);
  }
});

test('duplicate ID rows or invalid existing receipts need review and never create another record', () => {
  const existing = ['2026-01-01', 'EXISTING-1', VALID_APPLICATION.fullName, VALID_APPLICATION.email,
    VALID_APPLICATION.phone, VALID_APPLICATION.selectedClass, VALID_APPLICATION.preferredContact,
    'Approved', VALID_APPLICATION.submissionId];
  for (const initialRows of [[existing, [...existing]], [[...existing.slice(0, 1), '', ...existing.slice(2)]]]) {
    const harness = createHarness({ initialRows });
    assert.equal(harness.submit().code, 'SUBMISSION_CONFLICT');
    assert.equal(harness.state.writes.length, 0);
  }
});

test('an approved existing registration returns its original receipt and preserves its status', () => {
  const initial = ['2026-01-01', 'EXISTING-1', VALID_APPLICATION.fullName, VALID_APPLICATION.email,
    VALID_APPLICATION.phone, VALID_APPLICATION.selectedClass, VALID_APPLICATION.preferredContact,
    'Approved', VALID_APPLICATION.submissionId];
  const harness = createHarness({ initialRows: [initial] });
  assert.equal(harness.submit().applicationId, 'EXISTING-1');
  assert.equal(harness.state.rows[1][7], 'Approved');
  assert.equal(harness.state.writes.length, 0);
});

test('incomplete saved receipts fail closed without changing existing rows', () => {
  const existing = ['2026-01-01', 'EXISTING-1', VALID_APPLICATION.fullName, VALID_APPLICATION.email,
    VALID_APPLICATION.phone, VALID_APPLICATION.selectedClass, VALID_APPLICATION.preferredContact,
    'Pending', VALID_APPLICATION.submissionId];
  for (const [column, value] of [[0, ''], [7, ''], [7, 'Invalid\nStatus']]) {
    const incomplete = [...existing];
    incomplete[column] = value;
    const harness = createHarness({ initialRows: [incomplete] });
    const result = harness.submit();
    assert.equal(result.success, false);
    assert.equal(result.code, 'SUBMISSION_CONFLICT');
    assert.equal(result.retrySafe, false);
    assert.equal(harness.state.writes.length, 0);
    assert.deepEqual(harness.state.rows[1], incomplete);
  }
});

test('new write readback detects lost phone plus signs and changed name casing', () => {
  for (const change of [
    (saved) => { saved[4] = saved[4].replace(/^\+/, ''); },
    (saved) => { saved[2] = saved[2].toUpperCase(); }
  ]) {
    const harness = createHarness({ transformSavedRow: change });
    const result = harness.submit();
    assert.equal(result.success, false);
    assert.equal(result.code, 'WRITE_UNCERTAIN');
    assert.equal(result.retrySafe, false);
    assert.equal(harness.state.writes.length, 1);
    assert.equal(harness.state.rows.length, 2);
  }
});

test('prewrite Sheet, formatting, lock and cache failures are explicit safe failures', () => {
  for (const options of [{ openThrows: true }, { missingSheet: true }, { formatThrows: true },
    { lockThrows: true }, { cacheThrows: true }]) {
    const harness = createHarness(options);
    const result = harness.submit();
    assert.equal(result.code, 'CONFIG_ERROR');
    assert.equal(result.retrySafe, true);
    assert.equal(harness.state.writes.length, 0);
    assert.equal(harness.state.lockHeld, false);
  }
});

test('a lock timeout writes nothing but stays uncertain while another request may save the ID', () => {
  const harness = createHarness({ lockUnavailable: true });
  const result = harness.submit();
  assert.equal(result.code, 'LOCK_TIMEOUT');
  assert.equal(result.retrySafe, false);
  assert.equal(harness.state.spreadsheetOpens, 0);
  assert.equal(harness.state.writes.length, 0);
});

for (const failure of ['writeThrowsAfter', 'flushThrows', 'readBackThrows', 'readBackCorrupt', 'formulaOnReadback']) {
  test(`${failure} reports uncertainty; same-ID retry finds one saved row`, () => {
    const harness = createHarness({ [failure]: true });
    const result = harness.submit();
    assert.equal(result.success, false);
    assert.equal(result.code, 'WRITE_UNCERTAIN');
    assert.equal(result.retrySafe, false);
    assert.equal(harness.state.writes.length, 1);
    harness.options[failure] = false;
    const replay = harness.submit();
    assert.equal(replay.success, true);
    assert.equal(harness.state.writes.length, 1);
    assert.equal(harness.state.rows.length, 2);
  });
}

test('an ambiguous write failure before saving also keeps the ID for a subsequent explicit retry', () => {
  const harness = createHarness({ writeThrowsBefore: true });
  assert.equal(harness.submit().code, 'WRITE_UNCERTAIN');
  assert.equal(harness.state.writes.length, 0);
  harness.options.writeThrowsBefore = false;
  assert.equal(harness.submit().success, true);
  assert.equal(harness.state.writes.length, 1);
});

test('best-effort IP throttle blocks a sixth new ID while receipt replay is still allowed', () => {
  const harness = createHarness();
  const first = harness.submit();
  for (let index = 0; index < 4; index += 1) assert.equal(harness.submit({ submissionId: randomUUID() }).success, true);
  const limited = harness.submit({ submissionId: randomUUID() });
  assert.equal(limited.code, 'THROTTLED');
  assert.equal(limited.retrySafe, true);
  assert.equal(limited.retryAfter, 900);
  assert.equal(harness.state.writes.length, 5);
  assert.deepEqual(harness.submit(), first);
  for (const entry of harness.state.cacheWrites) {
    assert.ok(entry.lifetime >= 1 && entry.lifetime <= 900);
    for (const value of [VALID_APPLICATION.fullName, VALID_APPLICATION.email, VALID_APPLICATION.phone,
      TEST_SECRET, VALID_APPLICATION.submissionId]) {
      assert.equal(entry.key.includes(value), false);
      assert.equal(entry.value.includes(value), false);
    }
  }
});

test('best-effort global throttle blocks the 101st new submission from different IP hashes', () => {
  const harness = createHarness();
  for (let index = 0; index < 100; index += 1) {
    assert.equal(harness.submit({ submissionId: randomUUID(), abuseKey: index.toString(16).padStart(64, '0') }).success, true);
  }
  const result = harness.submit({ submissionId: randomUUID(), abuseKey: 'b'.repeat(64) });
  assert.equal(result.code, 'THROTTLED');
  assert.equal(harness.state.writes.length, 100);
});

test('cache eviction can reset throttles, documenting that they are not durable guarantees', () => {
  const harness = createHarness({ evictCache: true });
  for (let index = 0; index < 6; index += 1) assert.equal(harness.submit({ submissionId: randomUUID() }).success, true);
  assert.equal(harness.state.writes.length, 6);
});

test('GET returns no information and cannot open the Sheet', () => {
  const harness = createHarness();
  const result = JSON.parse(harness.context.doGet().text);
  assert.equal(result.success, false);
  assert.equal(harness.state.spreadsheetOpens, 0);
  assert.equal(harness.state.lockCalls, 0);
});

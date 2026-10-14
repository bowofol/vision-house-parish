'use strict';

// Native workerd + local D1 only. Never reads account credentials, uses remote
// bindings, or sends a request to the deployed Worker / Google Apps Script.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { createHandler } = require('../../../api/register');

const ORIGIN = 'https://local-church.example';
const SECRET = 'local-smoke-fixture-only-never-a-production-secret-1234567890';
const app = { fullName: 'Native Fixture Applicant', email: '', phone: '08000000000',
  selectedClass: 'Workers-in-Training', preferredContact: 'Phone', website: '' };

async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'native-registration', modules: true, scriptPath: path.join(__dirname, '../dist/worker.js'),
    compatibilityDate: '2026-10-14', d1Databases: { DB: 'local-fixture-database' },
    ratelimits: { REGISTRATION_RATE_LIMITER: { namespace_id: '90001', simple: { limit: 30, period: 60 } } },
    bindings: { REGISTRATION_ENABLED: 'true', REGISTRATION_ALLOWED_ORIGIN: ORIGIN, REGISTRATION_WORKER_SECRET: SECRET }
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/0001_registration.sql'), 'utf8');
  const statements = migration.match(/CREATE (?:TABLE|INDEX)[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g);
  assert.equal(statements.length, 5);
  for (const sql of statements) await db.prepare(sql).run();
  async function post(body = app, id = randomUUID()) {
    const response = await mf.dispatchFetch('https://local-worker.example/api/register', { method: 'POST',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json',
        'Idempotency-Key': id, 'X-Registration-Abuse-Key': 'a'.repeat(64) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  return { mf, db, post };
}

test('native Worker/D1 runtime preserves receipts, concurrent uniqueness and durable quotas', async t => {
  const f = await fixture(t);
  const id = randomUUID();
  const result = await f.post(undefined, id);
  assert.equal(result.status, 200);
  assert.deepEqual((await f.post(undefined, id)).body, result.body);
  assert.equal((await f.post({ ...app, fullName: 'Different Fixture' }, id)).status, 409);
  assert.equal((await f.post({ ...app, phone: 'bad' })).status, 400);
  const same = await Promise.all(Array.from({ length: 10 }, () => f.post(undefined, id)));
  assert.ok(same.every(response => response.status === 200));
  const attempts = await Promise.all(Array.from({ length: 10 }, () => f.post()));
  assert.equal(attempts.filter(response => response.status === 200).length, 4);
  assert.equal(attempts.filter(response => response.status === 429).length, 6);
  const saved = await f.db.prepare('SELECT COUNT(*) AS count FROM vh_registrations').first();
  assert.equal(saved.count, 5);
  const row = await f.db.prepare('SELECT phone, status FROM vh_registrations WHERE submission_id = ?').bind(id).first();
  assert.equal(row.phone, app.phone);
  assert.equal(row.status, 'Pending');
});

test('native D1 transaction failure never confirms a registration or exposes driver details', async t => {
  const f = await fixture(t);
  await f.db.prepare("CREATE TRIGGER local_fixture_failure BEFORE INSERT ON vh_registrations BEGIN SELECT RAISE(ABORT, 'Private fixture driver error'); END;").run();
  const result = await f.post();
  assert.equal(result.status, 502);
  assert.equal(result.body.retrySafe, false);
  assert.equal(JSON.stringify(result.body).includes('Private fixture'), false);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM vh_registrations').first()).count, 0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM vh_registration_limits').first()).count, 0);
});

test('Vercel gateway and native Worker/D1 use the existing frontend receipt contract', async t => {
  const f = await fixture(t);
  let calls = 0;
  const handler = createHandler({ env: { REGISTRATION_ENABLED: 'true', REGISTRATION_BACKEND: 'cloudflare',
    REGISTRATION_ALLOWED_ORIGIN: ORIGIN, REGISTRATION_WORKER_URL: 'https://registration.fixture-account.workers.dev/api/register',
    REGISTRATION_WORKER_SECRET: SECRET, VERCEL: '1', NODE_ENV: 'production' },
    fetchImpl: async (_, options) => { calls++; return f.mf.dispatchFetch('https://local-worker.example/api/register', options); } });
  let result;
  const response = { statusCode: 200, setHeader() {}, end(value) { result = JSON.parse(value); } };
  const id = randomUUID();
  await handler({ method: 'POST', body: app, headers: { origin: ORIGIN, 'content-type': 'application/json',
    'idempotency-key': id, 'x-vercel-forwarded-for': '203.0.113.10' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(result.submissionId, id);
  assert.equal(result.success, true);
  assert.equal(calls, 1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM vh_registrations').first()).count, 1);
});

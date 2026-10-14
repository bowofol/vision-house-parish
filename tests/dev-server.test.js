'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDevServer } = require('../scripts/dev-server');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Node fetch rewrites Host; use real HTTP headers to exercise hostname checks.
function requestWithHost(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, headers: { get: name => response.headers[name] },
          text: async () => text, json: async () => JSON.parse(text) });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

const localTestEnv = {
  REGISTRATION_ENABLED: 'false',
  REGISTRATION_LOCAL_TEST_ENABLED: 'true',
  APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/test-deployment/exec',
  APPS_SCRIPT_SHARED_SECRET: 'local-test-placeholder-secret-1234567890'
};

async function listen(t, options, binding = '127.0.0.1') {
  const server = createDevServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, binding, resolve);
  });
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return { server, base: 'http://127.0.0.1:' + server.address().port };
}

test('local-only override opens served gates without changing persistent/public configuration or sending upstream requests', async (t) => {
  const env = { ...localTestEnv };
  let upstreamCalls = 0;
  const { server, base } = await listen(t, { env, fetchImpl: async () => {
    upstreamCalls++;
    throw new Error('No upstream requests permitted in this test');
  } });
  for (const host of ['127.0.0.1']) {
    const authority = host + ':' + server.address().port;
    const response = await requestWithHost(base + '/js/registration-config.js', { headers: { Host: authority } });
    const servedConfig = await response.text();
    assert.match(servedConfig, /registrationEnabled: true/);
    assert.match(servedConfig, /demoMode: false/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-visionhouse-local-registration'), 'enabled');
    const invalid = await requestWithHost(base + '/api/register', {
      method: 'POST', body: '{}', headers: {
        Host: authority, Origin: 'http://' + authority, 'Content-Type': 'application/json',
        'Idempotency-Key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      }
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_REQUEST');
  }
  assert.equal(upstreamCalls, 0);
  assert.equal(env.REGISTRATION_ENABLED, 'false');
  const persistentConfig = await fs.readFile('js/registration-config.js', 'utf8');
  assert.match(persistentConfig, /registrationEnabled: false/);
  assert.match(persistentConfig, /demoMode: false/);
  assert.equal((await fetch(base + '/.env.local')).status, 404);
});

test('local override rejects external Host and cross-origin requests before upstream access', async (t) => {
  let upstreamCalls = 0;
  const { server, base } = await listen(t, { env: { ...localTestEnv }, fetchImpl: async () => { upstreamCalls++; } });
  assert.equal((await requestWithHost(base + '/js/registration-config.js', { headers: { Host: 'attacker.example' } })).status, 403);
  assert.equal((await requestWithHost(base + '/js/registration-config.js', { headers: { Host: 'localhost:' + server.address().port } })).status, 403);
  const crossOrigin = await fetch(base + '/api/register', {
    method: 'POST', body: '{}', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, 'FORBIDDEN');
  assert.equal(upstreamCalls, 0);
});

test('local override cannot serve an open form on a LAN binding', async (t) => {
  const { base } = await listen(t, { env: { ...localTestEnv } }, '0.0.0.0');
  assert.equal((await fetch(base + '/js/registration-config.js')).status, 403);
});

test('local override refuses production, Vercel and an already open persistent gate', () => {
  for (const overrides of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { REGISTRATION_ENABLED: 'true' }]) {
    assert.throws(() => createDevServer({ env: { ...localTestEnv, ...overrides } }), /Local registration testing requires/);
  }
});

test('turning off the local switch restores closed real registration without enabling demo mode', async (t) => {
  let upstreamCalls = 0;
  const { base } = await listen(t, { env: { ...localTestEnv, REGISTRATION_LOCAL_TEST_ENABLED: 'false' },
    fetchImpl: async () => { upstreamCalls++; throw new Error('No registration submissions permitted while closed'); } });
  const config = await fetch(base + '/js/registration-config.js');
  const servedConfig = await config.text();
  assert.match(servedConfig, /registrationEnabled: false/);
  assert.match(servedConfig, /demoMode: false/);
  assert.equal(config.headers.get('x-visionhouse-local-registration'), 'disabled');
  const response = await fetch(base + '/api/register', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'Idempotency-Key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    body: JSON.stringify({ fullName: 'Synthetic Test Applicant', email: '', phone: '+2348030000000',
      selectedClass: 'Workers-in-Training', preferredContact: 'Phone', website: '' }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'REGISTRATION_CLOSED');
  assert.equal(upstreamCalls, 0);
});

test('a second dev server reports an occupied port clearly and leaves the existing listener intact', async (t) => {
  const { server, base } = await listen(t, { env: { REGISTRATION_ENABLED: 'false' } });
  const attempted = spawnSync(process.execPath, [path.resolve('scripts/dev-server.js')], {
    env: { ...process.env, PORT: String(server.address().port), REGISTRATION_ENABLED: 'false', REGISTRATION_LOCAL_TEST_ENABLED: 'false' },
    encoding: 'utf8', timeout: 5000
  });
  assert.equal(attempted.error, undefined);
  assert.equal(attempted.status, 1);
  assert.match(attempted.stderr, /Stop the previous local server.*this new server did not start/);
  assert.doesNotMatch(attempted.stdout, /Local website:/);
  assert.equal((await fetch(base + '/registration.html')).status, 200);
});

test('local server preserves public assets and hides server files and settings', async (t) => {
  const server = createDevServer({ env: { REGISTRATION_ENABLED: 'false', REGISTRATION_LOCAL_TEST_ENABLED: 'false' } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const pathname of ['/', '/registration.html', '/css/registration.css', '/js/registration-config.js', '/assets/images/rccg-logo.png']) {
    assert.equal((await fetch(base + pathname)).status, 200, pathname);
  }
  for (const pathname of ['/lib/registration-upstream.js', '/apps-script/Code.gs', '/.env.local', '/.env.example', '/api/register.js', '/tests/register.test.js', '/package.json', '/.review/phase1-check.mjs']) {
    assert.equal((await fetch(base + pathname)).status, 404, pathname);
  }
  const range = await fetch(base + '/assets/images/rccg-logo.png', { headers: { Range: 'bytes=0-15' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 16);
  const method = await fetch(base + '/api/register');
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
  const closed = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(closed.status, 503);
  assert.equal((await closed.json()).success, false);
});

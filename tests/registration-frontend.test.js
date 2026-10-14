'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDevServer } = require('../scripts/dev-server');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'registration.html'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'js/registration-config.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'js/registration.js'), 'utf8');
const demoControllerSource = fs.readFileSync(path.join(root, 'js/registration-demo.js'), 'utf8');
const fieldIds = ['registration-name', 'registration-email', 'registration-phone', 'registration-class', 'registration-contact'];

// This fixture implements only DOM operations used by the registration controllers.
// Control names, options and defaults come from the actual HTML, not copied
// registration logic. Responses, timers and transport are controlled externally.
class Element {
  constructor(document, tag, attributes = {}) {
    this.document = document;
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.handlers = new Map();
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.value = attributes.value || '';
    this.defaultValue = this.value;
    this.required = Object.hasOwn(attributes, 'required');
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.hidden = Object.hasOwn(attributes, 'hidden');
    this.type = attributes.type || '';
    this.name = attributes.name || '';
    this.options = [];
    this.id = attributes.id || '';
  }

  set id(value) {
    if (this._id) this.document.elements.delete(this._id);
    this._id = value;
    if (value) this.document.elements.set(value, this);
  }

  get id() { return this._id; }
  set value(value) {
    this._value = String(value);
    // Hidden controls reflect value into their default/content value in real
    // browsers; native form reset therefore does not erase a changed honeypot.
    if (this.type === 'hidden') this.defaultValue = this._value;
  }
  get value() { return this._value; }
  get validity() {
    return { typeMismatch: this.type === 'email' && Boolean(this.value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value) };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }
  focus() { this.document.activeElement = this; }
  append(...elements) {
    for (const element of elements) {
      element.parentElement = this;
      this.children.push(element);
    }
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
    if (this.id) this.document.elements.delete(this.id);
  }
  querySelector(selector) { return this.selectedChildren?.[selector] || null; }
  fire(type) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const handler of this.handlers.get(type) || []) handler(event);
    if (type === 'reset' && !event.defaultPrevented) {
      for (const control of this.document.controls) control.value = control.defaultValue;
    }
    return event;
  }
}

const attributesOf = (text) => Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)]
  .map((match) => [match[1], match[2] ?? '']));

function createDocument() {
  const document = {
    elements: new Map(), controls: [], cookieAccessCount: 0,
    getElementById(id) { return this.elements.get(id) || null; },
    createElement(tag) { return new Element(this, tag); },
    querySelector(selector) {
      if (selector === '.registration-panel-heading .status-badge') return this.badge;
      if (selector === '#registration-privacy p') return this.privacy;
      return null;
    }
  };
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const element = new Element(document, match[1], attributesOf(match[2]));
    if (['INPUT', 'SELECT'].includes(element.tagName)) document.controls.push(element);
  }
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const select = document.getElementById(attributesOf(match[1]).id);
    select.options = [...match[2].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)]
      .map((option) => ({ value: option[1], textContent: option[2] }));
    select.value = select.defaultValue = select.options[0].value;
  }
  document.badge = document.createElement('span');
  document.badge.textContent = /class="status-badge">([^<]+)<\/span>/.exec(html)[1];
  document.privacy = document.createElement('p');
  document.privacy.textContent = /id="registration-privacy"[\s\S]*?<p>([^<]+)<\/p>/.exec(html)[1];
  const notice = document.getElementById('registration-closed');
  notice.selectedChildren = { strong: document.createElement('strong'), p: document.createElement('p') };
  const actions = document.createElement('div');
  actions.append(document.getElementById('registration-submit'), document.getElementById('registration-status'));
  Object.defineProperty(document, 'cookie', {
    get() { document.cookieAccessCount++; throw new Error('Unexpected cookie access'); },
    set() { document.cookieAccessCount++; throw new Error('Unexpected cookie write'); }
  });
  return document;
}

const apiResponse = (body, status = 200, overrides = {}) => ({
  status, ok: status >= 200 && status < 300, type: 'basic',
  async json() { return body; }, ...overrides
});
const confirmedResponse = (applicationId = 'APP1', overrides = {}, status = 200) => (options) => apiResponse({
  success: true, applicationId, submissionId: options.headers['Idempotency-Key'], ...overrides
}, status);
const safeFailure = (code = 'INVALID_FIELDS', extras = {}) => apiResponse({
  success: false, code, retrySafe: true, message: 'Please review your registration.', ...extras
}, code === 'RATE_LIMITED' ? 429 : 400);

function fixture({
  enabled = true, demoMode = false, apiPath = '/api/register', responses = [],
  servedConfigSource, servedControllerSource, servedDemoControllerSource,
  usePublicConfig = false, loadDemoController = false, configureWindow
} = {}) {
  const document = createDocument();
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  let uuidCount = 0;
  let abortControllerCount = 0;
  let storageAccessCount = 0;
  const forbidden = () => { throw new Error('Unexpected applicant logging or storage'); };
  const window = {
    crypto: { randomUUID: () => `aabbccdd-4455-4677-8899-${String(++uuidCount).padStart(12, '0')}` },
    AbortController: class extends AbortController {
      constructor() { super(); abortControllerCount++; }
    },
    async fetch(url, options) {
      calls.push({ url, options });
      const response = responses.shift();
      if (!response) throw new Error('Unexpected request');
      return typeof response === 'function' ? response(options) : response;
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(window, name, {
      get() { storageAccessCount++; return forbidden(); },
      set() { storageAccessCount++; return forbidden(); }
    });
  }
  configureWindow?.(window);
  const context = vm.createContext({ window, document, console: { log: forbidden, warn: forbidden, error: forbidden } });
  vm.runInContext(servedConfigSource ?? configSource, context);
  if (servedConfigSource === undefined && !usePublicConfig) {
    window.VisionHouseConfig.registration = Object.freeze({ registrationEnabled: enabled, demoMode, apiPath });
  }
  // The production HTML does not include the retired demo notice/controller.
  // Explicit demo regression tests supply their own notice in this isolated DOM.
  if (loadDemoController && window.VisionHouseConfig.registration.demoMode === true &&
      !document.getElementById('registration-demo-notice')) {
    const notice = document.createElement('div');
    notice.id = 'registration-demo-notice';
  }
  if (loadDemoController) vm.runInContext(servedDemoControllerSource ?? demoControllerSource, context);
  vm.runInContext(servedControllerSource ?? controllerSource, context);
  const element = (id) => document.getElementById(id);
  const form = element('class-registration-form');
  const controls = Object.fromEntries(document.controls.map((control) => [control.name, control]));
  const flush = async () => {
    await new Promise(setImmediate);
    for (const [id, timer] of timers) {
      if (timer.delay !== 0) continue;
      timers.delete(id);
      timer.callback();
    }
    await new Promise(setImmediate);
  };
  return {
    document, window, context, calls, timers, controls, element, flush,
    get uuidCount() { return uuidCount; },
    get abortControllerCount() { return abortControllerCount; },
    get storageAccessCount() { return storageAccessCount + document.cookieAccessCount; },
    get timerCount() { return timerId; },
    get state() { return element('registration-status').dataset.state; },
    get message() { return element('registration-status').textContent; },
    submit() { return form.fire('submit'); },
    reset() { return form.fire('reset'); },
    fill(values = {}) {
      const defaults = { fullName: 'Synthetic Applicant', email: '', phone: '+234 803 000 0000', selectedClass: 'Workers-in-Training', preferredContact: 'Phone', website: '' };
      for (const [name, value] of Object.entries({ ...defaults, ...values })) controls[name].value = value;
    }
  };
}

for (const localMode of [true, false]) {
  test('HTTP-served real controller initializes the actual form ' + (localMode ? 'ready for explicit local testing' : 'closed without the local switch'), async (t) => {
    let upstreamCalls = 0;
    const server = createDevServer({ env: {
      REGISTRATION_ENABLED: 'false', REGISTRATION_LOCAL_TEST_ENABLED: String(localMode)
    }, fetchImpl: async () => { upstreamCalls++; throw new Error('Unexpected upstream call'); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    const responses = await Promise.all(['/registration.html', '/js/registration-config.js', '/js/registration.js'].map(name => fetch(base + name)));
    for (const response of responses) assert.equal(response.status, 200);
    const [servedHtml, servedConfigSource, servedControllerSource] = await Promise.all(responses.map(response => response.text()));
    assert.equal(servedHtml, html);
    const f = fixture({ servedConfigSource, servedControllerSource, responses: [confirmedResponse('LOCAL-QA-MOCK')] });
    assert.equal(f.state, localMode ? 'ready' : 'unavailable');
    assert.equal(f.element('registration-submit').disabled, !localMode);
    assert.equal(f.element('registration-closed').hidden, localMode);
    assert.equal(f.element('registration-demo-notice'), null);
    assert.equal(f.calls.length, 0);
    f.fill();
    assert.equal(f.submit().defaultPrevented, true);
    await f.flush();
    assert.equal(f.state, localMode ? 'success' : 'unavailable');
    assert.equal(f.calls.length, localMode ? 1 : 0);
    if (localMode) {
      assert.equal(f.element('registration-receipt').textContent, 'Application reference: LOCAL-QA-MOCK');
      assert.doesNotMatch(f.message, /demo/i);
    } else {
      assert.equal(f.uuidCount, 0);
      assert.equal(f.abortControllerCount, 0);
      assert.equal(f.element('registration-receipt'), null);
    }
    assert.equal(upstreamCalls, 0);
  });
}

test('public configuration is frozen, disables real registration and demo mode and contains no service credentials', () => {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(configSource, context);
  const config = window.VisionHouseConfig.registration;
  assert.equal(Object.isFrozen(config), true);
  assert.equal(config.registrationEnabled, false);
  assert.equal(config.demoMode, false);
  assert.equal(config.apiPath, '/api/register');
  assert.deepEqual(Object.keys(config).sort(), ['apiPath', 'demoMode', 'registrationEnabled']);
  assert.throws(() => vm.runInContext("'use strict'; window.VisionHouseConfig.registration.registrationEnabled = true;", context), /read only/);
  assert.doesNotMatch(JSON.stringify(config), /script\.google|secret|token|credential|sheet/i);
});

test('actual HTML has exactly six names, a hidden honeypot, approved values and ordered deferred scripts', () => {
  const f = fixture({ enabled: false });
  assert.deepEqual(Object.keys(f.controls).sort(), ['email', 'fullName', 'phone', 'preferredContact', 'selectedClass', 'website']);
  assert.equal(f.controls.website.type, 'hidden');
  assert.equal(f.controls.website.value, '');
  assert.deepEqual(f.controls.selectedClass.options.map((option) => option.value), ['', 'Workers-in-Training', "Believers' Class", 'Baptismal Class']);
  assert.deepEqual(f.controls.preferredContact.options.map((option) => option.value), ['Phone', 'WhatsApp', 'Email']);
  const configIndex = html.indexOf('src="js/registration-config.js" defer');
  const demoIndex = html.indexOf('src="js/registration-demo.js" defer');
  const controllerIndex = html.indexOf('src="js/registration.js" defer');
  assert.ok(configIndex >= 0 && controllerIndex > configIndex);
  assert.equal(demoIndex, -1, 'the registration page cannot bootstrap the demo controller');
  assert.match(html, /http-equiv="Content-Security-Policy"[^>]*content="[^"]*form-action 'none'/);
  assert.doesNotMatch(html, /id="registration-demo-notice"|Class Registration Demo|Demo Mode/);
  assert.match(html, /id="registration-submit"[^>]*disabled/);
});

const DEMO_SUCCESS = 'Demo Registration Successful — No application has been submitted.';

function demoFixture(options = {}) {
  return fixture({ demoMode: true, enabled: false, loadDemoController: true, ...options });
}

function assertNoDemoTransport(f) {
  assert.equal(f.calls.length, 0, 'the demo cannot make a registration request');
  assert.equal(f.uuidCount, 0, 'the demo cannot create a real submission identifier');
  assert.equal(f.abortControllerCount, 0, 'the demo cannot prepare an abortable request');
  assert.equal(f.storageAccessCount, 0, 'the demo cannot read or persist details in browser storage');
  assert.equal(f.document.getElementById('registration-receipt'), null, 'the demo cannot issue an application receipt');
  assert.equal(f.timers.size, 0, 'the demo cannot leave a request or retry timer');
}

test('an explicitly loaded isolated demo validates locally and shows the exact unsent success message', () => {
  const f = demoFixture();
  assert.equal(f.state, 'demo-ready');
  assert.equal(f.element('registration-submit').disabled, false);
  assert.match(f.element('registration-submit').textContent, /demo/i);
  assert.equal(f.element('registration-demo-notice').hidden, false);
  assert.match(f.document.privacy.textContent, /browser|demo/i);
  f.fill();
  assert.equal(f.submit().defaultPrevented, true);
  assert.equal(f.state, 'demo-success');
  assert.equal(f.message, DEMO_SUCCESS);
  assert.equal(f.controls.fullName.value, 'Synthetic Applicant');
  assert.equal(f.element('class-registration-form').getAttribute('aria-busy'), 'false');
  assert.ok(fieldIds.every(id => f.element(id).disabled));
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.timerCount, 0, 'demo submission cannot schedule a request timer');
  assertNoDemoTransport(f);
});

test('demo accepts approved class/contact choices and requires email only for Email contact', () => {
  for (const selectedClass of ['Workers-in-Training', "Believers' Class", 'Baptismal Class']) {
    for (const preferredContact of ['Phone', 'WhatsApp', 'Email']) {
      const f = demoFixture();
      f.fill({ selectedClass, preferredContact, email: preferredContact === 'Email' ? 'demo@example.invalid' : '' });
      f.controls.preferredContact.fire('change');
      assert.equal(f.controls.email.required, preferredContact === 'Email');
      f.submit();
      assert.equal(f.message, DEMO_SUCCESS);
      assert.equal(f.timerCount, 0);
      assertNoDemoTransport(f);
    }
  }
});

for (const [description, changes, fieldName] of [
  ['unselected class', { selectedClass: '' }, 'selectedClass'],
  ['unapproved class', { selectedClass: 'Other Class' }, 'selectedClass'],
  ['missing name', { fullName: '' }, 'fullName'],
  ['short name', { fullName: 'A' }, 'fullName'],
  ['overlong name', { fullName: 'A'.repeat(101) }, 'fullName'],
  ['invalid email', { email: 'invalid-email' }, 'email'],
  ['missing preferred email', { email: '', preferredContact: 'Email' }, 'email'],
  ['missing phone', { phone: '' }, 'phone'],
  ['invalid phone', { phone: 'letters' }, 'phone'],
  ['short phone', { phone: '123456' }, 'phone'],
  ['overlong phone formatting', { phone: '+234' + ' '.repeat(30) + '8030000000' }, 'phone'],
  ['unapproved contact', { preferredContact: 'SMS' }, 'preferredContact']
]) {
  test(`demo rejects ${description} with field feedback and no request preparation`, () => {
    const f = demoFixture();
    f.fill(changes);
    assert.equal(f.submit().defaultPrevented, true);
    assert.equal(f.state, 'demo-failure');
    assert.notEqual(f.message, DEMO_SUCCESS);
    assert.equal(f.controls[fieldName].getAttribute('aria-invalid'), 'true');
    assert.ok(f.element(f.controls[fieldName].id + '-error').textContent);
    assert.equal(f.document.activeElement, f.controls[fieldName]);
    assert.equal(f.element('registration-submit').disabled, false);
    assert.equal(f.controls.fullName.value, changes.fullName ?? 'Synthetic Applicant');
    assert.equal(f.timerCount, 0);
    assertNoDemoTransport(f);
  });
}

test('demo field errors clear after correction and valid details still remain unsent', () => {
  const f = demoFixture();
  f.fill({ fullName: '', email: '', phone: '', selectedClass: '', preferredContact: 'Email' });
  f.submit();
  for (const key of ['selectedClass', 'fullName', 'email', 'phone']) {
    assert.equal(f.controls[key].getAttribute('aria-invalid'), 'true');
  }
  assert.equal(f.document.activeElement, f.controls.selectedClass);
  f.fill({ email: 'demo@example.invalid', preferredContact: 'Email' });
  for (const control of Object.values(f.controls)) control.fire('input');
  f.submit();
  assert.equal(f.message, DEMO_SUCCESS);
  assert.ok(fieldIds.every(id => f.element(id).getAttribute('aria-invalid') === 'false'));
  assert.equal(f.timerCount, 0);
  assertNoDemoTransport(f);
});

test('a populated demo honeypot cannot produce a confirmation or send any details', () => {
  for (const website of ['automated-value', ' ']) {
    const f = demoFixture();
    f.fill({ website });
    assert.equal(f.submit().defaultPrevented, true);
    assert.equal(f.state, 'demo-failure');
    assert.notEqual(f.message, DEMO_SUCCESS);
    assert.equal(f.timerCount, 0);
    assertNoDemoTransport(f);
  }
});

test('repeat demo clicks remain local and explicit reset starts another demo without a receipt', async () => {
  const f = demoFixture();
  f.fill();
  f.submit();
  f.element('registration-submit').disabled = false;
  f.submit();
  assert.equal(f.message, DEMO_SUCCESS);
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.timerCount, 0);
  const resetButton = f.element('registration-demo-reset');
  assert.ok(resetButton);
  assert.equal(resetButton.type, 'reset');
  assert.equal(resetButton.textContent, 'Start another demo');
  assert.equal(f.element('registration-status').parentElement.children.filter(element => element.id === 'registration-demo-reset').length, 1);
  assertNoDemoTransport(f);
  f.controls.website.value = 'previous-demo-value';
  assert.equal(f.reset().defaultPrevented, false);
  assert.ok([...f.timers.values()].every(timer => timer.delay === 0), 'reset may only defer presentation until native form reset finishes');
  await f.flush();
  assert.equal(f.state, 'demo-ready');
  assert.equal(f.element('registration-demo-reset'), null);
  assert.equal(f.controls.fullName.value, '');
  assert.equal(f.controls.website.value, '');
  assert.equal(f.controls.preferredContact.value, 'Phone');
  assert.ok(fieldIds.every(id => !f.element(id).disabled && f.element(id).getAttribute('aria-invalid') === null));
  const resetTimerCount = f.timerCount;
  f.fill({ fullName: 'Another Synthetic Applicant' });
  f.submit();
  assert.equal(f.message, DEMO_SUCCESS);
  assert.equal(f.timerCount, resetTimerCount, 'another demo submission cannot create request timers');
  assertNoDemoTransport(f);
});

test('demo remains usable without fetch, crypto or AbortController', () => {
  const f = demoFixture({ configureWindow(window) {
    delete window.fetch;
    delete window.crypto;
    delete window.AbortController;
  } });
  f.fill();
  f.submit();
  assert.equal(f.message, DEMO_SUCCESS);
  assert.equal(f.timerCount, 0);
  assertNoDemoTransport(f);
});

test('demo mode prevents real requests even when the real frontend flag and a foreign endpoint are configured', () => {
  for (const apiPath of ['/api/register', 'https://example.invalid/register']) {
    const f = demoFixture({ enabled: true, apiPath, responses: [confirmedResponse('NEVER-REQUESTED')] });
    f.fill();
    f.submit();
    assert.equal(f.message, DEMO_SUCCESS);
    assert.equal(f.timerCount, 0);
    assertNoDemoTransport(f);
  }
});

test('the real controller blocks native submission when the demo controller is absent', () => {
  const f = fixture({ demoMode: true, enabled: true, loadDemoController: false });
  f.fill();
  f.element('registration-submit').disabled = false;
  assert.equal(f.submit().defaultPrevented, true);
  assert.equal(f.timerCount, 0);
  assertNoDemoTransport(f);
});

test('unknown demo mode values fail closed rather than selecting the real registration adapter', () => {
  for (const demoMode of [undefined, null, 'true', 'false', 0, 1]) {
    const servedConfigSource = "window.VisionHouseConfig = { registration: Object.freeze({ registrationEnabled: true, apiPath: '/api/register', demoMode: " + String(JSON.stringify(demoMode)) + ' }) };';
    const f = fixture({ servedConfigSource, loadDemoController: true });
    f.fill();
    f.element('registration-submit').disabled = false;
    assert.equal(f.submit().defaultPrevented, true);
    assert.equal(f.timerCount, 0);
    assertNoDemoTransport(f);
  }
});

test('default closed gate prevents manually enabled submission and preserves all details', () => {
  const f = fixture({ usePublicConfig: true });
  f.fill();
  f.element('registration-submit').disabled = false;
  assert.equal(f.submit().defaultPrevented, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.state, 'unavailable');
  assert.equal(f.controls.fullName.value, 'Synthetic Applicant');
  assert.equal(f.document.getElementById('registration-receipt'), null);
});

test('foreign or changed endpoint paths cannot send applicants even with the public flag enabled', () => {
  for (const apiPath of ['https://example.invalid/register', '//example.invalid/register', '/api/other']) {
    const f = fixture({ apiPath });
    f.fill();
    f.submit();
    assert.equal(f.calls.length, 0);
    assert.equal(f.state, 'unavailable');
  }
});

test('email is optional for Phone and WhatsApp and required with helpful errors for Email', () => {
  const f = fixture();
  f.fill();
  for (const method of ['Phone', 'WhatsApp', 'Email']) {
    f.controls.preferredContact.value = method;
    f.controls.preferredContact.fire('change');
    assert.equal(f.controls.email.required, method === 'Email');
  }
  f.submit();
  assert.equal(f.calls.length, 0);
  assert.equal(f.controls.email.getAttribute('aria-invalid'), 'true');
  assert.match(f.element('registration-email-error').textContent, /email address/);
  f.controls.email.value = 'invalid';
  f.controls.email.fire('input');
  assert.equal(f.controls.email.getAttribute('aria-invalid'), 'true');
  f.controls.email.value = 'synthetic@example.invalid';
  f.controls.email.fire('input');
  assert.equal(f.controls.email.getAttribute('aria-invalid'), 'false');
});

test('client validation focuses an invalid field without generating a request', () => {
  const f = fixture();
  f.fill({ fullName: 'A', phone: 'letters', selectedClass: 'unapproved-class' });
  f.submit();
  assert.equal(f.calls.length, 0);
  assert.equal(f.document.activeElement, f.controls.selectedClass);
  assert.equal(f.controls.fullName.getAttribute('aria-invalid'), 'true');
  assert.equal(f.controls.phone.getAttribute('aria-invalid'), 'true');
  f.fill({ phone: '+234' + ' '.repeat(30) + '8030000000' });
  f.submit();
  assert.equal(f.calls.length, 0);
  assert.equal(f.controls.phone.getAttribute('aria-invalid'), 'true');
});

test('enabled submission sends one exact JSON payload to the same-origin API with an ephemeral UUID', async () => {
  const f = fixture({ responses: [safeFailure('HONEYPOT_REJECTED')] });
  f.fill({ fullName: '  Synthetic Applicant  ', selectedClass: "Believers' Class", preferredContact: 'WhatsApp', website: 'bot-filled' });
  f.submit();
  await f.flush();
  assert.equal(f.calls.length, 1);
  const { url, options } = f.calls[0];
  assert.equal(url, '/api/register');
  assert.equal(options.method, 'POST');
  assert.equal(options.mode, 'same-origin');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.match(options.headers['Idempotency-Key'], /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
  assert.deepEqual(JSON.parse(options.body), { selectedClass: "Believers' Class", fullName: 'Synthetic Applicant', email: '', phone: '+234 803 000 0000', preferredContact: 'WhatsApp', website: 'bot-filled' });
  assert.equal(f.state, 'failure');
});

test('pending requests disable fields, block duplicate submit, and prevent reset', async () => {
  let resolve;
  const f = fixture({ responses: [() => new Promise((done) => { resolve = done; })] });
  f.fill();
  f.submit();
  f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.state, 'loading');
  assert.equal(f.element('class-registration-form').getAttribute('aria-busy'), 'true');
  assert.ok(fieldIds.every((id) => f.element(id).disabled));
  assert.equal(f.reset().defaultPrevented, true);
  assert.equal(f.controls.fullName.value, 'Synthetic Applicant');
  resolve(confirmedResponse('APP-2026:0001')(f.calls[0].options));
  await f.flush();
  assert.equal(f.state, 'success');
});

test('confirmed success preserves details, safely renders the reference, and blocks repeat submission', async () => {
  const f = fixture({ responses: [confirmedResponse('APP-2026:0001')] });
  f.fill();
  f.submit();
  await f.flush();
  assert.equal(f.state, 'success');
  assert.equal(f.controls.fullName.value, 'Synthetic Applicant');
  assert.equal(f.document.getElementById('registration-receipt').textContent, 'Application reference: APP-2026:0001');
  assert.match(f.message, /awaiting church review/);
  f.element('registration-submit').disabled = false;
  f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.element('registration-submit').disabled, true);
});

test('an explicit reset after success starts a new intent and removes the previous receipt', async () => {
  const f = fixture({ responses: [confirmedResponse('APP1'), confirmedResponse('APP2')] });
  f.fill();
  f.submit();
  await f.flush();
  const oldKey = f.calls[0].options.headers['Idempotency-Key'];
  const actions = f.element('registration-status').parentElement;
  assert.ok(actions.children.some((element) => element.type === 'reset'));
  assert.equal(f.reset().defaultPrevented, false);
  await f.flush();
  assert.equal(f.state, 'ready');
  assert.equal(f.document.getElementById('registration-receipt'), null);
  assert.equal(f.controls.fullName.value, '');
  assert.equal(f.controls.preferredContact.value, 'Phone');
  f.fill();
  f.submit();
  await f.flush();
  assert.notEqual(f.calls[1].options.headers['Idempotency-Key'], oldKey);
});

test('safe validation failure maps field errors and retains the UUID for an unchanged manual retry', async () => {
  const f = fixture({ responses: [safeFailure('INVALID_FIELDS', { fields: { fullName: 'Please review your full name.', unknown: 'Do not render this.' } }), safeFailure()] });
  f.fill();
  f.submit();
  await f.flush();
  assert.equal(f.state, 'failure');
  assert.equal(f.controls.fullName.getAttribute('aria-invalid'), 'true');
  assert.equal(f.element('registration-name-error').textContent, 'Please review your full name.');
  assert.equal(f.document.activeElement, f.controls.fullName);
  assert.equal(f.calls.length, 1);
  f.submit();
  await f.flush();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.headers['Idempotency-Key'], f.calls[1].options.headers['Idempotency-Key']);
});

test('a confirmed unchanged manual retry keeps its submission ID and receives one receipt', async () => {
  const f = fixture({ responses: [safeFailure('RATE_LIMITED', { retryAfter: 60 }), confirmedResponse('APP-RETRY-1')] });
  f.fill();
  f.submit();
  await f.flush();
  assert.equal(f.state, 'failure');
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.size, 0);
  f.submit();
  await f.flush();
  assert.equal(f.state, 'success');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.headers['Idempotency-Key'], f.calls[1].options.headers['Idempotency-Key']);
  assert.equal(f.document.getElementById('registration-receipt').textContent, 'Application reference: APP-RETRY-1');
});

test('success reset explicitly clears a hidden honeypot that native reset would preserve', async () => {
  const f = fixture({ responses: [confirmedResponse('APP1')] });
  f.fill();
  f.submit();
  await f.flush();
  f.controls.website.value = 'filled-after-receipt';
  assert.equal(f.controls.website.defaultValue, 'filled-after-receipt');
  f.reset();
  // Before the controller's deferred reset, native reset preserves this value.
  assert.equal(f.controls.website.value, 'filled-after-receipt');
  await f.flush();
  assert.equal(f.controls.website.value, '');
  assert.equal(f.controls.website.defaultValue, '');
  assert.equal(f.state, 'ready');
});

test('corrected data after an explicitly safe rejection creates a new application UUID', async () => {
  const f = fixture({ responses: [safeFailure(), safeFailure()] });
  f.fill();
  f.submit();
  await f.flush();
  f.controls.fullName.value = 'Corrected Synthetic Applicant';
  f.controls.fullName.fire('input');
  f.submit();
  await f.flush();
  assert.notEqual(f.calls[0].options.headers['Idempotency-Key'], f.calls[1].options.headers['Idempotency-Key']);
});

test('rate limits provide manual wait feedback and never schedule an automatic retry', async () => {
  const f = fixture({ responses: [safeFailure('RATE_LIMITED', { retryAfter: 60 })] });
  f.fill();
  f.submit();
  await f.flush();
  assert.equal(f.state, 'failure');
  assert.match(f.message, /60 seconds/);
  assert.match(f.message, /No automatic retry/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.element('registration-submit').disabled, false);
});

test('server-closed responses block further requests without falsely denying that details were sent', async () => {
  const f = fixture({ responses: [apiResponse({ success: false, code: 'REGISTRATION_CLOSED', message: 'Registration is closed.', retrySafe: true }, 503)] });
  f.fill();
  f.submit();
  await f.flush();
  assert.equal(f.state, 'unavailable');
  assert.equal(f.element('registration-closed').hidden, false);
  assert.doesNotMatch(f.document.privacy.textContent, /does not store or send/);
  f.element('registration-submit').disabled = false;
  f.submit();
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(f.message, /No information has been sent/);
});

async function assertFrozen(f) {
  await f.flush();
  assert.equal(f.state, 'uncertain');
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.document.getElementById('registration-receipt'), null);
  assert.match(f.message, /contact the church/);
  const before = f.calls.length;
  f.element('registration-submit').disabled = false;
  f.submit();
  assert.equal(f.calls.length, before);
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.reset().defaultPrevented, true);
  assert.equal(f.controls.fullName.value, 'Synthetic Applicant');
}

test('potentially forwarded failures freeze retry even if the error code normally permits correction', async () => {
  const f = fixture({ responses: [apiResponse({ success: false, code: 'SERVICE_UNAVAILABLE', retrySafe: false }, 503)] });
  f.fill();
  f.submit();
  await assertFrozen(f);
});

test('an upstream lock timeout prevents edited data, retry or reset from creating a new submission ID', async () => {
  const f = fixture({ responses: [apiResponse({ success: false, code: 'UPSTREAM_FAILED', retrySafe: false }, 502)] });
  const generatedIds = [];
  const generateId = f.window.crypto.randomUUID;
  f.window.crypto.randomUUID = () => {
    const id = generateId();
    generatedIds.push(id);
    return id;
  };
  f.fill();
  f.submit();
  await f.flush();
  const originalId = f.calls[0].options.headers['Idempotency-Key'];
  assert.equal(f.state, 'uncertain');
  assert.deepEqual(generatedIds, [originalId]);
  f.controls.fullName.disabled = false;
  f.controls.fullName.value = 'Corrected Synthetic Applicant';
  f.controls.fullName.fire('input');
  f.element('registration-submit').disabled = false;
  f.submit();
  assert.equal(f.reset().defaultPrevented, true);
  await f.flush();
  assert.equal(f.state, 'uncertain');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(generatedIds, [originalId]);
  assert.equal(f.calls[0].options.headers['Idempotency-Key'], originalId);
  assert.equal(f.controls.fullName.value, 'Corrected Synthetic Applicant');
  assert.equal(f.element('registration-submit').disabled, true);
  assert.equal(f.document.getElementById('registration-receipt'), null);
  assert.equal(f.timers.size, 0);
});

test('network failure freezes retry and prevents reset from erasing an uncertain attempt', async () => {
  const f = fixture({ responses: [() => { throw new Error('Network unavailable'); }] });
  f.fill();
  f.submit();
  await assertFrozen(f);
  assert.equal(f.calls.length, 1);
});

test('the 20-second timeout aborts the request and freezes manual retry', async () => {
  const f = fixture({ responses: [(options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))))] });
  f.fill();
  f.submit();
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, 20000);
  assert.equal(f.calls[0].options.signal.aborted, false);
  timer.callback();
  assert.equal(f.calls[0].options.signal.aborted, true);
  await assertFrozen(f);
  assert.equal(f.calls.length, 1);
});

for (const [name, response] of [
  ['missing application ID', confirmedResponse(undefined, { applicationId: undefined })],
  ['unsafe application ID', confirmedResponse('<script>unsafe</script>')],
  ['overlong application ID', confirmedResponse('A'.repeat(129))],
  ['missing submission ID', confirmedResponse('APP1', { submissionId: undefined })],
  ['invalid submission ID', confirmedResponse('APP1', { submissionId: 'not-a-uuid' })],
  ['different submission ID', confirmedResponse('APP1', { submissionId: '00112233-4455-4677-8899-000000000099' })],
  ['noncanonical submission ID', (options) => confirmedResponse('APP1', {
    submissionId: options.headers['Idempotency-Key'].toUpperCase()
  })(options)],
  ['nonboolean success', confirmedResponse('APP1', { success: 'true' })],
  ['HTTP failure with a success body', confirmedResponse('APP1', {}, 500)],
  ['opaque response', apiResponse(null, 200, { type: 'opaque', json() { throw new Error('Must not read an opaque body'); } })],
  ['unreadable JSON', apiResponse(null, 200, { async json() { throw new Error('Invalid JSON'); } })],
  ['unknown error with retrySafe true', apiResponse({ success: false, code: 'UNKNOWN', retrySafe: true }, 500)],
  ['uncertain error despite retrySafe true', apiResponse({ success: false, code: 'UPSTREAM_TIMEOUT', retrySafe: true }, 504)],
  ['failure without explicit safe-retry permission', apiResponse({ success: false, code: 'INVALID_FIELDS' }, 400)]
]) {
  test(`${name} cannot create a receipt and freezes further requests`, async () => {
    const f = fixture({ responses: [response] });
    f.fill();
    f.submit();
    await assertFrozen(f);
  });
}

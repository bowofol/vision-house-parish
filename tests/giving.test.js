'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dataScript = fs.readFileSync(path.join(root, 'js/data/giving.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'js/giving.js'), 'utf8');

function loadAccounts() {
  const context = { window: {} };
  vm.runInNewContext(dataScript, context);
  return JSON.parse(JSON.stringify(context.window.VisionHouseData.giving.accounts));
}

function setup({ accounts = loadAccounts(), writeText = async () => {} } = {}) {
  const node = (textContent = '') => ({
    textContent, disabled: true, attributes: {}, listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    click() { return this.disabled ? undefined : this.listeners.click?.(); }
  });
  const cards = ['tithe', 'project'].map(id => {
    const fields = {
      '[data-bank-name]': node(), '[data-account-name]': node(),
      '[data-account-number]': node(), '[data-copy-account]': node(),
      '[data-copy-label]': node('Copy Account Number'), '[data-copy-feedback]': node()
    };
    return {
      dataset: { givingAccount: id }, fields,
      querySelector: selector => fields[selector],
      querySelectorAll: selector => selector.split(',').map(key => fields[key.trim()])
    };
  });
  const host = { querySelectorAll: () => cards };
  const context = {
    window: { VisionHouseData: { giving: { accounts } } },
    document: { querySelector: () => host },
    navigator: { clipboard: writeText ? { writeText } : undefined }
  };
  vm.runInNewContext(controller, context);
  return { cards, context };
}

test('official giving accounts retain exact names, purposes and leading zero; static HTML matches', () => {
  const accounts = loadAccounts();
  assert.equal(accounts.length, 2);
  assert.deepEqual(accounts.map(({ id, title, purpose, bankName, accountName, accountNumber, verified }) =>
    ({ id, title, purpose, bankName, accountName, accountNumber, verified })), [
    { id: 'tithe', title: 'Tithe Account', purpose: 'Tithes', bankName: 'Guaranty Trust Bank (GTBank)', accountName: 'RCCG VISION HOUSE PARISH', accountNumber: '0138942426', verified: true },
    { id: 'project', title: 'Project Account', purpose: 'Church Building Project', bankName: 'First Bank', accountName: 'RCCG VISION HOUSE PARISH', accountNumber: '2035906872', verified: true }
  ]);
  assert.equal(accounts[1].featuredMessage, "Let's Help Build the House of God");
  const html = fs.readFileSync(path.join(root, 'giving.html'), 'utf8');
  for (const account of accounts) {
    const card = html.match(new RegExp(`<article[^>]*data-giving-account="${account.id}"[\\s\\S]*?</article>`))?.[0];
    assert.ok(card);
    assert.ok(card.includes(account.title) && card.includes(account.purpose));
    assert.ok(card.includes(`data-bank-name>${account.bankName}</dd>`));
    assert.ok(card.includes(`data-account-name>${account.accountName}</dd>`));
    assert.ok(card.includes(`data-account-number>${account.accountNumber}</dd>`));
    assert.ok(card.includes(`aria-describedby="${account.id}-copy-feedback"`));
    assert.ok(card.includes(`id="${account.id}-copy-feedback"`));
  }
});

test('each button copies only its own exact account and updates only its own confirmation', async () => {
  const copied = [];
  const { cards } = setup({ writeText: async number => copied.push(number) });
  await cards[0].fields['[data-copy-account]'].click();
  assert.deepEqual(copied, ['0138942426']);
  assert.equal(cards[0].fields['[data-copy-feedback]'].textContent, 'Tithe Account number copied.');
  assert.equal(cards[1].fields['[data-copy-feedback]'].textContent, '');
  await cards[1].fields['[data-copy-account]'].click();
  assert.deepEqual(copied, ['0138942426', '2035906872']);
  assert.equal(cards[1].fields['[data-copy-feedback]'].textContent, 'Project Account number copied.');
  assert.equal(cards[0].fields['[data-copy-feedback]'].textContent, 'Tithe Account number copied.');
});

test('a pending tithe copy prevents duplicate clicks while the project copy remains usable', async () => {
  const copied = [];
  let finishTithe;
  const { cards } = setup({ writeText: number => {
    copied.push(number);
    return number === '0138942426' ? new Promise(resolve => { finishTithe = resolve; }) : Promise.resolve();
  } });
  const titheButton = cards[0].fields['[data-copy-account]'];
  const projectButton = cards[1].fields['[data-copy-account]'];
  const pending = titheButton.click();
  assert.equal(titheButton.disabled, true);
  assert.equal(titheButton.attributes['aria-busy'], 'true');
  assert.equal(projectButton.disabled, false);
  titheButton.click();
  await projectButton.click();
  assert.deepEqual(copied, ['0138942426', '2035906872']);
  finishTithe();
  await pending;
  assert.equal(titheButton.disabled, false);
  assert.equal(titheButton.attributes['aria-busy'], undefined);
  assert.equal(cards[0].fields['[data-copy-label]'].textContent, 'Copy Account Number');
});

test('clipboard rejection reports an honest failure and permits a later explicit retry', async () => {
  let rejectCopy = true;
  const { cards } = setup({ writeText: async () => { if (rejectCopy) throw new Error('Denied'); } });
  const card = cards[0], button = card.fields['[data-copy-account]'];
  await button.click();
  assert.match(card.fields['[data-copy-feedback]'].textContent, /Couldn't copy/);
  assert.equal(button.disabled, false);
  assert.equal(button.attributes['aria-busy'], undefined);
  assert.equal(card.fields['[data-account-number]'].textContent, '0138942426');
  assert.equal(cards[1].fields['[data-copy-feedback]'].textContent, '');
  rejectCopy = false;
  await button.click();
  assert.equal(card.fields['[data-copy-feedback]'].textContent, 'Tithe Account number copied.');
});

test('a browser without Clipboard API keeps visible numbers and offers manual copying', async () => {
  const { cards } = setup({ writeText: null });
  for (const card of cards) {
    await card.fields['[data-copy-account]'].click();
    assert.match(card.fields['[data-copy-feedback]'].textContent, /copy it manually/);
    assert.match(card.fields['[data-account-number]'].textContent, /^\d{10}$/);
    assert.equal(card.fields['[data-copy-account]'].disabled, false);
  }
});

test('incomplete, unverified or duplicate account configuration cannot copy stale bank details', () => {
  for (const edit of [
    accounts => { accounts[0].verified = false; },
    accounts => { accounts[0].accountNumber = 138942426; },
    accounts => { accounts[0].accountName = ''; },
    accounts => { accounts.push({ ...accounts[0] }); }
  ]) {
    const accounts = loadAccounts();
    edit(accounts);
    const { cards } = setup({ accounts });
    assert.equal(cards[0].fields['[data-copy-account]'].disabled, true);
    assert.ok(!cards[0].fields['[data-account-number]'].textContent.includes('0138942426'));
    assert.equal(cards[1].fields['[data-copy-account]'].disabled, false);
  }
});

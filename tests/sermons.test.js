'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sermons.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'js/sermons.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'js/data/sermons.js'), 'utf8');

function loadSermons() {
  const context = { window: {} };
  vm.runInNewContext(dataSource, context);
  return JSON.parse(JSON.stringify(context.window.VisionHouseData.sermons));
}

// Minimal DOM for the actual renderer. These tests perform no network requests.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this.isConnected = true;
    this.ownText = '';
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value) };
  }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tagName === '#fragment') this.append(...node.children);
      else { node.parent = this; this.children.push(node); }
    }
  }
  replaceChildren(...nodes) { this.children = []; this.ownText = ''; this.append(...nodes); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
  }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  fire(name, values = {}) {
    const event = { target: this, button: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const listener of this.listeners[name] || []) listener(event);
    return event;
  }
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (selector.startsWith('.') ? child.className.split(/\s+/).includes(selector.slice(1)) : child.tagName === selector) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  pause() { this.paused = true; }
  load() {}
}

function render(records = loadSermons()) {
  const elements = {};
  // Element IDs and initial hidden states come from the real Sermons page.
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)) {
    const element = new Element(match[1]);
    element.hidden = /\bhidden\b/.test(match[2] + match[4]);
    elements[match[3]] = element;
  }
  const document = {
    body: new Element('body'), getElementById: id => elements[id],
    createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    createDocumentFragment: () => new Element('#fragment'),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; }
  };
  const context = { window: { VisionHouseData: { sermons: records } }, document, URL };
  vm.runInNewContext(controller, context);
  return {
    elements,
    cards: () => elements['sermon-list'].querySelectorAll('.sermon-card'),
    featured: () => elements['sermon-featured'].querySelector('.sermon-card'),
    card: title => elements['sermon-list'].querySelectorAll('.sermon-card').find(card => card.querySelector('h3').textContent === title)
  };
}

// Publication and category changes below affect only isolated test records.
function approvedRecords() { return loadSermons().map(record => ({ ...record, published: true })); }

test('approved undated records are published and the original dated sermon remains featured', () => {
  const records = loadSermons();
  assert.equal(records[0].featured, true);
  assert.equal(records[0].title, 'Go Deeper With God: Why Ankle-Deep Christianity Is Not Enough');
  for (const record of records.slice(1)) {
    assert.equal(record.published, true);
    assert.equal(record.featured, false);
    assert.equal(record.date, '');
    assert.ok(fs.existsSync(path.join(root, record.thumbnail)));
  }
  const page = render();
  assert.equal(page.cards().length, 3);
  assert.equal(page.featured().querySelector('h3').textContent, records[0].title);
});

test('unpublished undated records remain hidden without changing the featured sermon', () => {
  const records = loadSermons();
  for (const record of records.slice(1)) record.published = false;
  const page = render(records);
  assert.equal(page.cards().length, 1);
  assert.equal(page.featured().querySelector('h3').textContent, records[0].title);
});

test('approved undated sermons display the supplied anchored labels without time metadata', () => {
  const page = render(approvedRecords());
  assert.equal(page.cards().length, 3);
  for (const [title, label] of [
    ['Sow in Scarcity, Reap 100 Fold', 'Uploaded approximately 3 weeks ago (as of 14 October 2026)'],
    ['You Cannot Rise Alone', 'Uploaded approximately 4 months ago (as of 14 October 2026)']
  ]) {
    const meta = page.card(title).querySelector('.sermon-meta');
    assert.equal(meta.textContent, label);
    assert.equal(meta.querySelectorAll('time').length, 0);
    assert.equal('dateTime' in meta.querySelector('span'), false);
  }
  assert.equal(page.featured().querySelector('h3').textContent, loadSermons()[0].title);
});

test('an omitted exact date is supported and relative labels are trimmed, not recalculated', () => {
  const record = approvedRecords()[1];
  delete record.date;
  record.approximatePublicationLabel = '  Uploaded approximately 3 weeks ago (as of 14 October 2026)  ';
  const page = render([record]);
  assert.equal(page.cards().length, 1);
  assert.equal(page.cards()[0].querySelector('.sermon-meta').textContent, record.approximatePublicationLabel.trim());
});

test('missing labels, nonpublication labels and invalid nonblank dates do not publish records', () => {
  const draft = approvedRecords()[1];
  for (const changes of [
    { approximatePublicationLabel: '' },
    { approximatePublicationLabel: '   ' },
    { dateType: 'sermon' },
    { date: '2026-02-30' },
    { date: 'not-a-date' }
  ]) {
    const page = render([{ ...draft, ...changes }]);
    assert.equal(page.cards().length, 0);
    assert.equal(page.elements['sermon-featured-section'].hidden, true);
    assert.equal(page.elements['sermon-empty'].hidden, false);
  }
});

test('valid dates take precedence and legacy, exact and provisional date formats still work', () => {
  const dated = loadSermons()[0];
  for (const [changes, expected] of [
    [{ dateType: 'sermon' }, '11 October 2026'],
    [{ dateApproximate: false }, 'Published 11 October 2026'],
    [{}, 'Published around 11 October 2026']
  ]) {
    const page = render([{ ...dated, approximatePublicationLabel: 'Unused label', ...changes }]);
    const time = page.cards()[0].querySelector('time');
    assert.equal(time.textContent, expected);
    assert.equal(time.dateTime, '2026-10-11');
  }
  const legacy = { ...dated };
  delete legacy.dateType;
  delete legacy.dateApproximate;
  assert.equal(render([legacy]).cards()[0].querySelector('time').textContent, '11 October 2026');
});

test('dated records precede undated records without inferring days from approximate labels', () => {
  const records = approvedRecords();
  const page = render([records[2], records[1], records[0]]);
  assert.deepEqual(page.cards().map(card => card.querySelector('h3').textContent), records.map(record => record.title));
});

test('search, category filtering and reset include approved undated sermons', () => {
  const records = approvedRecords();
  records[1].category = 'QA category';
  const page = render(records), elements = page.elements;
  elements['sermon-search'].value = 'Owokoniran';
  elements['sermon-search'].fire('input');
  assert.deepEqual(page.cards().map(card => card.querySelector('h3').textContent), [records[1].title]);
  elements['sermon-reset'].fire('click');
  assert.equal(page.cards().length, 3);
  elements['sermon-category'].value = 'QA category';
  elements['sermon-category'].fire('change');
  assert.equal(page.cards().length, 1);
  assert.equal(elements['sermon-featured-section'].hidden, true);
  elements['sermon-reset'].fire('click');
  assert.equal(elements['sermon-featured-section'].hidden, false);
});

test('both undated YouTube sermons use the existing player with labels, no autoplay and close cleanup', () => {
  const page = render(approvedRecords()), elements = page.elements;
  assert.equal(elements['sermon-player-media'].children.length, 0);
  for (const record of approvedRecords().slice(1)) {
    const trigger = page.card(record.title).querySelector('.sermon-watch');
    trigger.fire('click');
    assert.equal(elements['sermon-player'].open, true);
    assert.equal(elements['sermon-player-title'].textContent, record.title);
    assert.ok(elements['sermon-player-meta'].textContent.includes(record.approximatePublicationLabel));
    const iframe = elements['sermon-player-media'].querySelector('iframe');
    const videoId = new URL(record.youtubeUrl).searchParams.get('v');
    assert.equal(iframe.src, `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&playsinline=1`);
    elements['sermon-player'].close();
    assert.equal(elements['sermon-player-media'].children.length, 0);
    assert.equal(trigger.focused, true);
  }
});

test('publication labels remain text and cannot insert markup into sermon metadata', () => {
  const record = approvedRecords()[1];
  record.approximatePublicationLabel = '<img src=x onerror=alert(1)>';
  const meta = render([record]).cards()[0].querySelector('.sermon-meta');
  assert.equal(meta.textContent, record.approximatePublicationLabel);
  assert.equal(meta.querySelectorAll('img').length, 0);
});

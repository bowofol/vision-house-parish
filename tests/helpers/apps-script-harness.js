'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TEST_SECRET = 'fixture-only-secret-not-used-by-any-live-service-1234567890abcdef';
const SPREADSHEET_ID = 'fixture-private-spreadsheet-id';
const DEFAULT_HEADERS = ['Timestamp', 'Application ID', 'Full Name', 'Email', 'Phone',
  'Class', 'Preferred Contact', 'Status', 'Submission ID'];
const VALID_APPLICATION = Object.freeze({
  fullName: 'Test Applicant', email: 'applicant@example.test', phone: '+234 800 000 0000',
  selectedClass: "Believers' Class", preferredContact: 'Email', website: '',
  submissionId: 'bd20f635-71fa-48d9-b4cd-9a2ddc51ff94', sharedSecret: TEST_SECRET,
  abuseKey: 'a'.repeat(64)
});

function makeEvent(application = VALID_APPLICATION) {
  const contents = new URLSearchParams(application).toString();
  return { parameters: Object.fromEntries(Object.entries(application).map(([key, value]) => [key, [value]])),
    postData: { type: 'application/x-www-form-urlencoded;charset=UTF-8', contents,
      length: Buffer.byteLength(contents) }, queryString: '' };
}

function createHarness(options = {}) {
  const headers = [...(options.headers || DEFAULT_HEADERS)];
  const properties = { APPS_SCRIPT_SHARED_SECRET: TEST_SECRET, SPREADSHEET_ID,
    REGISTRATION_SHEET_NAME: 'Registrations', ...(options.properties || {}) };
  const state = {
    rows: [headers, ...(options.initialRows || []).map((row) => [...row])],
    originalRows: (options.initialRows?.length || 0) + 1,
    properties, options, lockHeld: false, lockCalls: 0, releases: 0,
    spreadsheetOpens: 0, reads: 0, writes: [], formats: [], flushes: 0,
    cache: new Map(), cacheReads: 0, cacheWrites: [], logs: [], maxRows: options.maxRows || 1000
  };

  const display = (value) => value === undefined || value === null ? '' :
    Object.prototype.toString.call(value) === '[object Date]' ? value.toISOString() : String(value);
  const requireLock = () => {
    if (!state.lockHeld) throw new Error('Mock detected a spreadsheet access outside ScriptLock.');
  };
  const range = (row, column, height, width) => ({
    getRow: () => row,
    getDisplayValues() {
      requireLock();
      state.reads += 1;
      const readingWrittenRow = state.writes.length && row > state.originalRows;
      if (readingWrittenRow && options.readBackThrows) throw new Error('Mock readback failure.');
      const values = Array.from({ length: height }, (_, offset) =>
        Array.from({ length: width }, (_, index) => display(state.rows[row + offset - 1]?.[column + index - 1])));
      if (readingWrittenRow && options.readBackCorrupt) {
        const target = headers.indexOf('Submission ID') - column + 1;
        if (target >= 0 && target < width) values[0][target] = 'corrupted-id';
      }
      return values;
    },
    getFormulas() {
      requireLock();
      return Array.from({ length: height }, () => Array(width).fill(options.formulaOnReadback ? '=BAD()' : ''));
    },
    setNumberFormat(format) {
      requireLock();
      if (row <= state.originalRows) throw new Error('Mock detected formatting an existing row.');
      if (options.formatThrows) throw new Error('Mock formatting failure.');
      state.formats.push({ row, column, height, width, format });
      return this;
    },
    setValues(values) {
      requireLock();
      if (row !== state.rows.length + 1 || height !== 1 || column !== 1) {
        throw new Error('Mock detected replacing an existing registration.');
      }
      options.onBeforeWrite?.();
      if (options.writeThrowsBefore) throw new Error('Mock write failed before saving.');
      const saved = [...values[0]];
      options.transformSavedRow?.(saved, headers);
      state.rows.push(saved);
      state.writes.push({ row, values: saved });
      if (options.writeThrowsAfter) throw new Error('Mock write saved but confirmation failed.');
      return this;
    },
    createTextFinder(value) {
      requireLock();
      let entire = false;
      let caseSensitive = true;
      let regex = true;
      const finder = {
        matchEntireCell(setting) { entire = setting; return this; },
        matchCase(setting) { caseSensitive = setting; return this; },
        useRegularExpression(setting) { regex = setting; return this; },
        findAll() {
          requireLock();
          if (!entire || regex) throw new Error('Mock detected an unsafe ID search.');
          const matches = [];
          for (let offset = 0; offset < height; offset += 1) {
            const candidate = display(state.rows[row + offset - 1]?.[column - 1]);
            if ((caseSensitive ? candidate === value : candidate.toLowerCase() === value.toLowerCase())) {
              matches.push({ getRow: () => row + offset });
            }
          }
          return matches;
        }
      };
      return finder;
    }
  });
  const sheet = {
    getLastRow() { requireLock(); return state.rows.length; },
    getLastColumn() { requireLock(); return headers.length; },
    getMaxRows() { requireLock(); return state.maxRows; },
    insertRowsAfter(after, amount) {
      requireLock();
      if (after !== state.maxRows || amount !== 1) throw new Error('Unexpected grid expansion.');
      state.maxRows += amount;
    },
    getRange(row, column, height, width) {
      requireLock();
      if (row < 1 || column < 1 || row + height - 1 > state.maxRows ||
          column + width - 1 > headers.length) throw new Error('Mock range is outside the grid.');
      return range(row, column, height, width);
    }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] ?? null }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' }, Charset: { UTF_8: 'UTF-8' },
      computeDigest: (_, value) => [...createHash('sha256').update(value).digest()].map((byte) => byte > 127 ? byte - 256 : byte),
      getUuid: () => randomUUID()
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({
      text, mimeType: null, setMimeType(value) { this.mimeType = value; return this; }
    }) },
    LockService: { getScriptLock() {
      state.lockCalls += 1;
      let acquired = false;
      return {
        tryLock(timeout) {
          if (timeout !== 5000) throw new Error('Unexpected lock budget.');
          if (options.lockThrows) throw new Error('Mock lock service failure.');
          if (state.lockHeld || options.lockUnavailable) return false;
          acquired = true;
          state.lockHeld = true;
          return true;
        },
        releaseLock() {
          if (acquired) { state.releases += 1; state.lockHeld = false; acquired = false; }
        }
      };
    } },
    SpreadsheetApp: {
      openById(id) {
        requireLock();
        state.spreadsheetOpens += 1;
        if (id !== properties.SPREADSHEET_ID || options.openThrows) throw new Error('Mock Sheet access failure.');
        return { getSheetByName: (name) => options.missingSheet || name !== properties.REGISTRATION_SHEET_NAME ? null : sheet };
      },
      flush() { requireLock(); state.flushes += 1; if (options.flushThrows) throw new Error('Mock flush failure.'); }
    },
    CacheService: { getScriptCache: () => ({
      getAll(keys) {
        state.cacheReads += 1;
        if (options.cacheThrows) throw new Error('Mock cache failure.');
        return Object.fromEntries(keys.flatMap((key) => {
          const entry = state.cache.get(key);
          return !options.evictCache && entry && entry.deadline > Date.now() ? [[key, entry.value]] : [];
        }));
      },
      put(key, value, lifetime) {
        if (options.cacheThrows) throw new Error('Mock cache failure.');
        state.cacheWrites.push({ key, value, lifetime });
        state.cache.set(key, { value, deadline: Date.now() + lifetime * 1000 });
      }
    }) },
    Logger: { log: (...args) => state.logs.push(args) },
    console: { log: (...args) => state.logs.push(args), error: (...args) => state.logs.push(args) }
  });
  vm.runInContext(readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), context,
    { filename: 'apps-script/Code.gs' });
  const invoke = (event) => {
    const output = context.doPost(event);
    if (output.mimeType !== 'application/json') throw new Error('Expected a JSON ContentService response.');
    return JSON.parse(output.text);
  };
  return { state, context, options, invoke, submit: (overrides = {}) => invoke(makeEvent({ ...VALID_APPLICATION, ...overrides })) };
}

module.exports = { createHarness, makeEvent, TEST_SECRET, SPREADSHEET_ID, DEFAULT_HEADERS, VALID_APPLICATION };

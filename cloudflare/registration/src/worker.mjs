import validation from '../../../lib/registration-validation.js';

const { MAX_REQUEST_BYTES, UUID, RequestError, validateBodyShape, validateApplication } = validation;
const HEX = /^[a-f0-9]{64}$/;
const ALLOWED_HEADERS = new Set(['authorization', 'content-type', 'idempotency-key', 'x-registration-abuse-key']);
const READ = 'SELECT * FROM vh_registrations WHERE submission_id = ?';
const WINDOW = 'CAST(unixepoch() / 900 AS INTEGER) * 900';
const GLOBAL_COUNT = `COALESCE((SELECT count FROM vh_registration_limits WHERE bucket = 'global' AND window_start = ${WINDOW}), 0)`;
const IP_COUNT = `COALESCE((SELECT count FROM vh_registration_limits WHERE bucket = 'ip:' || ? AND window_start = ${WINDOW}), 0)`;
const INSERT = `INSERT INTO vh_registrations
  (submission_id, application_id, full_name, email, phone, selected_class, preferred_contact, payload_hash, abuse_key)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM vh_registrations WHERE submission_id = ?)
    AND ${GLOBAL_COUNT} < 100 AND ${IP_COUNT} < 5
  ON CONFLICT(submission_id) DO NOTHING RETURNING application_id`;
const LIMITED = `SELECT (${GLOBAL_COUNT} >= 100 OR ${IP_COUNT} >= 5) AS limited`;

function respond(status, body, origin, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), ...extra
  } });
}
function failure(status, code, retrySafe, origin, extra = {}) {
  const messages = {
    REGISTRATION_CLOSED: 'Online registration is not open yet.',
    CONFIG_ERROR: 'Online registration is temporarily unavailable.',
    AUTH_FAILED: 'Registration could not be authorized.', FORBIDDEN: 'Submit registration from the church website.',
    VALIDATION_ERROR: 'Please check your registration details.', HONEYPOT_REJECTED: 'The registration could not be accepted.',
    THROTTLED: 'Please wait before submitting another registration.',
    SUBMISSION_CONFLICT: 'This submission ID needs review. Contact the church before trying again.',
    DATABASE_ERROR: 'We could not confirm your registration. Contact the church before trying again.',
    METHOD_NOT_ALLOWED: 'Use POST to submit a registration.', NOT_FOUND: 'Not found.'
  };
  return respond(status, { success: false, code, message: messages[code], retrySafe, ...extra }, origin,
    code === 'THROTTLED' ? { 'Retry-After': String(extra.retryAfter || 60) } : {});
}
function websiteOrigin(value) {
  if (typeof value !== 'string') throw new Error('Invalid origin.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || value !== url.origin || url.username || url.password) throw new Error('Invalid origin.');
  return value;
}
async function authorized(expected, actual) {
  if (!actual || !actual.startsWith('Bearer ')) return false;
  const supplied = actual.slice(7);
  if (!/^[\x21-\x7e]{32,256}$/.test(supplied)) return false;
  // Web Crypto verifies the MAC rather than comparing secret strings in JS.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(supplied));
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('content-type') || '') ||
      !['', 'identity'].includes((request.headers.get('content-encoding') || '').toLowerCase())) {
    throw new RequestError(415, 'INVALID_REQUEST', 'Send JSON.');
  }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new RequestError(413, 'INVALID_REQUEST', 'Request too large.');
  }
  if (!request.body) throw new RequestError(400, 'INVALID_REQUEST', 'Empty request.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        reader.cancel().catch(() => {});
        throw new RequestError(413, 'INVALID_REQUEST', 'Request too large.');
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new RequestError(400, 'INVALID_REQUEST', 'Invalid JSON.'); }
    return validateBodyShape(body);
  } finally { reader.releaseLock(); }
}
async function fingerprint(application) {
  const canonical = [application.fullName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(),
    application.email.trim().toLowerCase(), application.phone.replace(/\D/g, ''), application.selectedClass, application.preferredContact];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function storedApplication(record) {
  const application = { fullName: record.full_name, email: record.email, phone: record.phone,
    selectedClass: record.selected_class, preferredContact: record.preferred_contact, website: '' };
  validateApplication(validateBodyShape(application));
  return application;
}
async function receipt(record, application, hash, submissionId, candidateId, origin) {
  if (!record || record.submission_id !== submissionId || !UUID.test(record.application_id) ||
      typeof record.created_at !== 'string' || !Number.isFinite(Date.parse(record.created_at)) ||
      !['Pending', 'Approved', 'Rejected'].includes(record.status) || !HEX.test(record.payload_hash)) throw new Error('Unverified receipt.');
  const stored = storedApplication(record);
  if (await fingerprint(stored) !== record.payload_hash) throw new Error('Unverified stored data.');
  if (record.payload_hash !== hash) return failure(409, 'SUBMISSION_CONFLICT', false, origin);
  // Fresh writes require exact text preservation, including phone country codes.
  // Existing receipts retain the original harmless-formatting replay rules.
  if (record.application_id === candidateId && (record.status !== 'Pending' || record.reviewed_at !== null ||
      Object.keys(application).some(key => stored[key] !== application[key]))) {
    throw new Error('Unverified write.');
  }
  return respond(200, { success: true, message: 'Your registration is confirmed.',
    applicationId: record.application_id, submissionId }, origin);
}

export default {
  async fetch(request, env) {
    let origin;
    let stage = 'configuration';
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/register' || url.search) return failure(404, 'NOT_FOUND', true);
      if (!['POST', 'OPTIONS'].includes(request.method)) return failure(405, 'METHOD_NOT_ALLOWED', true);
      origin = websiteOrigin(env.REGISTRATION_ALLOWED_ORIGIN);
      if (request.headers.get('origin') !== origin) return failure(403, 'FORBIDDEN', true);
      if (request.method === 'OPTIONS') {
        const headers = (request.headers.get('access-control-request-headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (request.headers.get('access-control-request-method') !== 'POST' || headers.some(name => !ALLOWED_HEADERS.has(name))) {
          return failure(403, 'FORBIDDEN', true);
        }
        return respond(204, null, origin, { 'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': [...ALLOWED_HEADERS].join(', '), 'Access-Control-Max-Age': '600' });
      }
      if (env.REGISTRATION_ENABLED !== 'true') return failure(503, 'REGISTRATION_CLOSED', true, origin);
      if (typeof env.REGISTRATION_WORKER_SECRET !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(env.REGISTRATION_WORKER_SECRET) ||
          typeof env.DB?.withSession !== 'function' || typeof env.REGISTRATION_RATE_LIMITER?.limit !== 'function') {
        return failure(503, 'CONFIG_ERROR', true, origin);
      }
      stage = 'authentication';
      if (!await authorized(env.REGISTRATION_WORKER_SECRET, request.headers.get('authorization'))) return failure(403, 'AUTH_FAILED', true, origin);
      stage = 'validation';
      const key = request.headers.get('idempotency-key');
      const abuseKey = request.headers.get('x-registration-abuse-key');
      if (!UUID.test(key || '') || !HEX.test(abuseKey || '')) return failure(400, 'VALIDATION_ERROR', true, origin);
      const submissionId = key.toLowerCase();
      const application = validateApplication(await readBody(request));
      const hash = await fingerprint(application);
      stage = 'rate_limit';
      if ((await env.REGISTRATION_RATE_LIMITER.limit({ key: abuseKey }))?.success !== true) {
        return failure(429, 'THROTTLED', true, origin, { retryAfter: 60 });
      }
      // Always begin on the primary, including when D1 read replication is enabled.
      const db = env.DB.withSession('first-primary');
      stage = 'receipt_lookup';
      const existing = await db.prepare(READ).bind(submissionId).first();
      if (existing) return await receipt(existing, application, hash, submissionId, null, origin);
      const candidateId = crypto.randomUUID();
      stage = 'database_transaction';
      // One transactional batch: conditional INSERT, committed row readback and
      // quota proof. Unique keys resolve races without an application retry.
      const results = await db.batch([
        db.prepare(INSERT).bind(submissionId, candidateId, application.fullName, application.email,
          application.phone, application.selectedClass, application.preferredContact, hash, abuseKey, submissionId, abuseKey),
        db.prepare(READ).bind(submissionId), db.prepare(LIMITED).bind(abuseKey)
      ]);
      stage = 'receipt_verification';
      if (!Array.isArray(results) || results.length !== 3 || results.some(result => result.success !== true)) throw new Error('Unverified transaction.');
      const records = results[1].results;
      if (!Array.isArray(records) || records.length > 1) throw new Error('Unverified receipt.');
      const inserted = results[0].results;
      if (!Array.isArray(inserted) || inserted.length > 1 || (inserted.length === 1 &&
          (inserted[0].application_id !== candidateId || records[0]?.application_id !== candidateId))) {
        throw new Error('Unverified insert.');
      }
      if (records.length === 0) {
        if (results[0].meta?.changes === 0 && results[0].results?.length === 0 && results[2].results?.[0]?.limited === 1) {
          return failure(429, 'THROTTLED', true, origin, { retryAfter: 900 });
        }
        throw new Error('Missing receipt.');
      }
      return await receipt(records[0], application, hash, submissionId, candidateId, origin);
    } catch (error) {
      if (stage === 'validation' && error instanceof RequestError) {
        return failure(error.status, error.code === 'HONEYPOT_REJECTED' ? error.code : 'VALIDATION_ERROR', true, origin);
      }
      // Fixed diagnostics only. D1 exceptions can contain SQL/private values.
      try { console.error(JSON.stringify({ event: 'registration_worker_failure', stage })); } catch {}
      return stage === 'configuration' ? failure(503, 'CONFIG_ERROR', true, origin)
        : failure(502, 'DATABASE_ERROR', false, origin);
    }
  }
};

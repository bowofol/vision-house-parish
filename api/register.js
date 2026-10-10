'use strict';

const { isIP } = require('node:net');
const { createHmac } = require('node:crypto');
const { submitToAppsScript, validateAppsScriptUrl, validateSharedSecret } = require('../lib/registration-upstream');

const MAX_REQUEST_BYTES = 4096;
const FIELD_NAMES = ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact', 'website'];
const CLASSES = new Set(['Workers-in-Training', "Believers' Class", 'Baptismal Class']);
const CONTACT_METHODS = new Set(['Phone', 'WhatsApp', 'Email']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

class RequestError extends Error {
  constructor(status, code, message, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.publicMessage = message;
    this.fields = fields;
  }
}

function header(request, name) {
  const value = request.headers?.[name];
  return typeof value === 'string' ? value : '';
}

function respond(response, status, body, additionalHeaders = {}) {
  response.statusCode = status;
  for (const [name, value] of Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...additionalHeaders
  })) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

function failure(response, status, code, message, retrySafe = true, extra = {}, headers = {}) {
  return respond(response, status, { success: false, code, message, retrySafe, ...extra }, headers);
}

function configuredOrigin(value, env) {
  if (typeof value !== 'string') throw new Error('Invalid origin configuration.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (value !== url.origin || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && env.VERCEL !== '1' && env.NODE_ENV !== 'production'))) {
    throw new Error('Invalid origin configuration.');
  }
  return url.origin;
}

function requestIp(request, env) {
  if (env.VERCEL === '1') {
    // Vercel overwrites this header with its trusted client IP. Do not trust
    // browser-supplied X-Forwarded-For or an arbitrary proxy in production.
    const value = header(request, 'x-vercel-forwarded-for').trim();
    if (!isIP(value)) throw new Error('Trusted client address is unavailable.');
    return value;
  }
  const localIp = request.socket?.remoteAddress;
  if (env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(localIp)) return localIp;
  throw new Error('Trusted client address is unavailable.');
}

async function readJsonBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(header(request, 'content-type'))) {
    throw new RequestError(415, 'INVALID_REQUEST', 'Send the registration as JSON.');
  }
  const encoding = header(request, 'content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    throw new RequestError(415, 'INVALID_REQUEST', 'Compressed registration requests are not accepted.');
  }
  const declaredLength = header(request, 'content-length');
  if (declaredLength && !/^\d+$/.test(declaredLength)) {
    throw new RequestError(400, 'INVALID_REQUEST', 'The registration request is invalid.');
  }
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
    throw new RequestError(413, 'INVALID_REQUEST', 'The registration request is too large.');
  }
  let body = request.body;
  if (body === undefined) {
    if (typeof request[Symbol.asyncIterator] !== 'function') {
      throw new RequestError(400, 'INVALID_REQUEST', 'The registration request is empty.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_REQUEST_BYTES) throw new RequestError(413, 'INVALID_REQUEST', 'The registration request is too large.');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new RequestError(413, 'INVALID_REQUEST', 'The registration request is too large.');
    }
    try {
      body = JSON.parse(Buffer.isBuffer(body) ? new TextDecoder('utf-8', { fatal: true }).decode(body) : body);
    } catch { throw new RequestError(400, 'INVALID_REQUEST', 'The registration request is not valid JSON.'); }
  } else {
    try {
      if (Buffer.byteLength(JSON.stringify(body) || '') > MAX_REQUEST_BYTES) {
        throw new RequestError(413, 'INVALID_REQUEST', 'The registration request is too large.');
      }
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(400, 'INVALID_REQUEST', 'The registration request is invalid.');
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.getPrototypeOf(body) !== Object.prototype ||
      Object.keys(body).length !== FIELD_NAMES.length ||
      Object.keys(body).some((key) => !FIELD_NAMES.includes(key)) ||
      FIELD_NAMES.some((key) => !Object.hasOwn(body, key) || typeof body[key] !== 'string')) {
    throw new RequestError(400, 'INVALID_REQUEST', 'Send all six registration fields as text.');
  }
  return body;
}

function validEmail(value) {
  if (value.length > 254 || /\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) ||
      parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function validateApplication(body) {
  if (body.website !== '') throw new RequestError(400, 'HONEYPOT_REJECTED', 'The registration could not be accepted.');
  const application = Object.fromEntries(FIELD_NAMES.map((key) => [key, body[key].trim()]));
  const fields = {};
  if (body.fullName.length > 100 || application.fullName.length < 2 || CONTROL_CHARACTERS.test(body.fullName) ||
      /^[=+@-]/.test(application.fullName)) {
    fields.fullName = 'Enter a full name of 2–100 characters.';
  }
  if (body.email.length > 254 || CONTROL_CHARACTERS.test(body.email) ||
      (application.email && (!validEmail(application.email) || /^[=+@-]/.test(application.email))) ||
      (!application.email && application.preferredContact === 'Email')) {
    fields.email = 'Enter a valid email address; email is required for email contact.';
  }
  const digits = application.phone.replace(/\D/g, '');
  if (body.phone.length > 32 || !/^\+?[\d ().-]+$/.test(application.phone) || digits.length < 7 || digits.length > 15) {
    fields.phone = 'Enter a phone number with 7–15 digits and at most 32 characters.';
  }
  if (!CLASSES.has(body.selectedClass)) fields.selectedClass = 'Choose one of the three registration classes.';
  if (!CONTACT_METHODS.has(body.preferredContact)) fields.preferredContact = 'Choose Phone, WhatsApp or Email.';
  if (Object.keys(fields).length) throw new RequestError(400, 'INVALID_FIELDS', 'Please correct the marked registration fields.', fields);
  return application;
}

function createHandler({ env = process.env, fetchImpl = globalThis.fetch, upstreamTimeoutMs = 8000 } = {}) {
  return async function register(request, response) {
    if (request.method !== 'POST') {
      return failure(response, 405, 'METHOD_NOT_ALLOWED', 'Use POST to submit a registration.', true, {}, { Allow: 'POST' });
    }
    // Both the public form and the API start closed. Missing configuration never opens it.
    if (env.REGISTRATION_ENABLED !== 'true') {
      return failure(response, 503, 'REGISTRATION_CLOSED', 'Online registration is not open yet.');
    }
    let origin;
    let endpoint;
    let sharedSecret;
    try {
      origin = configuredOrigin(env.REGISTRATION_ALLOWED_ORIGIN, env);
      endpoint = validateAppsScriptUrl(env.APPS_SCRIPT_EXEC_URL);
      sharedSecret = validateSharedSecret(env.APPS_SCRIPT_SHARED_SECRET);
    } catch {
      return failure(response, 503, 'SERVICE_UNAVAILABLE', 'Online registration is temporarily unavailable.');
    }
    const fetchSite = header(request, 'sec-fetch-site');
    if (header(request, 'origin') !== origin || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
      return failure(response, 403, 'FORBIDDEN', 'Submit registration from the church website.');
    }
    const idempotencyKey = header(request, 'idempotency-key');
    if (!UUID.test(idempotencyKey)) {
      return failure(response, 400, 'INVALID_IDEMPOTENCY_KEY', 'The registration request identifier is invalid.');
    }
    let application;
    try {
      application = validateApplication(await readJsonBody(request));
    } catch (error) {
      if (error instanceof RequestError) {
        return failure(response, error.status, error.code, error.publicMessage, true, error.fields ? { fields: error.fields } : {});
      }
      return failure(response, 400, 'INVALID_REQUEST', 'The registration request is invalid.');
    }
    const submissionId = idempotencyKey.toLowerCase();
    let abuseKey;
    try {
      const ip = requestIp(request, env);
      abuseKey = createHmac('sha256', sharedSecret).update(`registration-ip-v1\0${ip}`, 'utf8').digest('hex');
    } catch {
      return failure(response, 503, 'SERVICE_UNAVAILABLE', 'Online registration is temporarily unavailable.');
    }
    let receipt;
    try {
      // Sheets/Apps Script owns duplicate checking under ScriptLock. Every
      // manual retry keeps the same submission ID; this bridge never retries a POST.
      receipt = await submitToAppsScript(application, {
        endpoint, sharedSecret, submissionId, abuseKey, fetchImpl, timeoutMs: upstreamTimeoutMs
      });
    } catch (error) {
      if (error.retrySafe === true) {
        const safeErrors = {
          VALIDATION_ERROR: [400, 'INVALID_FIELDS', 'Please check your registration details.'],
          HONEYPOT_REJECTED: [400, 'HONEYPOT_REJECTED', 'The registration could not be accepted.'],
          AUTH_FAILED: [503, 'SERVICE_UNAVAILABLE', 'Online registration is temporarily unavailable.'],
          CONFIG_ERROR: [503, 'SERVICE_UNAVAILABLE', 'Online registration is temporarily unavailable.'],
          THROTTLED: [429, 'RATE_LIMITED', 'Please wait before submitting another registration.']
        };
        const safe = safeErrors[error.code];
        if (safe) {
          const retryAfter = error.retryAfter || 60;
          return failure(response, ...safe, true,
            error.code === 'THROTTLED' ? { retryAfter } : {},
            error.code === 'THROTTLED' ? { 'Retry-After': String(retryAfter) } : {});
        }
      }
      if (error.code === 'SUBMISSION_CONFLICT') {
        return failure(response, 409, 'IDEMPOTENCY_CONFLICT', 'This submission ID has already been used with different details. Contact the church before trying again.', false);
      }
      const code = ['UPSTREAM_TIMEOUT', 'UPSTREAM_FAILED', 'INVALID_UPSTREAM_RESPONSE'].includes(error.code)
        ? error.code : 'UPSTREAM_FAILED';
      const message = code === 'UPSTREAM_TIMEOUT'
        ? 'Confirmation timed out. Your registration may have been received. Contact the church before trying again.'
        : 'We could not confirm your registration. It may have been received. Contact the church before trying again.';
      return failure(response, code === 'UPSTREAM_TIMEOUT' ? 504 : 502, code, message, false);
    }
    return respond(response, 200, {
      success: true, message: 'Your registration is confirmed.', applicationId: receipt.applicationId, submissionId: receipt.submissionId
    });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;

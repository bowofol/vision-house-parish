'use strict';

const MAX_RESPONSE_BYTES = 16 * 1024;
const RECEIPT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FIELD_NAMES = ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact', 'website'];
const SUBMISSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SAFE_PREWRITE_CODES = new Set(['VALIDATION_ERROR', 'HONEYPOT_REJECTED', 'AUTH_FAILED', 'CONFIG_ERROR', 'THROTTLED']);
const DIAGNOSTIC_CODES = new Set([...SAFE_PREWRITE_CODES, 'LOCK_TIMEOUT', 'SUBMISSION_CONFLICT', 'WRITE_UNCERTAIN']);

class UpstreamError extends Error {
  constructor(code, { retrySafe = false, retryAfter } = {}) {
    // Never include an upstream body, URL or applicant information in errors.
    super(code);
    this.name = 'UpstreamError';
    this.code = code;
    this.retrySafe = retrySafe;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

function validateSharedSecret(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(value)) {
    throw new Error('Invalid Apps Script authentication configuration.');
  }
  return value;
}

function validateAppsScriptUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid Apps Script configuration.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Apps Script configuration.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port ||
      url.username || url.password || url.search || url.hash ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) {
    throw new Error('Invalid Apps Script configuration.');
  }
  return url.href;
}

function contentServiceRedirect(value, currentUrl) {
  let url;
  try { url = new URL(value, currentUrl); } catch { throw new UpstreamError('INVALID_UPSTREAM_RESPONSE'); }
  // Apps Script ContentService serves its response at a Google one-time URL.
  // Login redirects, arbitrary Google endpoints and re-posts are not permitted.
  if (url.href.length > 4096 || url.protocol !== 'https:' ||
      url.hostname !== 'script.googleusercontent.com' || url.port ||
      url.username || url.password || url.hash || url.pathname !== '/macros/echo') {
    throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
  }
  return url.href;
}

function cancelBody(response) {
  // Cleanup must not wait on a faulty transport's cancellation promise.
  try { response.body?.cancel()?.catch(() => {}); } catch { /* No applicant diagnostics. */ }
}

async function readBoundedJson(response, aborted) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
    cancelBody(response);
    throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), aborted]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        reader.cancel().catch(() => {});
        throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
      }
      chunks.push(Buffer.from(part.value));
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
  } finally {
    reader.releaseLock();
  }
}

async function submitToAppsScript(application, { endpoint, sharedSecret, submissionId, abuseKey, fetchImpl = globalThis.fetch, timeoutMs = 8000,
  logDiagnostic = (entry) => console.error(JSON.stringify(entry)) } = {}) {
  const initialUrl = validateAppsScriptUrl(endpoint);
  validateSharedSecret(sharedSecret);
  if (typeof submissionId !== 'string' || !SUBMISSION_ID.test(submissionId) ||
      typeof abuseKey !== 'string' || !/^[a-f0-9]{64}$/.test(abuseKey)) {
    throw new Error('Invalid Apps Script submission configuration.');
  }
  const controller = new AbortController();
  let rejectDeadline;
  const aborted = new Promise((_, reject) => { rejectDeadline = reject; });
  // Attach a rejection handler before the first asynchronous operation.
  aborted.catch(() => {});
  const deadline = setTimeout(() => {
    controller.abort();
    rejectDeadline(new UpstreamError('UPSTREAM_TIMEOUT'));
  }, timeoutMs);

  const parameters = new URLSearchParams();
  FIELD_NAMES.forEach((name) => parameters.set(name, application[name]));
  // The shared secret is server-to-server authentication, never a URL parameter.
  parameters.set('submissionId', submissionId);
  parameters.set('sharedSecret', sharedSecret);
  parameters.set('abuseKey', abuseKey);
  let url = initialUrl;
  let method = 'POST';
  let redirects = 0;
  let stage = 'transport';
  let upstreamCode = 'UNAVAILABLE';
  try {
    for (;;) {
      stage = 'transport';
      const headers = { Accept: 'application/json' };
      if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      const response = await Promise.race([
        fetchImpl(url, {
          method,
          headers,
          ...(method === 'POST' ? { body: parameters.toString() } : {}),
          signal: controller.signal,
          redirect: 'manual',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store'
        }),
        aborted
      ]);

      if ([301, 302, 303].includes(response.status)) {
        stage = 'redirect';
        const location = response.headers.get('location');
        cancelBody(response);
        if (!location || ++redirects > 3) throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
        url = contentServiceRedirect(location, url);
        method = 'GET';
        continue;
      }
      // Following 307/308 could execute a second POST and create a duplicate.
      stage = 'http_status';
      if (!response.ok) {
        cancelBody(response);
        throw new UpstreamError('UPSTREAM_FAILED');
      }
      const contentType = response.headers.get('content-type') || '';
      stage = 'content_type';
      if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;.*)?$/i.test(contentType)) {
        cancelBody(response);
        throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
      }
      stage = 'json_body';
      const receipt = await Promise.race([readBoundedJson(response, aborted), aborted]);
      // Only fixed codes enter private logs, even for malformed/legacy receipts.
      upstreamCode = DIAGNOSTIC_CODES.has(receipt?.code) ? receipt.code : 'UNRECOGNIZED';
      stage = 'receipt_shape';
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
          typeof receipt.success !== 'boolean' || typeof receipt.message !== 'string' ||
          !receipt.message.trim() || receipt.message.length > 500) {
        throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
      }
      if (receipt.success !== true) {
        stage = 'receipt_failure';
        if (receipt.code === 'SUBMISSION_CONFLICT') throw new UpstreamError('SUBMISSION_CONFLICT');
        if (receipt.retrySafe === true && SAFE_PREWRITE_CODES.has(receipt.code)) {
          const retryAfter = Number.isInteger(receipt.retryAfter) && receipt.retryAfter >= 1 && receipt.retryAfter <= 3600
            ? receipt.retryAfter : 60;
          throw new UpstreamError(receipt.code, { retrySafe: true, retryAfter });
        }
        throw new UpstreamError('UPSTREAM_FAILED');
      }
      stage = 'application_id';
      if (typeof receipt.applicationId !== 'string' || !RECEIPT_ID.test(receipt.applicationId)) {
        throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
      }
      stage = 'submission_id';
      if (receipt.submissionId !== submissionId) throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
      // The upstream message may contain personal information. Return only its receipt ID.
      return { applicationId: receipt.applicationId, submissionId };
    }
  } catch (error) {
    const failure = error instanceof UpstreamError ? error :
      new UpstreamError(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED');
    // No response bodies, exception messages/stacks, URLs, IDs or applicant data.
    // Logging failure must never change confirmation or retry behavior.
    try {
      logDiagnostic({ event: 'registration_upstream_failure', stage, upstreamCode,
        code: DIAGNOSTIC_CODES.has(failure.code) || ['UPSTREAM_TIMEOUT', 'UPSTREAM_FAILED', 'INVALID_UPSTREAM_RESPONSE'].includes(failure.code)
          ? failure.code : 'UNRECOGNIZED', retrySafe: failure.retrySafe === true });
    } catch { /* Diagnostics are best effort. */ }
    throw failure;
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = { submitToAppsScript, validateAppsScriptUrl, validateSharedSecret, UpstreamError, RECEIPT_ID };

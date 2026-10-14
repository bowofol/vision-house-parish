'use strict';

const { UpstreamError, RECEIPT_ID, readBoundedJson, validateSharedSecret } = require('./registration-upstream');
const { UUID } = require('./registration-validation');
const SAFE_CODES = new Set(['REGISTRATION_CLOSED', 'VALIDATION_ERROR', 'HONEYPOT_REJECTED', 'AUTH_FAILED', 'CONFIG_ERROR', 'THROTTLED']);

function validateWorkerUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid Worker configuration.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Worker configuration.'); }
  // Initially use the canonical workers.dev endpoint only. No configurable
  // redirects, private network destinations, URL credentials or query secrets.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.workers\.dev$/.test(url.hostname) ||
      url.pathname !== '/api/register') throw new Error('Invalid Worker configuration.');
  return url.href;
}

async function submitToWorker(application, { endpoint, sharedSecret, submissionId, abuseKey, origin,
  fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const url = validateWorkerUrl(endpoint);
  validateSharedSecret(sharedSecret);
  if (!UUID.test(submissionId) || !/^[a-f0-9]{64}$/.test(abuseKey)) throw new Error('Invalid Worker submission configuration.');
  const controller = new AbortController();
  let rejectDeadline;
  const aborted = new Promise((_, reject) => { rejectDeadline = reject; });
  aborted.catch(() => {});
  const deadline = setTimeout(() => {
    controller.abort();
    rejectDeadline(new UpstreamError('UPSTREAM_TIMEOUT'));
  }, timeoutMs);
  try {
    const response = await Promise.race([fetchImpl(url, {
      method: 'POST', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin,
        Authorization: `Bearer ${sharedSecret}`, 'Idempotency-Key': submissionId, 'X-Registration-Abuse-Key': abuseKey },
      body: JSON.stringify(application)
    }), aborted]);
    // A redirect must never send authentication or create a second POST.
    if (response.status >= 300 && response.status < 400) {
      try { response.body?.cancel()?.catch(() => {}); } catch {}
      throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
    }
    if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;.*)?$/i.test(response.headers.get('content-type') || '')) {
      try { response.body?.cancel()?.catch(() => {}); } catch {}
      throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
    }
    const receipt = await Promise.race([readBoundedJson(response, aborted), aborted]);
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
        typeof receipt.success !== 'boolean' || typeof receipt.message !== 'string' ||
        !receipt.message.trim() || receipt.message.length > 500) throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
    if (receipt.success === false) {
      if (receipt.code === 'SUBMISSION_CONFLICT') throw new UpstreamError('SUBMISSION_CONFLICT');
      if (receipt.retrySafe === true && SAFE_CODES.has(receipt.code)) {
        const retryAfter = Number.isInteger(receipt.retryAfter) && receipt.retryAfter >= 1 && receipt.retryAfter <= 3600
          ? receipt.retryAfter : 60;
        throw new UpstreamError(receipt.code, { retrySafe: true, retryAfter });
      }
      throw new UpstreamError('UPSTREAM_FAILED');
    }
    if (!response.ok || typeof receipt.applicationId !== 'string' || !RECEIPT_ID.test(receipt.applicationId) ||
        receipt.submissionId !== submissionId) throw new UpstreamError('INVALID_UPSTREAM_RESPONSE');
    return { applicationId: receipt.applicationId, submissionId };
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED');
  } finally { clearTimeout(deadline); }
}

module.exports = { submitToWorker, validateWorkerUrl };

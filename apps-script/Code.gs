/**
 * Complete proposed replacement for the existing registration Apps Script.
 * Copy manually into that project after migrating the private Sheet headers.
 * This local file does not change a deployed script or any Google Sheet.
 *
 * Script Properties (Project Settings > Script Properties):
 * APPS_SCRIPT_SHARED_SECRET: same random 32-256 non-whitespace ASCII secret as Vercel.
 * SPREADSHEET_ID: existing private spreadsheet ID.
 * REGISTRATION_SHEET_NAME: exact existing worksheet tab name.
 * REGISTRATION_HEADER_MAP: optional JSON overrides of the default map below.
 * The new submissionId header must always be exactly "Submission ID".
 * Never put the shared secret in this file, frontend code or a query string.
 */

var REGISTRATION_DEFAULT_HEADERS_ = Object.freeze({
  timestamp: 'Timestamp',
  applicationId: 'Application ID',
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  selectedClass: 'Class',
  preferredContact: 'Preferred Contact',
  status: 'Status',
  submissionId: 'Submission ID'
});
var REGISTRATION_FIELDS_ = ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact', 'website'];
var REGISTRATION_PARAMETERS_ = REGISTRATION_FIELDS_.concat(['submissionId', 'sharedSecret', 'abuseKey']);
var REGISTRATION_UUID_ = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var REGISTRATION_RECEIPT_ = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var REGISTRATION_CONTROLS_ = /[\u0000-\u001f\u007f]/;
var REGISTRATION_CACHE_WINDOW_ = 900;

function doGet() {
  return registrationJson_({ success: false, code: 'VALIDATION_ERROR',
    message: 'Registration accepts authenticated POST requests only.', retrySafe: true });
}

function doPost(event) {
  var lock;
  var locked = false;
  var writeAttempted = false;
  try {
    var properties = PropertiesService.getScriptProperties();
    var configuredSecret = properties.getProperty('APPS_SCRIPT_SHARED_SECRET');
    if (typeof configuredSecret !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(configuredSecret)) {
      return registrationFailure_('CONFIG_ERROR', true);
    }

    var parameters = event && event.parameters;
    var suppliedSecret = parameters && parameters.sharedSecret;
    if (!Array.isArray(suppliedSecret) || suppliedSecret.length !== 1 ||
        typeof suppliedSecret[0] !== 'string' || suppliedSecret[0].length > 256 ||
        !registrationSecretMatches_(configuredSecret, suppliedSecret[0])) {
      // Authentication precedes every spreadsheet, cache and lock operation.
      return registrationFailure_('AUTH_FAILED', true);
    }
    if (!registrationEnvelopeValid_(event, parameters)) {
      return registrationFailure_('VALIDATION_ERROR', true);
    }
    var application = {};
    REGISTRATION_PARAMETERS_.forEach(function (key) { application[key] = parameters[key][0]; });
    if (application.website !== '') return registrationFailure_('HONEYPOT_REJECTED', true);
    if (!registrationApplicationValid_(application)) return registrationFailure_('VALIDATION_ERROR', true);
    REGISTRATION_FIELDS_.forEach(function (key) { application[key] = application[key].trim(); });
    application.submissionId = application.submissionId.toLowerCase();

    var spreadsheetId = properties.getProperty('SPREADSHEET_ID');
    var sheetName = properties.getProperty('REGISTRATION_SHEET_NAME');
    if (typeof spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(spreadsheetId) ||
        typeof sheetName !== 'string' || !sheetName || sheetName.length > 100 ||
        REGISTRATION_CONTROLS_.test(sheetName)) {
      return registrationFailure_('CONFIG_ERROR', true);
    }
    var headerMap = registrationHeaderMap_(properties.getProperty('REGISTRATION_HEADER_MAP'));
    if (!headerMap) return registrationFailure_('CONFIG_ERROR', true);

    lock = LockService.getScriptLock();
    // A concurrent request for this same ID may still be saving. Do not permit
    // corrected data to become a new browser attempt after a lock timeout.
    if (!lock.tryLock(5000)) return registrationFailure_('LOCK_TIMEOUT', false);
    locked = true;

    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 1) return registrationFailure_('CONFIG_ERROR', true);
    var columnCount = sheet.getLastColumn();
    if (columnCount < Object.keys(headerMap).length || columnCount > 100) {
      return registrationFailure_('CONFIG_ERROR', true);
    }
    var headers = sheet.getRange(1, 1, 1, columnCount).getDisplayValues()[0];
    var columns = registrationColumns_(headers, headerMap);
    if (!columns) return registrationFailure_('CONFIG_ERROR', true);

    // All deployments of this SAME Apps Script project share this lock. The
    // durable submission ID is searched and written while exclusively locked.
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var matches = sheet.getRange(2, columns.submissionId + 1, lastRow - 1, 1)
        .createTextFinder(application.submissionId).matchEntireCell(true)
        .matchCase(false).useRegularExpression(false).findAll();
      if (matches.length > 1) return registrationFailure_('SUBMISSION_CONFLICT', false);
      if (matches.length === 1) {
        var existing = sheet.getRange(matches[0].getRow(), 1, 1, columnCount).getDisplayValues()[0];
        var existingId = existing[columns.applicationId];
        if (!REGISTRATION_RECEIPT_.test(existingId) || !existing[columns.timestamp].trim() ||
            !existing[columns.status].trim() || existing[columns.status].length > 100 ||
            REGISTRATION_CONTROLS_.test(existing[columns.status]) ||
            !registrationSameApplication_(existing, columns, application) ||
            existing[columns.submissionId].toLowerCase() !== application.submissionId) {
          return registrationFailure_('SUBMISSION_CONFLICT', false);
        }
        // A receipt replay is allowed even if a transient throttle is reached.
        // Never append a second row for an existing ID or change its status.
        return registrationSuccess_(existingId, application.submissionId);
      }
    }

    // CacheService is an inexpensive, best-effort throttle. Google may evict
    // entries early. It is NOT durable rate limiting or a spam-proof guarantee.
    if (!registrationThrottle_(application.abuseKey)) return registrationFailure_('THROTTLED', true);

    var applicationId = Utilities.getUuid();
    if (!REGISTRATION_RECEIPT_.test(applicationId)) return registrationFailure_('CONFIG_ERROR', true);
    var nextRow = lastRow + 1;
    if (nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    var values = new Array(columnCount).fill('');
    values[columns.timestamp] = new Date();
    values[columns.applicationId] = applicationId;
    values[columns.status] = 'Pending';
    values[columns.submissionId] = application.submissionId;
    ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact'].forEach(function (key) {
      values[columns[key]] = application[key];
      // Format only the new row's text cells. Preserve leading zeroes/country
      // codes; do not modify old rows or rely on spreadsheet type inference.
      sheet.getRange(nextRow, columns[key] + 1, 1, 1).setNumberFormat('@');
    });
    writeAttempted = true;
    sheet.getRange(nextRow, 1, 1, columnCount).setValues([values]);
    SpreadsheetApp.flush();
    var writtenRange = sheet.getRange(nextRow, 1, 1, columnCount);
    var written = writtenRange.getDisplayValues()[0];
    var formulas = writtenRange.getFormulas()[0];
    if (written[columns.submissionId] !== application.submissionId ||
        written[columns.applicationId] !== applicationId || written[columns.status] !== 'Pending' ||
        !written[columns.timestamp].trim() ||
        ['fullName', 'email', 'phone', 'selectedClass', 'preferredContact'].some(function (key) {
          return written[columns[key]] !== application[key] || Boolean(formulas[columns[key]]);
        })) {
      return registrationFailure_('WRITE_UNCERTAIN', false);
    }
    // Confirmation follows flush + readback while the write lock is held.
    return registrationSuccess_(applicationId, application.submissionId);
  } catch (error) {
    // A failing setValues/flush/readback can follow a successful Sheet write.
    // Never delete it, repeat an append, expose its contents, or claim success.
    return registrationFailure_(writeAttempted ? 'WRITE_UNCERTAIN' : 'CONFIG_ERROR', !writeAttempted);
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (error) { /* The execution releases its lock on termination. */ }
    }
  }
}

function registrationSecretMatches_(expected, actual) {
  // Apps Script provides no timingSafeEqual primitive. Hash both values to a
  // fixed-length digest and compare all 32 bytes without an early-exit loop.
  // This is fixed-work comparison, not a claim of runtime-level constant time.
  var left = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected, Utilities.Charset.UTF_8);
  var right = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actual, Utilities.Charset.UTF_8);
  var mismatch = 0;
  for (var index = 0; index < 32; index += 1) mismatch |= (left[index] & 255) ^ (right[index] & 255);
  return mismatch === 0;
}

function registrationEnvelopeValid_(event, parameters) {
  if (!event.postData || typeof event.postData.contents !== 'string' ||
      event.postData.contents.length > 16384 ||
      (typeof event.postData.length === 'number' && (event.postData.length < 0 || event.postData.length > 16384)) ||
      !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?\s*$/i.test(event.postData.type || '') ||
      (event.queryString && event.queryString !== '') || Object.keys(parameters).length !== REGISTRATION_PARAMETERS_.length) return false;
  return REGISTRATION_PARAMETERS_.every(function (key) {
    return Object.prototype.hasOwnProperty.call(parameters, key) && Array.isArray(parameters[key]) &&
      parameters[key].length === 1 && typeof parameters[key][0] === 'string';
  });
}

function registrationEmailValid_(value) {
  if (value.length > 254 || /\s/.test(value)) return false;
  var parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) ||
      /^\.|\.$/.test(parts[0]) || parts[0].indexOf('..') !== -1) return false;
  var labels = parts[1].split('.');
  return labels.length >= 2 && labels.every(function (label) {
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label);
  });
}

function registrationApplicationValid_(application) {
  var name = application.fullName.trim();
  var email = application.email.trim();
  var phone = application.phone.trim();
  var digits = phone.replace(/\D/g, '');
  return application.fullName.length <= 100 && name.length >= 2 &&
    !REGISTRATION_CONTROLS_.test(application.fullName) && !/^[=+@-]/.test(name) &&
    application.email.length <= 254 && !REGISTRATION_CONTROLS_.test(application.email) &&
    (!email || (registrationEmailValid_(email) && !/^[=+@-]/.test(email))) &&
    (application.preferredContact !== 'Email' || Boolean(email)) &&
    application.phone.length <= 32 && /^\+?[\d ().-]+$/.test(phone) && digits.length >= 7 && digits.length <= 15 &&
    ['Workers-in-Training', "Believers' Class", 'Baptismal Class'].indexOf(application.selectedClass) !== -1 &&
    ['Phone', 'WhatsApp', 'Email'].indexOf(application.preferredContact) !== -1 &&
    REGISTRATION_UUID_.test(application.submissionId) && /^[0-9a-f]{64}$/.test(application.abuseKey);
}

function registrationHeaderMap_(serialized) {
  var map = Object.assign({}, REGISTRATION_DEFAULT_HEADERS_);
  if (serialized) {
    var overrides;
    try { overrides = JSON.parse(serialized); } catch (error) { return null; }
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
    if (Object.keys(overrides).some(function (key) {
      return !Object.prototype.hasOwnProperty.call(map, key) || typeof overrides[key] !== 'string';
    })) return null;
    Object.keys(overrides).forEach(function (key) { map[key] = overrides[key]; });
  }
  var names = Object.keys(map).map(function (key) { return map[key]; });
  if (map.submissionId !== 'Submission ID' || names.some(function (name) {
    return !name || name.length > 100 || name.trim() !== name || REGISTRATION_CONTROLS_.test(name);
  }) || new Set(names).size !== names.length) return null;
  return map;
}

function registrationColumns_(headers, map) {
  var columns = {};
  var valid = Object.keys(map).every(function (key) {
    var index = headers.indexOf(map[key]);
    if (index < 0 || headers.lastIndexOf(map[key]) !== index) return false;
    columns[key] = index;
    return true;
  });
  return valid ? columns : null;
}

function registrationSameApplication_(record, columns, application) {
  var name = function (value) { return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); };
  var email = function (value) { return String(value).trim().toLowerCase(); };
  var phone = function (value) { return String(value).replace(/\D/g, ''); };
  return name(record[columns.fullName]) === name(application.fullName) &&
    email(record[columns.email]) === email(application.email) &&
    phone(record[columns.phone]) === phone(application.phone) &&
    record[columns.selectedClass] === application.selectedClass &&
    record[columns.preferredContact] === application.preferredContact;
}

function registrationThrottle_(abuseKey) {
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var keys = ['vh-registration-v1:global', 'vh-registration-v1:ip:' + abuseKey];
  var limits = [100, 5];
  var stored = cache.getAll(keys);
  var counters = keys.map(function (key) {
    if (!stored[key]) return { count: 0, expires: now + REGISTRATION_CACHE_WINDOW_ * 1000 };
    var counter = JSON.parse(stored[key]);
    if (!counter || !Number.isInteger(counter.count) || counter.count < 0 ||
        !Number.isFinite(counter.expires) || counter.expires > now + REGISTRATION_CACHE_WINDOW_ * 1000) {
      throw new Error('Invalid throttle state');
    }
    return counter.expires > now ? counter : { count: 0, expires: now + REGISTRATION_CACHE_WINDOW_ * 1000 };
  });
  if (counters.some(function (counter, index) { return counter.count >= limits[index]; })) return false;
  keys.forEach(function (key, index) {
    counters[index].count += 1;
    cache.put(key, JSON.stringify(counters[index]), Math.max(1, Math.ceil((counters[index].expires - now) / 1000)));
  });
  return true;
}

function registrationSuccess_(applicationId, submissionId) {
  return registrationJson_({ success: true, message: 'Your registration is confirmed.',
    applicationId: applicationId, submissionId: submissionId });
}

function registrationFailure_(code, retrySafe) {
  var messages = {
    AUTH_FAILED: 'Registration could not be authorized.',
    CONFIG_ERROR: 'Registration is temporarily unavailable.',
    VALIDATION_ERROR: 'The registration request is invalid.',
    HONEYPOT_REJECTED: 'The registration could not be accepted.',
    LOCK_TIMEOUT: 'Another request may still be saving this registration. Please contact the church.',
    THROTTLED: 'Please wait before submitting another registration.',
    SUBMISSION_CONFLICT: 'This submission needs review. Please contact the church.',
    WRITE_UNCERTAIN: 'We could not confirm the saved registration. Retry only with the same submission ID.'
  };
  var body = { success: false, code: code, message: messages[code] || messages.WRITE_UNCERTAIN,
    retrySafe: retrySafe === true };
  if (code === 'THROTTLED') body.retryAfter = REGISTRATION_CACHE_WINDOW_;
  return registrationJson_(body);
}

function registrationJson_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

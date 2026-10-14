'use strict';

// Shared by Vercel and the Worker; contains no server configuration.
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

function validateBodyShape(body) {
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

module.exports = { MAX_REQUEST_BYTES, UUID, RequestError, validateBodyShape, validateApplication };

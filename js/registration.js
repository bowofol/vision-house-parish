(() => {
  'use strict';

  const form = document.getElementById('class-registration-form');
  if (!form) return;

  const fields = {
    selectedClass: document.getElementById('registration-class'),
    fullName: document.getElementById('registration-name'),
    email: document.getElementById('registration-email'),
    phone: document.getElementById('registration-phone'),
    preferredContact: document.getElementById('registration-contact')
  };
  const button = document.getElementById('registration-submit');
  const honeypot = document.getElementById('registration-website');
  const feedback = document.getElementById('registration-status');
  const emailRequirement = document.getElementById('email-requirement');
  const closedNotice = document.getElementById('registration-closed');
  const badge = document.querySelector('.registration-panel-heading .status-badge');
  const privacyCopy = document.querySelector('#registration-privacy p');
  const originalBadge = badge.textContent;
  const originalPrivacy = privacyCopy.textContent;
  const touched = new Set();
  const classOptions = new Set(['Workers-in-Training', "Believers' Class", 'Baptismal Class']);
  const contactOptions = new Set(['Phone', 'WhatsApp', 'Email']);
  const config = window.VisionHouseConfig?.registration;
  const requestTimeout = 20000;
  const safeApplicationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const safeSubmissionId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const uncertainCodes = new Set([
    'PENDING', 'UNCERTAIN', 'UNCONFIRMED', 'UPSTREAM_TIMEOUT',
    'UPSTREAM_FAILED', 'INVALID_UPSTREAM_RESPONSE', 'IDEMPOTENCY_CONFLICT'
  ]);
  const safeCodes = new Set([
    'INVALID_REQUEST', 'INVALID_FIELDS', 'HONEYPOT_REJECTED', 'RATE_LIMITED',
    'REGISTRATION_CLOSED', 'FORBIDDEN', 'SERVICE_UNAVAILABLE', 'INVALID_IDEMPOTENCY_KEY'
  ]);
  let currentState = 'unavailable';
  let isSubmitting = false;
  let retryFrozen = false;
  let serverClosed = false;
  let attempt;
  let receipt;
  let resetButton;

  // Only this relative same-origin API is allowed. Both the public flag and
  // the server's private registration gate must be open after verification.
  const submissionAdapter = Object.freeze({
    available: config?.registrationEnabled === true && config.apiPath === '/api/register' &&
      typeof window.crypto?.randomUUID === 'function' && typeof window.fetch === 'function' &&
      typeof window.AbortController === 'function',
    async submit(application, idempotencyKey, signal) {
      return window.fetch('/api/register', {
        method: 'POST',
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(application),
        signal
      });
    }
  });

  const feedbackStates = Object.freeze({
    unavailable: {
      text: 'Applications cannot be submitted yet. No information has been sent.',
      buttonText: 'Registration not open yet'
    },
    ready: {
      text: 'Complete the form to submit your class registration for church review.',
      buttonText: 'Submit registration'
    },
    loading: {
      text: 'Sending your registration. Please wait for confirmation.',
      buttonText: 'Sending registration…'
    },
    failure: {
      text: 'Your registration was not submitted. Please review the form before trying again.',
      buttonText: 'Try again'
    },
    uncertain: {
      text: 'We could not confirm whether your registration was received. Please contact the church before trying again.',
      buttonText: 'Please contact the church'
    },
    success: {
      text: 'Your registration has been received and is awaiting church review.',
      buttonText: 'Registration received'
    }
  });

  const setFeedback = (state, message) => {
    currentState = state;
    const current = feedbackStates[state] || feedbackStates.unavailable;
    feedback.dataset.state = state;
    feedback.textContent = message || (state === 'unavailable' && serverClosed
      ? 'Registration is currently closed. Your application was not accepted.' : current.text);
    button.textContent = current.buttonText;
    button.disabled = !submissionAdapter.available || serverClosed || retryFrozen ||
      ['unavailable', 'loading', 'success', 'uncertain'].includes(state);
    form.setAttribute('aria-busy', String(state === 'loading'));
    const lockFields = ['loading', 'success', 'uncertain'].includes(state);
    Object.values(fields).forEach((field) => { field.disabled = lockFields; });
  };

  const updatePresentation = () => {
    const open = submissionAdapter.available && !serverClosed;
    closedNotice.hidden = open;
    badge.textContent = open ? 'Class registration' : originalBadge;
    privacyCopy.textContent = submissionAdapter.available
      ? 'Your details are sent to the church’s registration service for validation and, when registration is open, church review. Please enter only the contact information requested.'
      : originalPrivacy;
    if (serverClosed) {
      closedNotice.querySelector('strong').textContent = 'Online registration is currently closed.';
      closedNotice.querySelector('p').textContent = 'Your application was not accepted. Please wait until church leadership opens registration.';
    }
    form.setAttribute('aria-describedby', open
      ? 'registration-privacy' : 'registration-closed registration-privacy');
  };

  const updateEmailRequirement = () => {
    const emailPreferred = fields.preferredContact.value === 'Email';
    fields.email.required = emailPreferred;
    emailRequirement.textContent = emailPreferred ? '(required for email contact)' : '(optional)';
  };

  const errorFor = (key) => {
    const field = fields[key];
    const value = field.value.trim();
    if (key === 'selectedClass') {
      return classOptions.has(value) ? '' : 'Please choose the class you are interested in.';
    }
    if (key === 'fullName') {
      if (!value) return 'Please enter your full name.';
      if (value.length < 2) return 'Please enter at least two characters for your name.';
      if (value.length > 100) return 'Please keep your name within 100 characters.';
      return '';
    }
    if (key === 'email') {
      if (!value) return fields.email.required ? 'Please enter an email address for email contact.' : '';
      return field.validity.typeMismatch || value.length > 254
        ? 'Please enter a valid email address, such as name@example.com.' : '';
    }
    if (key === 'phone') {
      if (!value) return 'Please enter a phone number where you can be contacted.';
      const digits = value.replace(/\D/g, '');
      return value.length > 32 || !/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15
        ? 'Please enter a valid phone number with 7–15 digits. A country code, spaces and hyphens are welcome.' : '';
    }
    if (key === 'preferredContact') {
      return contactOptions.has(value) ? '' : 'Please choose a preferred contact method.';
    }
    return '';
  };

  const showFieldError = (key, message) => {
    const field = fields[key];
    document.getElementById(`${field.id}-error`).textContent = message;
    field.setAttribute('aria-invalid', String(Boolean(message)));
  };

  const validateField = (key) => {
    const message = errorFor(key);
    showFieldError(key, message);
    return !message;
  };

  Object.entries(fields).forEach(([key, field]) => {
    field.addEventListener('blur', () => {
      touched.add(key);
      validateField(key);
    });
    field.addEventListener('input', () => {
      if (touched.has(key)) validateField(key);
    });
    field.addEventListener('change', () => {
      if (key === 'preferredContact') {
        updateEmailRequirement();
        if (touched.has('email')) validateField('email');
      }
      touched.add(key);
      validateField(key);
    });
  });

  const validateForm = () => {
    updateEmailRequirement();
    let firstInvalid;
    Object.keys(fields).forEach((key) => {
      touched.add(key);
      if (!validateField(key) && !firstInvalid) firstInvalid = fields[key];
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  };

  const safeMessage = (value, fallback) => typeof value === 'string' &&
    value.trim().length > 0 && value.length <= 400 ? value.trim() : fallback;

  const freezeRetry = () => {
    retryFrozen = true;
    setFeedback('uncertain');
  };

  const showReceipt = (applicationId) => {
    // A receipt is added only after an explicit, valid confirmed API response.
    receipt = document.createElement('p');
    receipt.className = 'registration-state';
    receipt.id = 'registration-receipt';
    receipt.textContent = `Application reference: ${applicationId}`;
    resetButton = document.createElement('button');
    resetButton.type = 'reset';
    resetButton.className = 'button button-primary';
    resetButton.textContent = 'Start another registration';
    feedback.parentElement.append(receipt, resetButton);
  };

  const showServerFieldErrors = (errors) => {
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return;
    let firstInvalid;
    Object.keys(fields).forEach((key) => {
      const message = errors[key];
      if (typeof message !== 'string' || !message.trim() || message.length > 240) return;
      touched.add(key);
      showFieldError(key, message.trim());
      if (!firstInvalid) firstInvalid = fields[key];
    });
    firstInvalid?.focus();
  };

  const submitApplication = async (application) => {
    isSubmitting = true;
    setFeedback('loading');
    const controller = new window.AbortController();
    const timeout = window.setTimeout(() => controller.abort(), requestTimeout);
    try {
      // The UUID and payload signature live only in this page's memory.
      // Reuse the UUID for an unchanged safe retry. Changed data after a safe
      // rejection is a new attempt; uncertain attempts cannot be retried here.
      const signature = JSON.stringify(application);
      if (!attempt || attempt.signature !== signature) {
        attempt = { key: window.crypto.randomUUID().toLowerCase(), signature };
      }
      const response = await submissionAdapter.submit(application, attempt.key, controller.signal);
      if (response.type === 'opaque' || response.type === 'opaqueredirect') {
        freezeRetry();
        return;
      }
      const result = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        freezeRetry();
        return;
      }
      if (response.ok && result.success === true && typeof result.applicationId === 'string' &&
          safeApplicationId.test(result.applicationId) && typeof result.submissionId === 'string' &&
          safeSubmissionId.test(result.submissionId) && result.submissionId === attempt.key) {
        setFeedback('success');
        showReceipt(result.applicationId);
        return;
      }
      const code = typeof result.code === 'string' ? result.code.toUpperCase() : '';
      if (result.success !== false || result.retrySafe !== true || uncertainCodes.has(code) ||
          !safeCodes.has(code)) {
        freezeRetry();
        return;
      }
      if (code === 'REGISTRATION_CLOSED') {
        serverClosed = true;
        updatePresentation();
        setFeedback('unavailable', safeMessage(result.message, 'Registration is not open yet. Your application was not accepted.'));
        return;
      }
      let message = safeMessage(result.message, feedbackStates.failure.text);
      if (response.status === 429 || code === 'RATE_LIMITED') {
        const seconds = Number.isInteger(result.retryAfter) && result.retryAfter > 0 && result.retryAfter <= 3600
          ? result.retryAfter : undefined;
        message = seconds
          ? `Please wait ${seconds} seconds before trying again. No automatic retry will occur.`
          : 'Please wait before trying again. No automatic retry will occur.';
      }
      setFeedback('failure', message);
      if (code === 'INVALID_FIELDS') showServerFieldErrors(result.fields);
    } catch {
      // Network failures, timeouts and unreadable responses may have followed
      // a successful server write. Never retry or claim failure was definite.
      freezeRetry();
    } finally {
      window.clearTimeout(timeout);
      isSubmitting = false;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (isSubmitting || retryFrozen || currentState === 'success') {
      button.disabled = true;
      return;
    }
    if (!submissionAdapter.available || serverClosed) {
      validateForm();
      setFeedback('unavailable');
      return;
    }
    if (!validateForm()) {
      setFeedback('failure', 'Please review the highlighted fields before submitting.');
      return;
    }
    const application = {
      ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value.trim()])),
      website: honeypot.value
    };
    void submitApplication(application);
  });

  form.addEventListener('reset', (event) => {
    if (isSubmitting || retryFrozen) {
      event.preventDefault();
      return;
    }
    attempt = undefined;
    receipt?.remove();
    resetButton?.remove();
    receipt = undefined;
    resetButton = undefined;
    // Native defaults are restored after the reset event.
    window.setTimeout(() => {
      touched.clear();
      // Hidden input values also change their native defaults, so a normal
      // form reset alone would preserve a previously filled honeypot.
      honeypot.value = '';
      Object.values(fields).forEach((field) => {
        field.removeAttribute('aria-invalid');
        document.getElementById(`${field.id}-error`).textContent = '';
      });
      updateEmailRequirement();
      setFeedback(submissionAdapter.available && !serverClosed ? 'ready' : 'unavailable');
    }, 0);
  });

  updatePresentation();
  updateEmailRequirement();
  setFeedback(submissionAdapter.available ? 'ready' : 'unavailable');
})();

(() => {
  'use strict';

  const form = document.getElementById('class-registration-form');
  if (!form || window.VisionHouseConfig?.registration?.demoMode !== true) return;

  // This controller has no transport, application IDs or persistent storage.
  // Real registration is a separate controller and refuses to run in demo mode.
  const fields = {
    selectedClass: document.getElementById('registration-class'),
    fullName: document.getElementById('registration-name'),
    email: document.getElementById('registration-email'),
    phone: document.getElementById('registration-phone'),
    preferredContact: document.getElementById('registration-contact')
  };
  const button = document.getElementById('registration-submit');
  const feedback = document.getElementById('registration-status');
  const honeypot = document.getElementById('registration-website');
  const emailRequirement = document.getElementById('email-requirement');
  const demoNotice = document.getElementById('registration-demo-notice');
  const closedNotice = document.getElementById('registration-closed');
  const classes = new Set(['Workers-in-Training', "Believers' Class", 'Baptismal Class']);
  const contacts = new Set(['Phone', 'WhatsApp', 'Email']);
  const touched = new Set();
  let completed = false;
  let resetButton;

  const setFeedback = (state, message) => {
    feedback.dataset.state = state;
    feedback.textContent = message;
    button.textContent = completed ? 'Demo completed' : 'Submit demo registration';
    button.disabled = completed;
    form.setAttribute('aria-busy', 'false');
    Object.values(fields).forEach((field) => { field.disabled = completed; });
  };

  const updateEmailRequirement = () => {
    const required = fields.preferredContact.value === 'Email';
    fields.email.required = required;
    emailRequirement.textContent = required ? '(required for email contact)' : '(optional)';
  };

  const errorFor = (key) => {
    const field = fields[key];
    const value = field.value.trim();
    if (key === 'selectedClass') return classes.has(value) ? '' : 'Please choose a class for the demo.';
    if (key === 'fullName') return value.length >= 2 && value.length <= 100
      ? '' : 'Please enter a demo name of 2–100 characters.';
    if (key === 'email') {
      if (!value) return field.required ? 'Please enter a demo email address for email contact.' : '';
      return field.validity.typeMismatch || value.length > 254 ? 'Please enter a valid demo email address.' : '';
    }
    if (key === 'phone') {
      const digits = value.replace(/\D/g, '');
      return value.length <= 32 && /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15
        ? '' : 'Please enter a demo phone number with 7–15 digits.';
    }
    if (key === 'preferredContact') return contacts.has(value) ? '' : 'Please choose a contact method for the demo.';
    return '';
  };

  const validateField = (key) => {
    const message = errorFor(key);
    const field = fields[key];
    field.setAttribute('aria-invalid', String(Boolean(message)));
    document.getElementById(`${field.id}-error`).textContent = message;
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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (completed) {
      setFeedback('demo-success', 'Demo Registration Successful — No application has been submitted.');
      return;
    }
    updateEmailRequirement();
    let firstInvalid;
    Object.keys(fields).forEach((key) => {
      touched.add(key);
      if (!validateField(key) && !firstInvalid) firstInvalid = fields[key];
    });
    if (firstInvalid || honeypot.value !== '') {
      firstInvalid?.focus();
      setFeedback('demo-failure', 'Please review the highlighted demo fields. No application has been submitted.');
      return;
    }

    completed = true;
    setFeedback('demo-success', 'Demo Registration Successful — No application has been submitted.');
    resetButton = document.createElement('button');
    resetButton.id = 'registration-demo-reset';
    resetButton.type = 'reset';
    resetButton.className = 'button button-primary';
    resetButton.textContent = 'Start another demo';
    feedback.parentElement.append(resetButton);
  });

  form.addEventListener('reset', () => {
    // Native form defaults are restored after the reset event.
    window.setTimeout(() => {
      completed = false;
      touched.clear();
      resetButton?.remove();
      resetButton = undefined;
      honeypot.value = '';
      Object.values(fields).forEach((field) => {
        field.removeAttribute('aria-invalid');
        document.getElementById(`${field.id}-error`).textContent = '';
      });
      updateEmailRequirement();
      setFeedback('demo-ready', 'Try the form using fictional details. This demo does not submit or save an application.');
    }, 0);
  });

  demoNotice.hidden = false;
  closedNotice.hidden = true;
  document.querySelector('.registration-panel-heading .status-badge').textContent = 'Demo Mode';
  document.getElementById('registration-form-title').textContent = 'Class registration demo';
  document.querySelector('#registration-privacy p').textContent = 'Use fictional details for this presentation. This demo keeps entries only on this page and does not send or save an application.';
  form.setAttribute('aria-describedby', 'registration-demo-notice registration-privacy');
  updateEmailRequirement();
  setFeedback('demo-ready', 'Try the form using fictional details. This demo does not submit or save an application.');
})();

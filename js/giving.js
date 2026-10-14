(() => {
  'use strict';

  const host = document.querySelector('[data-giving]');
  if (!host) return;
  const accounts = window.VisionHouseData?.giving?.accounts;
  const clean = value => typeof value === 'string' ? value.trim() : '';

  host.querySelectorAll('[data-giving-account]').forEach(card => {
    const matches = Array.isArray(accounts)
      ? accounts.filter(account => account?.id === card.dataset.givingAccount) : [];
    const account = matches.length === 1 ? matches[0] : null;
    const bankName = clean(account?.bankName);
    const accountName = clean(account?.accountName);
    const accountNumber = clean(account?.accountNumber);
    const title = clean(account?.title);
    const copyButton = card.querySelector('[data-copy-account]');
    const copyLabel = card.querySelector('[data-copy-label]');
    const feedback = card.querySelector('[data-copy-feedback]');
    if (!copyButton || !copyLabel || !feedback) return;

    if (account?.verified !== true || !bankName || !accountName || !title || !/^\d{10}$/.test(accountNumber)) {
      card.querySelectorAll('[data-bank-name], [data-account-name], [data-account-number]').forEach(field => {
        field.textContent = 'Please contact the church for details.';
      });
      copyButton.disabled = true;
      feedback.textContent = 'Account details are currently unavailable.';
      return;
    }

    card.querySelector('[data-bank-name]').textContent = bankName;
    card.querySelector('[data-account-name]').textContent = accountName;
    card.querySelector('[data-account-number]').textContent = accountNumber;
    copyButton.disabled = false;

    copyButton.addEventListener('click', async () => {
      if (copyButton.disabled) return;
      feedback.textContent = '';
      if (!navigator.clipboard?.writeText) {
        feedback.textContent = 'Copy unavailable. Select the number to copy it manually.';
        return;
      }
      copyButton.disabled = true;
      copyButton.setAttribute('aria-busy', 'true');
      copyLabel.textContent = 'Copying…';
      try {
        await navigator.clipboard.writeText(accountNumber);
        feedback.textContent = `${title} number copied.`;
      } catch {
        feedback.textContent = "Couldn't copy. Select the number to copy it manually.";
      } finally {
        copyButton.disabled = false;
        copyButton.removeAttribute('aria-busy');
        copyLabel.textContent = 'Copy Account Number';
      }
    });
  });
})();

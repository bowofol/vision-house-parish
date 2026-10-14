# Browser-only registration demo

**Demo Mode is disabled.** The registration page no longer loads the demo
controller or shows demo wording. It now uses the real `/api/register` process
only through the loopback test override. See [REGISTRATION-LOCAL-TEST.md](REGISTRATION-LOCAL-TEST.md)
for the current manual testing instructions.

The separate demo controller is retained for future use and isolated regression
tests. Its former confirmation was:

> Demo Registration Successful — No application has been submitted.

Those demo behaviors are inactive. Current local testing submits real data when
you manually click **Submit registration**; it can create a Google Sheet row.

## Isolation from real registration

- Public `demoMode: false` disables `js/registration-demo.js`, which is not loaded
  by the registration page.
- `registrationEnabled: false` keeps the real frontend gate closed.
- Real frontend initialization additionally requires explicit `demoMode: false`.
- A page-specific `form-action 'none'` policy blocks native form posts.
- The retained demo controller makes no network requests with form data and uses
  no persistent storage or real receipts.
- Missing scripts leave the static submit button disabled. The production server
  gate remains closed and ignores the local testing switch.

Production registration still requires separately reviewed changes and live QA.
Local testing does not authorize opening public registration, committing,
pushing or deploying.

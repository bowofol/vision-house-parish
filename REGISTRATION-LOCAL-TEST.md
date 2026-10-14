# One manual localhost registration test

Demo Mode is disabled. The production configuration stays `demoMode: false`, `registrationEnabled: false` and `REGISTRATION_ENABLED=false`. Only the local dev server reads the ignored `.env.local` setting `REGISTRATION_LOCAL_TEST_ENABLED=true` to enable real registration on loopback.

Your manual submission sends a real request to the configured Google backend and can write a Sheet row. Use fictional details reserved for testing, keep the existing upstream URL/key unchanged, and check the resulting row privately. No applications are submitted automatically. Enabling local testing does not enable public registration or authorize a commit, Git push or deployment.

For an authorized test, set only `REGISTRATION_LOCAL_TEST_ENABLED=true` in the ignored `.env.local`. The `npm.cmd run dev` server reads this switch and temporarily opens its local API handler and the HTTP response for the frontend configuration, explicitly selecting `demoMode: false`. It never edits the public configuration or changes the persistent API gate.

The override requires a server bound to `127.0.0.1`, a loopback client, and a `127.0.0.1` Host header matching its listening port. Other hostnames, including `localhost`, are rejected in test mode. Each API request must have the exact same local Origin. Production/Vercel environments and an already open persistent gate are rejected. Vercel's deployed API does not read the local switch. The public flag remains false; remote Vercel settings were not inspected or changed.

## Start and test manually

1. Use Node.js 22. Stop the current `npm.cmd run dev` process with **Ctrl+C**. Environment settings and server code load at startup.
2. The existing `.env.local` now has `REGISTRATION_LOCAL_TEST_ENABLED=true` and `REGISTRATION_ENABLED=false`; its URL and key are unchanged. Run `npm.cmd run dev` from this project directory. Future restarts read the same settings without a temporary environment override.
3. Open **http://127.0.0.1:8000/registration.html** in Chrome and refresh. Use the port printed by the server if `PORT` is customized. Do not use a file URL, Live Server or a different origin.
4. Enter the approved fictional name, reserved example email address and fictional phone number. Choose **Believers' Class** and **Email**. Leave the hidden honeypot empty. Do not use an actual applicant's contact details.
5. Open Chrome DevTools → **Network** before clicking **Submit registration** once. A confirmed result must show the page's received confirmation and an application reference. Privately retain `applicationId` and `submissionId` from the `/api/register` response, then verify exactly one matching fictional row, all field values, preserved phone formatting and `Pending` status in your private Sheet. The page displays the application ID; the submission ID is in the JSON response and the request's `Idempotency-Key` header. Keep receipts, browser captures and Sheet data out of release files.
6. Do not click **Start another registration**. If confirmation is uncertain or times out, retain the request's submission ID and inspect the Sheet before any further attempt; refreshing would lose the page's in-memory ID.

The included automated tests use isolated invalid requests or mocked backends; they do not verify a live browser submission. This loopback procedure also cannot establish that Vercel or an HTTPS phone browser works. Those require separate isolated Vercel QA, documented in [REGISTRATION-API-GUIDE.md](REGISTRATION-API-GUIDE.md).

## Restore closed registration immediately

1. Press **Ctrl+C** in the dev-server terminal to stop accepting requests immediately.
2. Set `REGISTRATION_LOCAL_TEST_ENABLED=false` in `.env.local`, keeping `REGISTRATION_ENABLED=false` and `registrationEnabled: false` in `js/registration-config.js`.
3. Leave the server stopped, or restart `npm.cmd run dev` and refresh Chrome to confirm the closed registration notice and disabled submit button return. Demo Mode remains disabled. Saving `.env.local` without stopping/restarting the server does not close an already running test handler.

This procedure does not enable public registration, change the existing key, commit, push to GitHub or deploy to Vercel. Never commit `.env.local`, private test records or local QA state.

## If a restarted page still says registration is closed

An old process can continue holding port 8000, leaving Chrome connected to its earlier configuration. Stop that project's old server before restarting the authorized local test.

Check that the new terminal actually prints **Local registration test enabled at 127.0.0.1 only**. A port-in-use error means it did not start; stop the previous project server first. The response for `/js/registration-config.js` includes `X-VisionHouse-Local-Registration: enabled` in local test mode and `disabled` when the real API is closed. Chrome DevTools → Network can inspect this non-secret status. The response is uncached and explicitly provides the local configuration before the registration controllers run.

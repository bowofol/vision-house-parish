# Registration API and Google Sheets setup

The real registration system uses the same-origin Vercel `/api/register` function with Google Apps Script and the existing private Google Sheet. No database package or paid storage service is required. Demo Mode is disabled; real submissions are available only through the [loopback testing override](REGISTRATION-LOCAL-TEST.md).

**Public registration remains closed.** Keep `demoMode: false` and `registrationEnabled: false` in `js/registration-config.js` and `REGISTRATION_ENABLED=false` in Vercel. The ignored local setting `REGISTRATION_LOCAL_TEST_ENABLED=true` enables only the loopback dev server for your manual test; Vercel ignores it. The source and isolated tests do not establish that the current production deployment accepts or saves applications. Local testing does not authorize a commit, Git push, deployment or public launch. Private live test records and local QA tooling are excluded from the release.

## Registration files

- `api/register.js`: POST-only validation, private authentication and API responses.
- `lib/registration-upstream.js`: one authenticated POST, bounded HTTPS redirects, deadline and verified receipt.
- `registration.html`, `css/features.css`, `css/registration.css`, `js/navigation.js`, `js/registration-config.js`, `js/registration.js`: form, navigation, closed public frontend gate, submission-ID reuse and matching receipt verification. Existing tracked shared CSS, `js/main.js`, logo and social image remain dependencies. The inactive `js/registration-demo.js` is retained separately and is not loaded by the page.
- `apps-script/Code.gs`: registration script to compare with the existing deployed Google project before any separately authorized update.
- `scripts/dev-server.js`, `package.json`: dependency-free Node.js 22 local server and test commands.
- `.env.example`: private configuration template without credentials.
- `vercel.json`, `.vercelignore`: protect server files and exclude Apps Script source from public hosting.
- `tests/register.test.js`, `tests/apps-script.test.js`, `tests/registration-integration.test.js`, `tests/registration-frontend.test.js`, `tests/dev-server.test.js` and `tests/helpers/apps-script-harness.js`: isolated tests and Google-service fixtures.
- This guide and [REGISTRATION-LOCAL-TEST.md](REGISTRATION-LOCAL-TEST.md): self-contained setup and optional loopback testing instructions.

Redis is not used. The registration bridge requires only the private variables below; `package.json` remains dependency-free.

## Private Vercel environment variables

| Variable | Value |
| --- | --- |
| `REGISTRATION_ENABLED` | Keep `false` for the closed production release. |
| `REGISTRATION_ALLOWED_ORIGIN` | Exact website origin without path/trailing slash; HTTPS on Vercel. Local: `http://127.0.0.1:8000`. |
| `APPS_SCRIPT_EXEC_URL` | Actual deployed `https://script.google.com/macros/s/.../exec` URL, without query, credentials or fragment. |
| `APPS_SCRIPT_SHARED_SECRET` | Reuse the unchanged existing secret, identical to the Apps Script property of this name; the validator accepts 32–256 non-whitespace ASCII characters. |

Real values belong in ignored `.env.local` or Vercel server-side environment settings. Never put them in HTML, browser code, URLs or Git. Public `js/registration-config.js` contains only `demoMode: false`, `registrationEnabled: false` and `apiPath: '/api/register'`.

Privately confirm that the existing Vercel value matches Apps Script **Project Settings → Script Properties**. Keep the existing registration security key unchanged. Do not generate a replacement, print it, paste it into `Code.gs`, or include it in release files.

`REGISTRATION_ALLOWED_ORIGIN` is required once the API gate is enabled. For the existing project, use `https://vision-house-parishweb-pi.vercel.app` without a path or trailing slash. Redirect alternate domains to that origin. With the gate closed, the API returns `503 REGISTRATION_CLOSED` before reading upstream settings. Vercel environment changes apply to a new deployment; setting variables alone does not update an existing deployment.

## Manual Google Sheet migration

1. Inspect the existing private Sheet and deployed script. Before any required migration, back them up and record deployment settings and approval functions/triggers.
2. If missing, append a column at the right of the existing registration tab with exact row-1 header **`Submission ID`**. Leave old rows blank in that column. Do not create a duplicate column, delete, backfill, reformat, reorder or reset existing records.
3. Confirm each required header occurs exactly once in row 1. Use the defaults below or map existing labels through `REGISTRATION_HEADER_MAP`; existing columns do not need renaming. Add any genuinely missing required column manually after review, leaving existing rows untouched.
4. Confirm Script Properties `SPREADSHEET_ID` identifies the existing private spreadsheet, `REGISTRATION_SHEET_NAME` is the exact tab name, and `APPS_SCRIPT_SHARED_SECRET` matches the unchanged existing Vercel key.
5. If needed, set optional `REGISTRATION_HEADER_MAP` to JSON mapping field keys to actual case-sensitive labels. Include only labels that differ from defaults. `submissionId` must retain the literal `Submission ID` header.

| Script key | Default row-1 header |
| --- | --- |
| `timestamp` | `Timestamp` |
| `applicationId` | `Application ID` |
| `fullName` | `Full Name` |
| `email` | `Email` |
| `phone` | `Phone` |
| `selectedClass` | `Class` |
| `preferredContact` | `Preferred Contact` |
| `status` | `Status` |
| `submissionId` | `Submission ID` |

For example, **only if these are your actual existing labels**:

```json
{"timestamp":"Date Submitted","selectedClass":"Selected Class"}
```

Missing or ambiguous headers stop registration. The script never creates a Sheet, tab or headers. Honeypot, secret and throttle digest are not applicant columns. Each new application gets `Pending`; receipt replay does not reset a later coordinator status. Old rows with blank IDs cannot be deduplicated through the new protocol.

## Existing Apps Script deployment

Compare [apps-script/Code.gs](apps-script/Code.gs) with the version actually served by the existing `/exec` deployment. It contains the complete registration `doPost` and helpers. Update the Google source only if a reviewed difference requires it and the update is separately authorized. Retain separate approval functions/triggers your existing workflow requires. Avoid conflicting `doPost` definitions and use the V8 runtime.

Confirm spreadsheet access is authorized under the intended owner and the web app executes as that owner. Its access setting must let the server call without an interactive Google sign-in. The script independently authenticates registration POSTs before Sheet access. Use the actual deployed `/exec` URL in Vercel; do not use `/dev` or the editor URL.

Editing source alone does not update a versioned deployment. Coordinate Apps Script, Vercel configuration and API changes: the new API rejects legacy receipts lacking a matching submission ID. Keep both gates closed during migration. Google's [Content Service guide](https://developers.google.com/apps-script/guides/content) explains its response redirects. The bridge follows only HTTPS `script.googleusercontent.com/macros/echo` redirects using GET, without the secret or applicant POST body.

## Requests and confirmation

Only the real controller, when separately enabled with explicit `demoMode: false`, posts exactly six strings as JSON to `/api/register`. The demo controller makes no requests:

```text
fullName, email, phone, selectedClass, preferredContact, website
```

A cryptographically generated UUIDv4 travels in `Idempotency-Key`. An unchanged safe retry reuses it; double-clicks do not create another request. Confirmed pre-write rejection permits correction and a new attempt. Timeouts, unconfirmed writes and ambiguous responses freeze the form for church follow-up. No automatic retry or replacement ID is generated. Attempt state lives in page memory; reloading loses it.

The API forwards nine URL-encoded parameters: the six fields plus canonical lowercase `submissionId`, private `sharedSecret` and `abuseKey`. The latter is an HMAC-SHA256 digest of the trusted client IP; the raw IP is not forwarded. The secret appears only in the HTTPS POST body to the configured Google endpoint.

Classes remain exactly `Workers-in-Training`, `Believers' Class`, `Baptismal Class`; contact methods remain `Phone`, `WhatsApp`, `Email`. Email is optional except for `Email` contact.

Apps Script validates authentication, parameter names/types, UUID and applicant data. Under `LockService.getScriptLock()`, it checks existing submission IDs and either returns the matching saved receipt or writes one new row. Receipt replay compares names with normalized case/spacing, emails without case differences, phone digits, and exact class/contact values. A substantively changed payload, multiple matching rows or an incomplete receipt fails for manual review. Applicant cells use literal text to preserve leading phone zeroes and avoid formulas. Flush/readback verifies the exact new field values before success.

Required successful response:

```json
{"success":true,"message":"Your registration is confirmed.","applicationId":"...","submissionId":"the-request-uuid"}
```

API and browser both verify the receipt ID and matching submission ID. HTTP 200, an opaque response or a sent request never establishes success. API messages are fixed, without reflecting backend errors or personal data.

Known pre-write backend failures include `retrySafe: true` and an explicit code. The bridge recognizes validation, honeypot, authentication/configuration and throttling rejection. Lock timeout stays uncertain because another request with that ID may still be writing. Unknown errors, invalid responses, conflicts and write uncertainty also return `retrySafe: false`. An authorized controlled recovery must retain the original ID.

## Protections and limitations

- POST-only API, exact origin check, trusted Vercel IP header, 4 KiB JSON limit, strict six-field schema, length/format validation and empty honeypot. Apps Script independently validates its bounded nine-parameter request. The digest uses Vercel's `x-vercel-forwarded-for` header, described in its [request-header documentation](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for); an extra proxy can make multiple visitors share a throttle bucket.
- The 8-second deadline covers fetch, redirects and response reading. Responses are bounded to 16 KiB. Redirects cannot repost applicant data. Application code does not log applicant data or secrets.
- Unauthorized calls fail before Sheet access. Apps Script uses fixed-work comparison of SHA-256 digest bytes. JavaScript does not guarantee strict constant-time execution; this avoids an early-exit plaintext comparison.
- Script locking serializes ID checks/writes in **one Apps Script project**. Other scripts or manual writers must preserve IDs and respect the protocol. Locks are not transactions across unrelated writers. See [Google's LockService reference](https://developers.google.com/apps-script/reference/lock/lock-service).
- CacheService modestly limits new attempts to 5 per keyed client digest and 100 overall per 15 minutes. Saved duplicate receipts are retrieved before throttling. Cache keys contain a keyed digest or global label; values contain only counters/times.
- Cache entries can disappear early and counters reset. Origin checks can be spoofed by non-browser callers; distributed traffic and direct public `/exec` calls can consume quotas. CacheService is not durable rate limiting or denial-of-service protection. Google describes expiration as a suggestion in its [Cache reference](https://developers.google.com/apps-script/reference/cache/cache). No paid service was introduced.
- Deduplication applies to the same retained ID. New IDs, lost page state, altered/deleted IDs and pre-migration rows can allow another application for the same person. Never delete ID cells to resolve uncertainty; inspect the ID/receipt first.
- Post-write timeouts or readback failures may leave a saved row. Staff can inspect it; an authorized controlled retry of the same ID can return its completed receipt. Incomplete or contradictory rows require manual review. This is not an unconditional exactly-once guarantee under arbitrary storage failures or manual changes.
- Keep the Sheet private and limit Sheet/project editors. Script administrators can access secrets. Do not enable request-body logging in hosting or Google tools.

## Local testing

Use Node.js 22; no package installation is needed:

```powershell
if (-not (Test-Path -LiteralPath .env.local)) {
  Copy-Item -LiteralPath .env.example -Destination .env.local
}
npm.cmd test
npm.cmd run dev
```

If `.env.local` already exists, edit it instead of overwriting it. Keep `REGISTRATION_ENABLED=false`. `REGISTRATION_LOCAL_TEST_ENABLED=true` enables the loopback test handler; `false` closes it. Restart the server after environment edits. Open `http://127.0.0.1:8000/registration.html` through `npm.cmd run dev`, not a file URL or plain static server. The persistent frontend remains closed; only this local HTTP configuration selects the real controller and opens its local gate.

The included automated tests cover validation, authentication, honeypot, throttling/cache behavior, ID replay/conflict, simulated concurrency, `Pending` writes, exact readback, uncertainty, redirects, deadlines, invalid receipts, browser states and local test isolation. They run the actual API and `Code.gs` together against mocked Google services and response redirects. They do not use private credentials or send live Google requests.

These tests do not establish actual Google LockService behavior, permissions, quotas, Vercel deployment behavior, or live Sheet writes. Your manual loopback test should verify a confirmed application reference against its actual Sheet row. This localhost-only setup cannot be accessed from another phone or establish a successful public phone registration.

The optional loopback override is documented in [REGISTRATION-LOCAL-TEST.md](REGISTRATION-LOCAL-TEST.md). `.env.example` keeps `REGISTRATION_LOCAL_TEST_ENABLED=false`. Vercel's API does not read that switch; the local server refuses it in production/Vercel environments. Do not include ignored private QA helpers or their retained state in the release.

## Closed release publication checks

Publication requires a later explicit authorization to commit, push and deploy. For that closed deployment, keep both gates false and reuse the existing Vercel project. Confirm Node.js 22, that the project serves the repository root rather than an unrelated build output, and that `/api/register` is included as a server function with its `lib/registration-upstream.js` dependency.

After an authorized closed deployment, verify `/registration.html` shows the closed notice with submission disabled, a POST to `/api/register` returns `503 REGISTRATION_CLOSED`, and private environment files, server source, Apps Script source, tests and Markdown documents cannot be fetched publicly. A closed API POST does not forward an application to Google. Keep any production/preview environment gates false; deploying these closed files does not authorize a live QA submission or launch.

## Required live checks before enabling

1. Obtain separate authorization for live QA. Complete any required backup, header migration/mapping and private settings checks. Review approval workflows. Keep production gates false and the existing key unchanged.
2. Use an isolated QA/Preview deployment or the documented loopback test mode, with a private QA Sheet or explicitly approved fictional records. A Preview API needs its exact HTTPS preview origin and server-only credentials; opening a QA UI/server gate must not change production gates.
3. Send one approved fresh test application/UUID. Verify the returned IDs against exactly one actual Sheet row, including `Pending`, field values and leading phone zeroes. Replaying an existing receipt alone does not exercise a new append.
4. Repeat the same body/UUID, including concurrently. Confirm one row and the same receipt. Test changed-data conflict, unauthorized direct calls, invalid fields, honeypot, throttling and lock contention with no extra rows. Test uncertainty using a controlled QA backend and same-ID recovery.
5. Keep `demoMode: false` and temporarily open the frontend flag only in the isolated QA copy. Verify HTTPS phone browsers, receipts, loading/errors, Email contact validation and duplicate clicks. Compare receipts to the Sheet and check cold-request latency against the eight-second deadline. Close test gates afterward.
6. After those checks and a separate public-launch authorization, prepare a new production deployment containing `demoMode: false`, `registrationEnabled: true` and server-side `REGISTRATION_ENABLED=true`, with the canonical production origin, existing `/exec` URL and unchanged existing key. This local test setup does not enable either production gate, commit, push or deploy.

Only for separately authorized loopback QA: replace the marked fictional values and retain `$submissionId` for the replay. Run the following block once; re-running its UUID assignment creates a different application attempt.

```powershell
$submissionId = [guid]::NewGuid().ToString()
$application = @{
  fullName = 'APPROVED TEST NAME'
  email = ''
  phone = 'APPROVED TEST PHONE'
  selectedClass = 'Workers-in-Training'
  preferredContact = 'Phone'
  website = ''
} | ConvertTo-Json -Compress
$headers = @{ Origin = 'http://127.0.0.1:8000'; 'Idempotency-Key' = $submissionId }
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/register' -Method Post -Headers $headers -ContentType 'application/json' -Body $application
```

For replay/concurrency, reuse these variables rather than generating another UUID. Success means saved for review, not church approval. Do not claim live integration works until the actual row and receipt are verified in Google Sheets.

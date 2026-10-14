# RCCG Vision House Area — Phase 1 content guide

The existing website has been expanded using HTML, CSS and vanilla JavaScript. Church branding remains **RCCG Vision House Area — Home of Pace Setters**. The existing pastor photograph, weekly programmes, gallery, worship video, contact information and Maps links remain part of the site. **Hour of Triumph remains the first Saturday of every month, 7:00 AM–8:30 AM.**

Phase 1 provides the public pages and interfaces. No sermon recordings, church announcements or bank details have been invented. Class applications cannot be submitted. There is no database, payment gateway or Google Apps Script connection in this phase.

## Pages and content sources

| Page | Purpose | Content source |
| --- | --- | --- |
| `sermons.html` | Featured sermon and searchable video library; empty until real sermon videos are added | `js/data/sermons.js`, rendered by `js/sermons.js` |
| `announcements.html` | Featured update, announcement cards and category filters; an empty state until approved updates exist | `js/data/announcements.js`, rendered by `js/announcements.js` |
| `registration.html` | One class registration form, currently closed | Static HTML and `js/registration.js` |
| `ministries.html` | Women's, Men's, Youth, Teenagers' and Children's Ministry introductions, with space for future approved content | Edit the ministry sections in `ministries.html` |
| `giving.html` | Official Tithe and Project Accounts, each with an independent copy button | `js/data/giving.js`, rendered by `js/giving.js`; static details in `giving.html` |

The homepage includes Latest Sermons, Church Announcements, Grow With Us and ministry previews. `js/homepage.js` uses the same sermon and announcement data files and shows up to two published entries from each. The static introductory states remain when approved content is unavailable. Adding approved records does not require redesigning these pages.

## Sermons: manually maintained video library

The current video library uses the empty `window.VisionHouseData.sermons` array in `js/data/sermons.js`. No real sermon videos or metadata have been supplied, so visitors see "Sermons will be available here soon." No fake cards, preacher names or dates are published.

Follow **[the sermon README](assets/videos/sermons/README.md)** to add real local videos or YouTube links, preacher photographs, thumbnails and details. The data file includes a commented blank template. Local videos go in `assets/videos/sermons/`; photographs in `assets/images/preachers/`; thumbnails in `assets/images/sermon-thumbnails/`. English WebVTT captions are optional.

Required record fields are `id`, `published: true`, `title`, `preacher`, real `date`, `thumbnail`, `description`, and exactly one of `videoSrc` or `youtubeUrl`. `preacherPhoto`, `featured`, `category`, `passage` and `captionsSrc` are optional. Each preacher photograph is set per entry; there is no default pastor photo. Keep unpublished entries at `published: false` while preparing them.

The newest published sermon is featured unless another entry is marked `featured: true`. Cards sort by date. Search includes titles, preacher names, descriptions, categories and passages; category options come from real entries. Watch Sermon opens a responsive player without autoplay. Closing it stops playback and restores focus. No video or YouTube player is loaded before a visitor chooses Watch Sermon.

The existing homepage preview code is unchanged and still expects its original audio metadata. This redesign maintains the video Sermons page. Public files remain reachable by their direct paths even if their record is unpublished; this project has no private media storage or admin backend.

## Announcements

`js/data/announcements.js` currently contains an empty array. Add only approved public updates. The record schema is:

| Field | Value |
| --- | --- |
| `id` | Unique nonempty string; required by the page and homepage preview |
| `published` | Boolean; keep `false` until approved for publication |
| `title` | Approved title |
| `summary` | Approved announcement text |
| `category` | Exactly `General`, `Events` or `Special Programmes` |
| `date` | Actual publication date in valid `YYYY-MM-DD` format |
| `eventDate` | Optional confirmed event date in the same format, or an empty string |
| `featured` | Boolean; `true` highlights an announcement |
| `imageSrc` | Optional approved local image path under `assets/images/`, or an empty string |
| `imageAlt` | Descriptive alt text whenever `imageSrc` is supplied |

Supply all core fields before setting `published: true`. No dates or categories are inferred. The page sorts announcements by publication date. If multiple records are featured, the newest matching featured record leads the selected category. Other records appear in the card list. Dates do not schedule publication; the `published` flag controls visibility.

Optional images may be JPG, JPEG, PNG, WebP or AVIF. Include the file in the project, confirm its approval, and check its exact path and alt text locally. Do not use placeholder photographs of people. Leave image fields blank when no approved image exists. Announcement text is rendered as text, not HTML.

## Ministries

The five ministry sections use neutral introductions and icons. Their activity and photograph spaces deliberately contain no invented leaders, schedules, programmes or photographs. Replace those spaces in `ministries.html` only with approved information and approved images, including useful alt text and appropriate intrinsic dimensions. Preserve the existing section classes so the responsive design and animations continue to work.

## Giving

`js/data/giving.js` contains an `accounts` array with the two official accounts supplied by the church:

```js
window.VisionHouseData.giving = {
  accounts: [
    {
      id: 'tithe', verified: true, title: 'Tithe Account', purpose: 'Tithes',
      bankName: 'Guaranty Trust Bank (GTBank)',
      accountName: 'RCCG VISION HOUSE PARISH', accountNumber: '0138942426'
    },
    {
      id: 'project', verified: true, title: 'Project Account', purpose: 'Church Building Project',
      featuredMessage: "Let's Help Build the House of God",
      bankName: 'First Bank',
      accountName: 'RCCG VISION HOUSE PARISH', accountNumber: '2035906872'
    }
  ]
};
```

Keep `accountNumber` as a quoted string to preserve the leading zero in the Tithe Account. Each `id` matches its `data-giving-account` card in `giving.html`. When approved details change, update both this data file and the matching static HTML details; the HTML allows visitors to read the accounts even with JavaScript disabled.

`js/giving.js` checks each account independently: `verified` must be exactly `true`, its ID must be unique, its title and names must be nonempty, and its number must be a string of ten digits. Incomplete or unverified entries show an unavailable message and cannot be copied. This is a content check, not automated bank verification.

Each card has its own copy button, busy state and accessible confirmation. Clipboard failures or unavailable browser support offer manual copying without claiming success. `css/giving.css` is scoped to this page. No payment forms, gateways, QR codes or donation targets are included. Review any future account changes against the approved source before deployment.

## Registration and the Phase 2 handoff

The form offers exactly **Workers-in-Training Class**, **Believers' Class** and **Baptismal Class**. It collects full name, optional email, phone, selected class and preferred contact method. Email becomes required when email is selected as the preferred contact method.

`js/registration.js` preserves accessible field validation and now has a same-origin `/api/register` adapter. The HTML submit button is disabled without JavaScript, and public registration remains closed through `registrationEnabled: false` in `js/registration-config.js` plus the API's private `REGISTRATION_ENABLED` gate. While closed, a manually re-enabled button does not send applicant information. The form's backend field names are `fullName`, `email`, `phone`, `selectedClass`, `preferredContact` and the hidden honeypot `website`.

The case-sensitive class values are exactly `Workers-in-Training`, `Believers' Class` and `Baptismal Class`; contact values are `Phone`, `WhatsApp` and `Email`. These match the owner's supplied contract. The visible labels and existing design are preserved. The API validates all six fields and requires the honeypot to be exactly empty.

The Apps Script URL is configured **only in the server-side `APPS_SCRIPT_EXEC_URL` environment variable**. The public config contains only the closed flag and `/api/register` path. The private `APPS_SCRIPT_SHARED_SECRET` must match the same Script Property in Apps Script. Do not put either value or private Sheet information in browser files. See [REGISTRATION-API-GUIDE.md](REGISTRATION-API-GUIDE.md) for configuration, manual migration and testing instructions.

When both gates are opened after verification, the adapter sends the following six string fields as JSON to the API, with a UUID submission ID in the `Idempotency-Key` header. The API forwards them as URL-encoded Apps Script parameters, adding the submission ID, private shared secret and an IP-derived keyed digest for modest throttling:

```text
fullName, email, phone, selectedClass, preferredContact, website
```

The proposed [complete Apps Script replacement](apps-script/Code.gs) uses a script lock and a `Submission ID` Sheet column to find an existing receipt or save one new `Pending` row. The API and browser both require explicit success, a valid application ID and the matching submission ID. The browser preserves loading/validation/error states, prevents concurrent clicks, reuses the ID for unchanged safe retries and freezes uncertain attempts. No automatic applicant POST retries, opaque `no-cors` workaround or browser storage is used. Success means received for review, not coordinator approval.

Redis has been removed. The proposed backend authenticates requests before accessing the Sheet and uses Apps Script CacheService for modest throttling; cache eviction can reset those counters. Sheet duplicate protection applies to the same submission ID, not independently generated IDs for the same applicant. Private service values are still missing and the replacement script has not been deployed. Keep both gates closed until manual migration, authentication, duplicate/concurrent requests and actual stored receipts have been verified in Google Sheets. Browser validation does not substitute for server validation.

Useful selectors are `#class-registration-form`, `#registration-class`, `#registration-name`, `#registration-email`, `#registration-phone`, `#registration-contact`, `#registration-website`, `#registration-submit` and `#registration-status`.

The integration guide documents the API's test coverage and the remaining live verification. Tests use isolated fixtures and do not establish that applications have been saved in the private Google Sheet.

## Shared navigation and footer

The navigation links the new pages and groups Ministries and Classes under Church Life. Existing homepage section links remain available. `js/navigation.js` handles the additional navigation behavior, alongside the existing `js/main.js` mobile menu and animations.

The site has no HTML template engine. Header and footer markup is repeated in all six pages: `index.html`, `sermons.html`, `announcements.html`, `registration.html`, `ministries.html` and `giving.html`. When changing shared links, branding or programme details later, update all six copies together. Use `index.html#section-id` for homepage destinations from an inner page, preserve the correct current-page indication, and check both header and footer links. Keep Hour of Triumph at **7:00 AM–8:30 AM**.

## New Phase 1 files

- Pages: `sermons.html`, `announcements.html`, `registration.html`, `ministries.html`, `giving.html`.
- Styles: `css/features.css`, `css/community.css`, `css/sermons.css`, `css/registration.css`.
- Scripts: `js/navigation.js`, `js/homepage.js`, `js/sermons.js`, `js/announcements.js`, `js/registration.js`, `js/giving.js`.
- Public content data: `js/data/sermons.js`, `js/data/announcements.js`, `js/data/giving.js`.
- Documentation: `assets/audio/README.md`, `PHASE1-CONTENT-GUIDE.md`.

Existing files modified for Phase 1: `index.html`, `README.md` and `CONTENT-GUIDE.md`. The homepage gains the new sections, shared navigation and footer links; the existing documentation links to this guide. The four original CSS files and `js/main.js` are unchanged by Phase 1. Earlier pastor-image and Hour of Triumph corrections remain in place.

## Local review and testing

From the project directory, run:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` and review all pages. Stop the server with Ctrl+C. This command serves the files locally; it does not push changes or deploy to Vercel.

Integrated local browser verification passed **362 checks** across all six pages at **320, 375, 430, 768, 1024, 1440 and 1920px** (42 page/width combinations). Checks covered navigation and footer destinations, mobile menu, dropdowns by keyboard and touch, responsive layout, horizontal overflow, reduced motion, existing reveal animations, pastor image, gallery lightbox navigation, worship video decoding and closing, Maps destinations, image paths and browser console errors. No broken local paths, JavaScript errors or horizontal overflow were found. Registration remained closed even after its button was manually re-enabled, made no submission request, and did not claim to save an application. Giving stayed unavailable without verified details. Static empty states contained no invented public content or broken media players.

Temporary fixtures in the isolated test browser verified sermon search/category filters and native audio loading, announcement filtering/dates/images, and successful and failed account-number copying. Fixtures were not written to the public data files. Real sermon recordings, approved announcements and verified bank details still need review when supplied. The eleven original homepage sections were compared against the pre-expansion snapshot; original media, base styles and `js/main.js` were also checked for unintended changes.

When real content is supplied, repeat focused checks for its audio playback and filters, announcement dates and optional images, verified account copying, and homepage previews. Keep registration closed until the Phase 2 service and confirmed receipt flow are tested.

## Information still needed from church leadership

- Real sermon videos or YouTube links, with their titles, preacher names and photographs, actual dates, thumbnails and descriptions.
- Approved announcement text, publication and event dates, categories, featured choices and any approved images with descriptive alt text.
- Approved ministry activities, events, coordinator details if desired, and photographs. None have been invented.
- Verified bank name, account name and account number.
- Phase 2 class registration instructions, privacy wording, coordinator approval requirements, and the authorized Google Sheets/Apps Script service configuration.

Keep deployment and GitHub publishing under the owner's control after local review.

# Vision House content guide

The site is static HTML, CSS and JavaScript. Open index.html or serve the project root. No build step or JavaScript dependencies are required.

## Approved church details

Update these details in index.html only after a confirmed change:

- RCCG Vision House Area — Home of Pace Setters.
- Pastor: Pst. Dele Oyediran. His photograph remains the supplied assets/images/pastor-dele.jpg.
- Address: Behind Rofit School, Nurses Estate, City College, Karu.
- Display number: 0803 701 1088.
- Call link: tel:+2348037011088.
- WhatsApp: https://wa.me/2348037011088.
- Tuesday: Digging Deep, 6:00 PM–7:00 PM.
- Thursday: Faith Clinic, 6:00 PM–7:00 PM.
- First Saturday of each month: Hour of Triumph, 7:00 AM–8:00 AM.
- Sunday: Family Worship, 9:00 AM–11:00 AM.

Keep the vision and mission wording approved in the current HTML. No history, staff biography, testimonials, statistics, unconfirmed programmes, email or social accounts have been added.

## Design files

- css/style.css: brand variables, typography and desktop layout.
- css/responsive.css: tablet and mobile layouts.
- css/animations.css: gentle reveals and reduced-motion support.
- css/lightbox.css: separate native image and portrait-video dialogs.
- js/main.js: navigation, gallery, reveals, lazy video playback and copyright year.

The former polish.css, real-images.css, fonts.css and logo.css overrides were consolidated into these styles.

## Approved brand palette

The official identity is **RCCG Vision House Area — Home of Pace Setters**. Use **Vision House Area** when a shorter display name is needed.

Maintain the green, white and navy palette in `css/style.css`:

| Token | Color | Use |
| --- | --- | --- |
| `--forest` | `#0B5D3B` | Primary buttons, brand name, active navigation and green accents. |
| `--green` | `#148A5A` | Focus indicators and small graphic accents. |
| `--deep-navy` | `#0B1F3A` | Section headings, footer, mobile hero and modal backgrounds. |
| `--navy` | `#12345B` | Navigation, secondary button text and the visit band. |
| `--white` | `#FFFFFF` | Main surfaces and light text. |
| `--cream` | `#F7FAF8` | Soft section backgrounds. |
| `--ink` | `#17201B` | Main body text. |

Forest provides strong contrast for small white button text. Rich green is reserved for graphic accents and focus rather than small white-text fills. Navy sections use white, light mint or `--on-dark-muted` (`#CBD8E5`) text; focus outlines are white on dark backgrounds. Keep the existing subtle photo overlay, typography, responsive layouts, hover effects and reduced-motion support.

## Photography

All visible photos come from the supplied church files. Preserve the originals. The website uses responsive WebP copies in assets/images/optimized.

To regenerate them, run: python scripts/optimize_images.py

The helper requires Pillow for asset preparation only; it is not a website dependency. It preserves orientation and aspect ratio and does not crop or change photo colours.

Images use srcset, sizes, explicit dimensions and lazy loading. The hero is loaded eagerly with high priority. Desktop and mobile have separate hero compositions so the full congregation remains visible on narrow screens.

To change a photo, update its src, every srcset entry, width/height and accurate alt text. For galleries also update the anchor href, data-caption and aria-label. The anchor opens the larger image even when JavaScript is disabled.

## Gallery

The eight anchors inside .gallery-grid open a native dialog. It supports next/previous controls, arrow keys, Escape, focus containment and focus return. Avoid near-duplicate pictures and do not identify an unconfirmed person as the pastor.

## Motion and grid refinements

Use `.reveal` with `.reveal-up`, `.reveal-left`, `.reveal-right` or `.reveal-scale` for a once-only entrance. Reserve `.reveal-image` for major images; a photo inside a figure uses `.image-reveal-frame` to clip the slight scale while keeping its caption visible.

Group related entrances with `data-reveal-group data-stagger="80"`. Gallery and pillar delays reset for each visual row. Add `data-stagger-mode="batch"` for editorial groups such as the programme rows and contact actions. Ordinary groups use 80ms steps capped at 240ms. The weekly schedule uses `data-stagger="120"`, with programme delays capped at 360ms and a 20px upward entrance. Each item reveals once.

Content remains visible without JavaScript or observer support. Initially visible content, keyboard focus and section-link destinations appear immediately. Reduced motion removes entrance transitions, hero zoom, image scaling, button movement and stagger delays. No animation library is required.

The hero uses the temporary `hero-intro` class for one initial entrance: its image settles from 1.05 scale to its original size over 1.35 seconds while the eyebrow, two heading lines, paragraph and individual buttons enter in sequence. The class ends after 1.5 seconds or immediately when reduced motion is enabled. Scrolling and changing the preference back do not restart it. Settled text remains visible if JavaScript fails.

Use `motion-heading` on an existing reveal wrapper to sequence its label, a thin accent line, main heading and supporting paragraph. Use `motion-statement` on Vision/Mission articles for the related label/heading/text sequence. The lines occupy existing label spacing and do not change layout. The existing `reveal-immediate` safeguard bypasses nested animations for initial content, focus, hash destinations and fallbacks.

The navbar retains its height and logo layout box while scrolling adds a subtle shadow, supported backdrop blur and a slight logo transform. This avoids movement in the page layout and preserves mobile-menu positioning. Desktop CTA hover uses a 2px lift and restrained icon movement; tapping produces a small press effect. Gallery zoom remains 1.035, and only the welcome/supporting photograph containers receive a 1.02 hover zoom with clipped overflow. The video preview and modal retain their approved behavior.

Desktop retains the editorial schedule and asymmetric photographic layouts. From 768px through 1199px, Life uses a full-width feature above two supporting photographs, the gallery uses four complete two-photo rows, and the experience pillars use two columns. On smaller screens the Life and gallery photographs become single-column layouts.

## Church video

The selected first recording, `img/WhatsApp Video 2026-10-04 at 2.27.19 AM.mp4`, is copied without re-encoding to `assets/videos/vision-house-worship.mp4`. Both original recordings remain in `img`; the second recording is not the primary website video.

The recording is 576×1024 (9:16), approximately 31 seconds and 5.29 MB. It already has fast-start metadata, so its original quality and audio are preserved. The optimized 30.8 KB poster, `assets/images/optimized/vision-house-worship-poster.webp`, is a real frame at 12 seconds. It is maintained separately from the responsive photograph optimizer.

Experience Vision House uses copy and the existing church photograph alongside a portrait preview. On mobile the copy, centered preview and supporting photograph stack in that order. The video opens in its own native dialog; the image gallery remains separate.

The player has no initial `src`, uses `preload="none"` and never plays on page load. An explicit Watch Video action assigns the source and starts playback where the browser permits it. Native controls provide play/pause, volume and seeking. Closing, Escape or a backdrop click pauses playback and returns focus to the preview. The direct MP4 anchor remains usable without JavaScript or dialog support.

For replacement footage, update the player's `data-source`, preview link, player fallback link, poster references, dimensions and duration label together. Preserve originals, use an optimized real poster and add approved captions/transcript when available. The supplied intro includes the burned-in `@YourChurchName` template handle; an owner-edited source is needed to correct that footage. The website poster uses a later worship frame.

Use a static host that serves MP4 as `video/mp4` with byte-range support for efficient seeking. No video or animation library is required.

## Location and directions

The map iframe and all five Get Directions links search the approved written destination: Behind Rofit School, Nurses Estate, City College, Karu. Their queries were updated with the final official contact/location details. No coordinates or exact area church pin are supplied or claimed. Obtain a verified area church listing/embed to replace the address search with an exact pin. The visible address, call link and directions buttons remain available if the third-party map cannot load.

## Metadata

Title, description, RCCG favicon and Open Graph image/alt are present. The Open Graph image currently uses a relative path because no deployment domain was supplied. After selecting the official domain, use a complete HTTPS image URL and add the approved canonical URL.

## External resources

Google Fonts and the Google Maps embed require an internet connection. Serif and sans-serif fallbacks are supplied. Photos, logo, icons, layout and interactions are local.

## Validation

See REDESIGN-NOTES.md for the original image mapping and implementation report, REFINEMENT-NOTES.md for the earlier animation/grid refinement, MEDIA-UPDATE-NOTES.md for the final contact, address and video update, BRAND-UPDATE-NOTES.md for the leadership-approved identity and color update, and ANIMATION-POLISH-NOTES.md for the final motion and interaction polish.

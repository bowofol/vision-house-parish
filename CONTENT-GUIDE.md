# Vision House content guide

The site is static HTML, CSS and JavaScript. Open index.html or serve the project root. No build step or JavaScript dependencies are required.

## Approved church details

Update these details in index.html only after a confirmed change:

- RCCG Vision House Parish — Home of Peace Setters.
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

Group related entrances with `data-reveal-group data-stagger="80"`. Gallery and pillar delays reset for each visual row. Add `data-stagger-mode="batch"` for editorial groups such as the programme rows and contact actions. Delays apply only to items entering together and are capped at 240ms.

Content remains visible without JavaScript or observer support. Initially visible content, keyboard focus and section-link destinations appear immediately. Reduced motion removes entrance transitions, hero drift, image scaling and stagger delays. No animation library is required.

Desktop retains the editorial schedule and asymmetric photographic layouts. From 768px through 1199px, Life uses a full-width feature above two supporting photographs, the gallery uses four complete two-photo rows, and the experience pillars use two columns. On smaller screens the Life and gallery photographs become single-column layouts.

## Church video

The selected first recording, `img/WhatsApp Video 2026-10-04 at 2.27.19 AM.mp4`, is copied without re-encoding to `assets/videos/vision-house-worship.mp4`. Both original recordings remain in `img`; the second recording is not the primary website video.

The recording is 576×1024 (9:16), approximately 31 seconds and 5.29 MB. It already has fast-start metadata, so its original quality and audio are preserved. The optimized 30.8 KB poster, `assets/images/optimized/vision-house-worship-poster.webp`, is a real frame at 12 seconds. It is maintained separately from the responsive photograph optimizer.

Experience Vision House uses copy and the existing church photograph alongside a portrait preview. On mobile the copy, centered preview and supporting photograph stack in that order. The video opens in its own native dialog; the image gallery remains separate.

The player has no initial `src`, uses `preload="none"` and never plays on page load. An explicit Watch Video action assigns the source and starts playback where the browser permits it. Native controls provide play/pause, volume and seeking. Closing, Escape or a backdrop click pauses playback and returns focus to the preview. The direct MP4 anchor remains usable without JavaScript or dialog support.

For replacement footage, update the player's `data-source`, preview link, player fallback link, poster references, dimensions and duration label together. Preserve originals, use an optimized real poster and add approved captions/transcript when available. The supplied intro includes the burned-in `@YourChurchName` template handle; an owner-edited source is needed to correct that footage. The website poster uses a later worship frame.

Use a static host that serves MP4 as `video/mp4` with byte-range support for efficient seeking. No video or animation library is required.

## Location and directions

The map iframe and all five Get Directions links search the approved written destination: Behind Rofit School, Nurses Estate, City College, Karu. Their queries were updated with the final official contact/location details. No coordinates or exact parish pin are supplied or claimed. Obtain a verified parish listing/embed to replace the address search with an exact pin. The visible address, call link and directions buttons remain available if the third-party map cannot load.

## Metadata

Title, description, RCCG favicon and Open Graph image/alt are present. The Open Graph image currently uses a relative path because no deployment domain was supplied. After selecting the official domain, use a complete HTTPS image URL and add the approved canonical URL.

## External resources

Google Fonts and the Google Maps embed require an internet connection. Serif and sans-serif fallbacks are supplied. Photos, logo, icons, layout and interactions are local.

## Validation

See REDESIGN-NOTES.md for the original image mapping and implementation report, REFINEMENT-NOTES.md for the animation/grid refinement, and MEDIA-UPDATE-NOTES.md for the final contact, address and video update.

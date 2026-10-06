# Vision House website remodel

This report records the original responsive redesign around the supplied area church photography and established RCCG green-and-white identity. Approved area church details, mission, vision, pastor identification and service times were retained. The later final contact/location update replaces the phone, WhatsApp and written-address map/directions queries; current approved details are in CONTENT-GUIDE.md.

## Files changed

- index.html: homepage structure, responsive photographs, metadata, semantic sections, address-based map and native gallery dialog.
- css/style.css: consolidated brand, typography, components and desktop layouts.
- css/responsive.css: layouts for mobile, tablet and desktop.
- css/animations.css: gentle reveals with reduced-motion support.
- css/lightbox.css: accessible image preview layout.
- js/main.js: menu, section navigation, gallery keyboard/focus behavior, video preparation and copyright year.
- scripts/optimize_images.py and assets/images/optimized/: reproducible responsive WebP preparation, 44 derived images and size manifest.
- README.md, CONTENT-GUIDE.md, assets/images/README.md and assets/logo/README.md: current maintenance guidance.
- .gitignore: excludes local review artifacts.

Obsolete css/polish.css, css/real-images.css, css/fonts.css and css/logo.css were consolidated and removed. Local copies of previous files were kept in .review/before. Deployment workflow and package configuration were unchanged.

## Sections redesigned

Navigation; congregation-photo hero; Sunday invitation; welcome; weekly schedule; Experience Vision House; vision and mission; pastor; Life at Vision House photo stories; Moments at Vision House gallery; location; contact; final invitation; footer.

The repeated events schedule and second worship banner were removed to make the page easier to scan. Layouts alternate between large photography, editorial splits, schedule rows, open text and a photographic grid.

## Exact photographs used

Each displayed photo is a resized WebP derivative of the following original. No stock, generated or substituted identity photographs were used.

| Placement | Original file |
| --- | --- |
| Hero and social preview | img/IMG_1244.JPG.jpeg |
| Welcome | img/IMG_1259.JPG.jpeg |
| Experience Vision House | img/IMG_1249.JPG.jpeg |
| Meet our pastor | assets/images/pastor-dele.jpg |
| Life: worship | img/IMG_1292.JPG.jpeg |
| Life: prayer | assets/images/church-prayer.jpg |
| Life: community | img/IMG_1311.JPG.jpeg |
| Gallery: Together in faith | assets/images/hero-church.jpg |
| Gallery: Sharing the Word | img/IMG_1250.JPG.jpeg |
| Gallery: Hearts in worship | img/IMG_1286.JPG.jpeg |
| Gallery: Our church family | img/IMG_1299.JPG.jpeg |
| Gallery: A moment at the lectern | img/IMG_1285.JPG.jpeg |
| Gallery: Worship together | img/IMG_1309.JPG.jpeg |
| Gallery: United in prayer | assets/images/church-community.jpg |
| Gallery: Faith in community | img/IMG_1335.JPG.jpeg |

The official logo remains assets/images/rccg-logo.png. Photos were chosen after reviewing the available JPEG media. HEIC files could not be decoded with the installed tools, so the supplied JPEG alternatives were selected; no conversion dependency was added.

## Videos

At the original redesign, no video files were present. A hidden player was prepared in Experience Vision House. It enables when an approved local file is set in data-source, uses a real-photo poster, native controls, playsinline and preload="none", and never autoplays. CONTENT-GUIDE.md explains footage and caption setup. No fake or stock footage was added.

## Performance

- All 15 selected originals were preserved.
- Responsive assets range from 480px to 1920px, with appropriate srcset and sizes.
- Selected original photographs total about 17.9 MB. A representative desktop set totals about 1.59 MB, approximately 91% smaller. Actual downloads depend on viewport, pixel density, scrolling and which gallery images are opened.
- Hero: 1920px asset is about 191 KB versus a 1.16 MB original; its 640px mobile asset is about 44 KB.
- Hero loads eagerly at high priority; below-the-fold photography and map load lazily.
- Explicit image dimensions and stable layout heights reduce layout shift.
- Larger lightbox images load only when opened.
- No framework or new runtime dependencies were added.

## Functionality preserved and improved

Mobile navigation, smooth anchor navigation, sticky header, real photo previews, WhatsApp, click-to-call, written-address directions, accessible content and gentle reveals remain. The gallery uses a native modal dialog for focus containment, Escape and focus restoration, plus arrow-key and previous/next controls. Mobile navigation handles Escape, outside clicks, desktop resize and keyboard focus leaving the menu. Images and gallery links remain usable without JavaScript.

The old decorative map/photo panel was replaced with a Google Maps embed that searches the exact approved address, without guessed coordinates.

## Items still requiring actual content

- An approved local video, with captions/transcript where appropriate, to enable the prepared player.
- A verified area church Google Maps listing/embed if an exact church pin is wanted. The map and all five directions actions now search Behind Rofit School, Nurses Estate, City College, Karu without fabricated coordinates.
- The official deployment domain to make the social-image URL absolute and add a confirmed canonical URL.

Google Fonts and Google Maps require internet access. Local typography fallbacks and visible address/directions remain available.

## Original redesign validation

Completed in local headless Chrome, using an isolated review profile.

- 320, 375, 430, 768, 1024, 1440 and 1920px: no horizontal overflow, no overflowing headings and every main-section photo loaded.
- Mobile menu: open, Escape, link navigation, destination focus and closing when Tab leaves the menu passed.
- Gallery: keyboard opening, next control, arrow navigation, focus containment, Escape and focus return passed.
- Phone, WhatsApp and all five directions links passed in the original redesign run. Their destinations were subsequently updated with the official contact/location details.
- Reduced motion: all content visible and smooth scrolling disabled.
- JavaScript disabled: mobile navigation visible, header stays in page flow, text/photo content visible and gallery links usable.
- Video fallback: prepared section hidden and no video source downloaded.
- No local HTTP errors, browser exceptions or broken local assets were found.
- No duplicate IDs, broken fragment links or text encoding issues; JavaScript syntax and Git whitespace checks pass.

The first rendering check exposed 320px label spacing and a gallery Tab-wrap issue. Both were fixed and the final browser run passed.

Desktop and phone viewport/full-page screenshots, the exact results and the dependency-free verification script are kept locally in .review, which is excluded from version control. The Google Maps embed uses the approved written address; this validation does not establish an exact area church pin. No actual video was available to test playback.

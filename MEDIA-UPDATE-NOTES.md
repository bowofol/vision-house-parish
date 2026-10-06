# Final media, location and contact update

This update preserves the completed area church design, section order, hero, typography, photographs, service information, pastor details, gallery and animation system. The Experience section now presents the selected church recording alongside its existing supporting photograph.

## Files changed

| File | Update |
| --- | --- |
| `index.html` | Official contact/address replacements, written map queries, portrait preview and separate native video dialog. |
| `css/style.css` | Experience split composition, play control and wrapping map caption. |
| `css/responsive.css` | Tablet sizing and mobile copy/video/photograph stack. |
| `css/animations.css` | Restrained play-control feedback with reduced-motion support. |
| `css/lightbox.css` | Portrait-player dialog, visible close control and keyboard focus guards. |
| `js/main.js` | Explicit-action video loading, native playback, focus management, pause-on-close and shared modal scroll locking. |
| `assets/videos/vision-house-worship.mp4` | Lossless production copy of the selected first recording. |
| `assets/images/optimized/vision-house-worship-poster.webp` | Optimized real frame at 12 seconds. |
| `assets/videos/README.md` | Source identity, dimensions, size, hash and maintenance notes. |
| `CONTENT-GUIDE.md`, `README.md` | Current official details, media implementation and replacement guidance. |
| `REDESIGN-NOTES.md`, `REFINEMENT-NOTES.md` | Clarified historical scope and references to current contact/location details. |
| `MEDIA-UPDATE-NOTES.md` | This report. |

## Official contact replacements

- Visible phone: **0803 701 1088** in the contact section and footer.
- All three call links: `tel:+2348037011088`.
- Both WhatsApp links: `https://wa.me/2348037011088`.
- No previous official phone-number variants remain in maintained files. Historical snapshots and Git history remain intact.

## Location and map

The location section and footer display:

Behind Rofit School,  
Nurses Estate,  
City College, Karu

Metadata, map captions and accessibility labels use the same written destination. All five Get Directions actions search **Behind Rofit School, Nurses Estate, City College, Karu**. The responsive Google Maps iframe uses that address as its query.

No latitude/longitude or exact verified church pin is supplied or claimed. An owner-provided verified Google Maps listing/pin is still needed to replace the address search with an exact area church marker.

## Video implementation

The primary recording is `img/WhatsApp Video 2026-10-04 at 2.27.19 AM.mp4`, copied to `assets/videos/vision-house-worship.mp4`. The second recording is not used as the primary video, and both source files remain unchanged.

- Native portrait dimensions: **576×1024**, **9:16**, with no rotation.
- Duration: **30.7 seconds**; visible duration rounded to **0:31**.
- Encoding: H.264 video with stereo audio.
- Production size: **5,286,756 bytes** (5.29 MB).
- SHA-256: `c05b27de7cbfae398ddb3bbb2f5c6fbabdfe4b4488b7d660d7b898a4cc0d37fb`.

The desktop/tablet layout pairs copy and the retained church photograph with a portrait preview. Mobile stacks copy, a centered preview and the photograph. Preview width is limited to 330px on desktop, 280px on tablet and 260px on mobile.

Watch Video opens a separate native dialog with native controls and an uncropped portrait player. Close, Escape and backdrop actions pause playback and restore focus. Keyboard containment retains access to the browser's own video controls. The image lightbox remains independent. Without JavaScript or dialog support, the preview link opens the MP4 directly.

## Performance decisions

The MP4 already places its metadata before its media payload for fast start. At 5.29 MB for approximately 31 seconds, it was copied without re-encoding to preserve quality; the first source and production copy have identical bytes.

The page starts with no player `src` and `preload="none"`. It loads no MP4 until the visitor selects Watch Video. Playback starts only after that action; there is no page-load autoplay. A static host should serve `video/mp4` with byte-range support for progressive playback and seeking.

The poster is a real, visually reviewed 12-second worship frame, **30,754 bytes** (30.8 KB), lazy-loaded with explicit dimensions. Existing optimized church photographs are preserved. No libraries, generated church imagery or stock media were added.

## Source footage note

The supplied recording's intro includes a burned-in **@YourChurchName** template handle. The original footage is preserved; the website poster uses a later clear worship frame. An owner-edited recording is needed to change that intro text.

## Final responsive and functional checks

The final headless Chrome run exited successfully. **320, 375, 430, 768, 1024, 1440 and 1920px** all passed:

- No horizontal overflow, overlapping/overflowing headings, missing images or empty gallery cells.
- Correct official visible phone, three call links, two WhatsApp links, both address blocks, five directions queries and written-query map.
- Intentional desktop/tablet split, mobile copy/video/photo order, bounded portrait preview and loaded poster.
- Zero MP4 requests before the explicit Watch Video action.
- Correct first-video source, H.264 decoding, actual advancing playback, native dimensions/duration and HTTP byte-range responses.
- Portrait player fits the viewport without cropping the recording.
- Forward and reverse Tab traversal stay inside the modal, retain native shadow-control access and do not leave a hidden focus guard selected.
- Close button, Escape and backdrop pause playback, clear scroll locking and return focus. Reopening reuses the assigned source.
- When a browser rejects programmatic playback, the dialog and native controls remain usable and closing still works.
- Image gallery keyboard/focus behavior and mobile menu passed after the video interactions.
- Existing reveal, hero, stagger and hover checks passed. Reduced motion passed on load and live changes, including video opening/closing and decoded playback.
- No-JavaScript navigation and the direct-video/image-link fallbacks passed independently of reduced motion.
- Zero runtime exceptions, console errors, local request failures or external request failures in this run.

Visual review covered the Experience section at 375, 768, 1024 and 1440px and live portrait-modal captures at 375 and 1440px. The hero, all ten other sections, original photo selections, service/pastor content and section order were checked against the pre-media snapshot.

The keyboard test caught and resolved a native-player boundary escape; lightweight focus guards now keep traversal inside the dialog without skipping native controls. No remaining implementation failures were found in the tested browser. The outstanding owner-supplied items are an exact verified Maps pin and an edited source if the intro's template handle should change.

Local results and screenshots are retained in `.review/validation-results.json` and the ignored `.review` directory. Source metadata and poster-extraction evidence are retained there as well.

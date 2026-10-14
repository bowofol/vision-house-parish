# RCCG Vision House Area

A responsive, photography-led area church website using the supplied congregation and pastor photographs, the official RCCG logo, and the green, white and navy identity.

Current church contact: **0803 701 1088** ([Call](tel:+2348037011088), [WhatsApp](https://wa.me/2348037011088)). Location: **Behind Rofit School, Nurses Estate, City College, Karu**. Google Maps uses this written destination; an exact verified area church pin is still needed.

Open index.html in a browser, or serve the project root with a static server:

    python -m http.server 8765

Then open http://localhost:8765.

The static pages need no build step, framework or package installation. The registration API bridge uses Node.js 22; run `npm run dev` to serve both the website and `/api/register` locally. Registration uses the proposed Apps Script/Google Sheets backend with no Redis or database package. Public registration remains disabled. See [REGISTRATION-API-GUIDE.md](REGISTRATION-API-GUIDE.md) for the complete proposed Apps Script file, private environment settings, manual Sheet migration and required live verification. See CONTENT-GUIDE.md for approved content, image replacement, motion and video setup. See REDESIGN-NOTES.md for the original redesign report, REFINEMENT-NOTES.md for the earlier animation/grid refinements, MEDIA-UPDATE-NOTES.md for the final contact, address and portrait-video update, BRAND-UPDATE-NOTES.md for the approved Area identity, Pace Setters tagline and green/white/navy palette, and ANIMATION-POLISH-NOTES.md for the final animation and interaction polish.

Regenerate responsive images when needed:

    python scripts/optimize_images.py

This optional preparation script requires Pillow. Original photographs are preserved.

Phase 1 adds `sermons.html`, `announcements.html`, `registration.html`, `ministries.html` and `giving.html`. See [PHASE1-CONTENT-GUIDE.md](PHASE1-CONTENT-GUIDE.md) for approved content publishing, the closed registration form, official giving details and the Google Sheets/Apps Script handoff. No recordings or announcements are published yet. The Giving page includes the two official church accounts.

Manual sermon video management: edit `js/data/sermons.js` and follow [the sermon media README](assets/videos/sermons/README.md) for local videos, YouTube links, preacher photographs and thumbnails.

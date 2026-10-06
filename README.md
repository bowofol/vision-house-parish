# RCCG Vision House Parish

A responsive, photography-led parish website using the supplied congregation and pastor photographs, the official RCCG logo, and the established green-and-white identity.

Current church contact: **0803 701 1088** ([Call](tel:+2348037011088), [WhatsApp](https://wa.me/2348037011088)). Location: **Behind Rofit School, Nurses Estate, City College, Karu**. Google Maps uses this written destination; an exact verified parish pin is still needed.

Open index.html in a browser, or serve the project root with a static server:

    python -m http.server 8765

Then open http://localhost:8765.

No build step, framework or package installation is needed. See CONTENT-GUIDE.md for approved content, image replacement, motion and video setup. See REDESIGN-NOTES.md for the original redesign report, REFINEMENT-NOTES.md for the animation/grid refinements and MEDIA-UPDATE-NOTES.md for the final contact, address and portrait-video update.

Regenerate responsive images when needed:

    python scripts/optimize_images.py

This optional preparation script requires Pillow. Original photographs are preserved.

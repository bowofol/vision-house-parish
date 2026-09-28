# RCCG Vision House Parish Content Guide

This is a static HTML, CSS, and Vanilla JavaScript website. No build step or framework is required.

## Run the site

Open `index.html` directly in a browser, or serve the project folder with a static server. Keep the folder structure unchanged so relative asset paths continue to work.

## Brand and logo

- The official RCCG logo is loaded from `assets/images/rccg-logo.png`.
- Replace that file with the approved logo while keeping the same filename, or update both `src="assets/images/rccg-logo.png"` references in `index.html`.
- Green brand variables are defined in `css/polish.css`.

## Images

Place approved church images in `assets/images/` using these names:

- `hero-church.jpg` for the hero and wide worship gallery tile
- `church-prayer.jpg` for the welcome section and prayer gallery tile
- `church-community.jpg` for the featured worship section and community gallery tiles
- `pastor-dele.jpg` for the pastor section
- `digging-deep.jpg`, `faith-clinic.jpg`, `hour-of-triumph.jpg`, and `family-worship.jpg` for future program imagery
- `gallery-01.jpg` through `gallery-06.jpg` for gallery images

The supplied photographs are now active. Replace a file by keeping the same filename and path; no HTML or CSS change is needed.

## Church information

Confirmed church information is written in `index.html`: church name, pastor name, location, phone number, WhatsApp URL, vision, and mission. Update the visible text there if leadership approves a change. Do not add an email, social profile, biography, history, testimonials, statistics, or other unverified details.

## Programs and events

The four weekly programs appear in the Services section, Events section, and footer. Update the name, day, time, and description in each matching HTML block:

- Tuesday: Digging Deep, 6:00 PM – 7:00 PM
- Thursday: Faith Clinic, 6:00 PM – 7:00 PM
- First Saturday monthly: Hour of Triumph, 7:00 AM – 8:00 AM
- Sunday: Family Worship, 9:00 AM – 11:00 AM

## Gallery

Gallery items are the `.gallery-item` buttons in `index.html`. To add an image, add another button with a descriptive `data-caption` and a `.photo-surface` span whose CSS background points to the approved image. Keep the button structure so keyboard access and the lightbox continue to work.

## Contact and location

The phone link is `tel:+2348025017870`. The WhatsApp link is `https://wa.me/2348025017870`. Update all matching links together if the number changes.

The location is intentionally text-only with a clearly marked map placeholder. When a verified Google Maps URL or embed is supplied, replace the placeholder in the Location section. Do not add coordinates based on an estimate.

## Deployment

For Netlify, drag the project folder into Netlify Drop or connect the repository and use the project root as the publish directory. For Vercel, import the repository, choose the project root, and deploy as a static site with no build command. Confirm that `index.html` is in the published root.

## Pre-launch checklist

- Add only approved church and pastor photographs.
- Add the official logo from the approved source.
- Verify the address and map link with church leadership.
- Test the phone and WhatsApp links on a mobile device.
- Test the menu, gallery lightbox, Escape key, and arrow keys.
- Check 320px, 375px, 425px, 768px, 1024px, and desktop widths.
- Check for horizontal scrolling and browser console errors.
- Confirm all copy, service times, and copyright year before publishing.

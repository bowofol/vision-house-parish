# Add sermon videos in VS Code

The Sermons page is a static video library. You add files and edit one JavaScript array; no dashboard, database or login is needed. When no complete entries are published, the page says "Sermons will be available here soon."

## 1. Add your files

- Sermon videos: `assets/videos/sermons/` (MP4 recommended; WebM also supported).
- Preacher photographs: `assets/images/preachers/` (JPG, PNG, WebP or AVIF).
- Video thumbnails: `assets/images/sermon-thumbnails/` (a landscape image, ideally 16:9).
- Optional English captions: a WebVTT `.vtt` file in `assets/videos/sermons/`.

Use short filenames with letters, numbers, hyphens or underscores. Keep the extension and spelling correct. File paths in the array start with `assets/`, use `/`, and never use Windows paths such as `C:\...`. Supply a photograph of the actual preacher for each sermon; different sermons can use different photographs. Photos appear beside the preacher's name in a circular frame. If a photograph is omitted or unavailable, the preacher's initials are shown instead.

## 2. Edit the sermon array

Open **`js/data/sermons.js`**. Copy this blank template between the `[` and `]` of `window.VisionHouseData.sermons`. Replace the empty values with your real information; the blank template itself is not published content.

```js
{
  id: '',                  // A unique short ID, such as your filename without its extension.
  published: false,        // Change to true only after all real details are filled in.
  featured: false,         // Set true to highlight this sermon.
  title: '',               // The actual sermon title.
  preacher: '',             // The actual preacher's name.
  preacherPhoto: '',        // assets/images/preachers/your-photo.jpg
  date: '',                // YYYY-MM-DD, or blank with an approved publication label.
  dateType: 'sermon',       // Use 'publication' for the video's upload date.
  dateApproximate: false,   // Use true only for an estimated publication date.
  approximatePublicationLabel: '', // Optional approved label when date is blank.
  thumbnail: '',           // assets/images/sermon-thumbnails/your-thumbnail.jpg
  description: '',         // A short description of this sermon.
  videoSrc: '',            // assets/videos/sermons/your-sermon.mp4
  youtubeUrl: '',          // Leave blank for a local video.
  category: '',            // Optional topic/category, or leave blank.
  passage: '',             // Optional Bible passage, or leave blank.
  captionsSrc: ''          // Optional assets/videos/sermons/your-captions.vtt
}
```

Required: a unique `id`, `title`, `preacher`, `thumbnail`, `description`, **one** video source, and either a valid `date` or an approved approximate publication label. Surround text, dates and file paths with quotes. By default, the date is the verified day the message was preached. If only the upload date is known, set `dateType: 'publication'`; cards and the player will explicitly label it "Published". For a church-approved provisional upload estimate, also set `dateApproximate: true` to display "Published around". Never present an estimated upload date as a verified preaching date. Entries without these optional fields keep their existing date display.

If no exact date is known, leave `date: ''`, set `dateType: 'publication'`, and enter an approved `approximatePublicationLabel`, such as "Uploaded approximately 3 weeks ago (as of 14 October 2026)". Include the reference date so a relative upload age does not become misleading later. This label appears unchanged in cards and the player, without creating an exact date or a `datetime` attribute. A nonblank invalid date is rejected even if a label is supplied; a valid date takes precedence over the label. Keep `published: false` until the entry is reviewed and approved.

The first entry, "Go Deeper With God", uses **2026-10-11 as a provisional publication date**, inferred from a relative YouTube upload age supplied by the church. Neither the exact upload date nor the preaching date has been verified. Confirm the date before publishing if an exact date is required, then update the date metadata as appropriate.

To add another sermon, place a comma after the previous object and paste another object inside the same array. Save the file. Dated entries are sorted newest first; entries with labels only appear afterward, alphabetically by title. The renderer does not infer chronological order from relative upload labels. The first published entry in this order is featured unless you set `featured: true` on another entry. If multiple entries are marked featured, the first of those in this order is selected.

## 3. For a YouTube sermon

Leave `videoSrc: ''` and paste the **real** HTTPS video link into `youtubeUrl`. Standard YouTube watch links, short `youtu.be` links and Shorts links are supported. Do not enter both sources for the same sermon. Use your own local thumbnail and the actual preacher's local photograph even for a YouTube sermon. The embedded YouTube player is loaded only after the visitor clicks Watch Sermon, and it does not autoplay.

## 4. Preview before publishing

Run `npm.cmd run dev` from the project folder on Windows, then open `http://127.0.0.1:8000/sermons.html`. If you already run a preview server, use its address. Check the date, preacher photo, thumbnail, description, search/category filters and video playback on desktop and mobile. Watch Sermon opens a player with controls; playback starts only when the visitor presses Play. MP4 files should use web-compatible video/audio encoding; if playback fails, export a browser-compatible MP4 from your video editor.

For local videos, metadata is loaded only after Watch Sermon is clicked. Closing the player stops playback. No video or YouTube player is created when the library is empty.

Change `published` to `false` to hide an entry. This is a display switch, not private storage: files in the project remain accessible by their direct paths. Remove a media file separately if it must no longer be available. The existing homepage audio preview is unchanged; these instructions maintain the video Sermons page.

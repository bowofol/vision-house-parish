/* MANUAL SERMON LIBRARY ? edit this file in VS Code.
 * Full instructions: assets/videos/sermons/README.md
 * Add only real sermons. The empty array deliberately publishes no examples.
 * Keep published: false while preparing an entry; set it to true when ready.
 * Copy the blank template below INTO the array and fill in your real details.
 * Choose ONE video source: a local videoSrc OR a real youtubeUrl.
 * Dates use YYYY-MM-DD. File paths are relative to the website root.
 * featured: true highlights this sermon; otherwise the newest is featured.
 * preacherPhoto is optional: without it, the real preacher's initials appear.
 * category, passage and captionsSrc are optional; use '' when not needed.
 *
 * {
 *   id: '',
 *   published: false,
 *   featured: false,
 *   title: '',
 *   preacher: '',
 *   preacherPhoto: '', // assets/images/preachers/your-photo.jpg
 *   date: '',
 *   thumbnail: '',     // assets/images/sermon-thumbnails/your-thumbnail.jpg
 *   description: '',
 *   videoSrc: '',      // assets/videos/sermons/your-sermon.mp4
 *   youtubeUrl: '',    // Paste a real HTTPS YouTube video link, or leave blank.
 *   category: '',
 *   passage: '',
 *   captionsSrc: ''    // Optional assets/videos/sermons/your-captions.vtt
 * }
 */
window.VisionHouseData = window.VisionHouseData || {};
window.VisionHouseData.sermons = [];

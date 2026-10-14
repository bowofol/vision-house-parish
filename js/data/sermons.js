/* MANUAL SERMON LIBRARY ? edit this file in VS Code.
 * Full instructions: assets/videos/sermons/README.md
 * Add only real sermons with approved details; never publish example records.
 * Keep published: false while preparing an entry; set it to true when ready.
 * Copy the blank template below INTO the array and fill in your real details.
 * Choose ONE video source: a local videoSrc OR a real youtubeUrl.
 * Dates use YYYY-MM-DD. File paths are relative to the website root.
 * dateType: 'publication' labels an upload date instead of a preaching date.
 * dateApproximate: true marks an estimated publication date as "Published around".
 * With no exact date, use dateType: 'publication' and approximatePublicationLabel.
 * Include an "as of" date in relative labels; the renderer never invents a day.
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
 *   dateType: 'sermon', // Use 'publication' for an upload date.
 *   dateApproximate: false, // Only for an estimated publication date.
 *   approximatePublicationLabel: '', // Optional approved label when date is blank.
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
window.VisionHouseData.sermons = [
  {
    id: 'go-deeper-with-god-1WE6HGdzV5k',
    published: true,
    featured: true,
    title: 'Go Deeper With God: Why Ankle-Deep Christianity Is Not Enough',
    preacher: 'Min. Emmanuel Aboh',
    preacherPhoto: '',
    // Provisional upload estimate supplied by the church, not a verified preaching date.
    date: '2026-10-11',
    dateType: 'publication',
    dateApproximate: true,
    thumbnail: 'assets/images/sermon-thumbnails/go-deeper-with-god-1WE6HGdzV5k.jpg',
    description: 'Discover why a deeper relationship with God requires moving beyond surface-level Christianity. In this message, Min. Emmanuel Aboh encourages believers to grow in faith and pursue a deeper walk with God.',
    videoSrc: '',
    youtubeUrl: 'https://www.youtube.com/watch?v=1WE6HGdzV5k',
    category: '',
    passage: '',
    captionsSrc: ''
  },
  {
    id: 'sow-in-scarcity-Au20miDSXQI',
    // Reviewed for publication; no exact upload or preaching day is known.
    published: true,
    featured: false,
    title: 'Sow in Scarcity, Reap 100 Fold',
    preacher: 'Dr. Sam Owokoniran',
    preacherPhoto: '',
    // Uploaded approximately 3 weeks before 2026-10-14; preaching date unverified.
    date: '',
    dateType: 'publication',
    dateApproximate: true,
    approximatePublicationLabel: 'Uploaded approximately 3 weeks ago (as of 14 October 2026)',
    thumbnail: 'assets/images/sermon-thumbnails/sow-in-scarcity-Au20miDSXQI.jpg',
    description: 'Discover biblical principles of faith, generosity, and trusting God even during seasons of scarcity.',
    videoSrc: '',
    youtubeUrl: 'https://www.youtube.com/watch?v=Au20miDSXQI',
    category: '',
    passage: '',
    captionsSrc: ''
  },
  {
    id: 'you-cannot-rise-alone-tj_7BrkOG-0',
    // Reviewed for publication; no exact upload or preaching day is known.
    published: true,
    featured: false,
    title: 'You Cannot Rise Alone',
    preacher: 'Pst. Dele Oyediran',
    preacherPhoto: '',
    // Uploaded approximately 4 months before 2026-10-14; preaching date unverified.
    date: '',
    dateType: 'publication',
    dateApproximate: true,
    approximatePublicationLabel: 'Uploaded approximately 4 months ago (as of 14 October 2026)',
    thumbnail: 'assets/images/sermon-thumbnails/you-cannot-rise-alone-tj_7BrkOG-0.jpg',
    description: "Explore the importance of relationships, support, and working together as we grow in faith and fulfill God's purpose.",
    videoSrc: '',
    youtubeUrl: 'https://www.youtube.com/watch?v=tj_7BrkOG-0',
    category: '',
    passage: '',
    captionsSrc: ''
  }
];

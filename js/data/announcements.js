/* Add only church-approved announcements. The public page shows published: true entries.
 * Example structure (documentation only; no announcements are currently published):
 * {
 *   id: 'unique-id', published: false, title: '', summary: '',
 *   category: 'General', date: 'YYYY-MM-DD', eventDate: '',
 *   imageSrc: '', imageAlt: '', featured: false
 * }
 * Categories: General, Events, Special Programmes.
 * imageSrc: optional approved photograph under assets/images/; supply descriptive imageAlt.
 * date: publication date. eventDate: optional event date. Neither is inferred.
 */
window.VisionHouseData = window.VisionHouseData || {};
window.VisionHouseData.announcements = [];

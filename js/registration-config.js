/* Public frontend flags only. Server credentials and the Apps Script URL
 * belong in server environment variables, never in this static file.
 * Leave registrationEnabled false until a live end-to-end registration and
 * its stored-application receipt have been verified against the private Sheet.
 * The server independently gates registration; this flag cannot open it.
 */
(() => {
  'use strict';

  window.VisionHouseConfig = window.VisionHouseConfig || {};
  window.VisionHouseConfig.registration = Object.freeze({
    registrationEnabled: false,
    apiPath: '/api/register'
  });
})();

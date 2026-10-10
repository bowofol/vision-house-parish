'use strict';

// Local-only server: the same handler is deployed natively by Vercel at /api/register.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const register = require('../api/register');

const root = path.resolve(__dirname, '..');
const pages = new Set(['index.html', 'sermons.html', 'announcements.html', 'registration.html', 'ministries.html', 'giving.html']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg'
};

function createDevServer({ handler, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  // This switch belongs only to this local runner; the deployed API ignores it.
  // Persistent/public gates stay false. Injected QA handlers retain their gates.
  const localTest = !handler && env.REGISTRATION_LOCAL_TEST_ENABLED === 'true';
  if (localTest && (env.REGISTRATION_ENABLED !== 'false' ||
      env.NODE_ENV === 'production' || env.VERCEL)) {
    throw new Error('Local registration testing requires closed persistent registration and a non-Vercel development environment.');
  }
  const defaultHandler = handler || register.createHandler({ env, fetchImpl });
  const localHandlers = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      let localOrigin;
      if (localTest) {
        const address = server.address();
        const host = req.headers.host;
        // Reject LAN binding, remote clients and DNS-rebinding hostnames.
        if (!address || address.address !== '127.0.0.1' ||
            !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
            host !== '127.0.0.1:' + address.port) {
          res.writeHead(403, { 'Cache-Control': 'no-store' }).end();
          return;
        }
        localOrigin = 'http://' + host;
      }
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/api/register') {
        if (localTest && !localHandlers.has(localOrigin)) {
          localHandlers.set(localOrigin, register.createHandler({
            env: { ...env, REGISTRATION_ENABLED: 'true', REGISTRATION_ALLOWED_ORIGIN: localOrigin },
            fetchImpl
          }));
        }
        await (localTest ? localHandlers.get(localOrigin) : defaultHandler)(req, res);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const relative = decodeURIComponent(pathname).replace(/^\//, '') || 'index.html';
      const extension = path.extname(relative).toLowerCase();
      const allowed = pages.has(relative) || (
        /^(?:css|js|assets\/(?:images|videos|audio))\//.test(relative) &&
        Object.hasOwn(mimeTypes, extension)
      );
      const filename = path.resolve(root, relative);
      if (!allowed || relative.includes('\\') || filename !== root && !filename.startsWith(root + path.sep)) {
        res.writeHead(404).end();
        return;
      }
      let data = await fs.readFile(filename);
      if (localTest && relative === 'js/registration-config.js') {
        // Explicit local status, independent of static file formatting. Never
        // edit the deployed config or send server environment values to Chrome.
        data = Buffer.from("(() => { 'use strict'; window.VisionHouseConfig = window.VisionHouseConfig || {}; " +
          "window.VisionHouseConfig.registration = Object.freeze({ registrationEnabled: true, apiPath: '/api/register' }); })();\n");
      }
      const headers = { 'Content-Type': mimeTypes[extension], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (relative === 'js/registration-config.js') {
        headers['X-VisionHouse-Local-Registration'] = localTest ? 'enabled' : 'disabled';
      }
      const match = typeof req.headers.range === 'string' && req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
      if (match && (match[1] || match[2])) {
        const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length) {
          res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + data.length }).end();
          return;
        }
        res.writeHead(206, { ...headers, 'Content-Range': 'bytes ' + start + '-' + end + '/' + data.length, 'Content-Length': end - start + 1 });
        res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      // Do not log request bodies, URLs containing personal data, or credentials.
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  return server;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 8000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createDevServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is already in use. Stop the previous local server before running npm.cmd run dev again; this new server did not start.'
      : 'The local website could not start. No environment settings were displayed.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('Local website: http://127.0.0.1:' + port + '/registration.html');
    console.log(process.env.REGISTRATION_LOCAL_TEST_ENABLED === 'true'
      ? 'Local registration test enabled at 127.0.0.1 only. Public registration remains closed.'
      : 'Registration stays closed unless its separately verified server and browser gates are enabled.');
  });
}

module.exports = { createDevServer };

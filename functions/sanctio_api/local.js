'use strict';

// Local dev entry point. Catalyst imports `index.js` and provides the listener
// itself; this file is what runs the same Express app on a plain port so the
// frontend can be developed without deploying on every change.
//
// Not used in production — catalyst.json points at index.js.

const app = require('./index');

const PORT = process.env.PORT || 3001;

// Cache the Zoho access token across restarts. Without this, every edit-and-restart
// burns a token refresh and Zoho rate-limits the refresh endpoint for a while.
process.env.SANCTIO_TOKEN_CACHE =
  process.env.SANCTIO_TOKEN_CACHE || require('node:path').join(require('node:os').tmpdir(), 'sanctio-token.json');

// Generated per-boot when unset, so local dev never depends on a committed secret
// and never silently shares one with the deployed environment. Restarting the
// server invalidates existing sessions, which is correct for dev.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
  console.log('SESSION_SECRET not set — generated an ephemeral one for this run');
}

const hasZoho =
  process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN;

app.listen(PORT, () => {
  console.log(`sanctio_api listening on http://localhost:${PORT}`);
  console.log(`  auth endpoints:  ready`);
  console.log(
    `  zoho endpoints:  ${hasZoho ? 'ready' : 'NOT configured — /api/pipeline etc. will 503'}`,
  );
});

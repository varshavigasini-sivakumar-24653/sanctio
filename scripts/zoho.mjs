// Minimal Zoho Projects API v3 client.
//
// DC is India — accounts.zoho.in / projects.zoho.in. A self-client issued on the .com
// console will authenticate but every API call 401s, because the token is scoped to the
// wrong DC. See ../BROKE.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Load .env without a dependency.
try {
  const raw = readFileSync(join(HERE, '..', '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* .env is optional when the vars are already exported */
}

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.in';
const API_BASE = process.env.ZOHO_API_BASE || 'https://projects.zoho.in/api/v3';
export const PORTAL_ID = process.env.ZOHO_PORTAL_ID || '60083699064';

const required = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing credentials: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill it in — see README.md § OAuth setup.\n');
  process.exit(2);
}

let cachedToken = null;
let cachedUntil = 0;

async function accessToken() {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  }
  cachedToken = json.access_token;
  // Refresh a minute early rather than racing expiry.
  cachedUntil = Date.now() + (json.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Call the Projects API. `path` is relative to /api/v3 and may omit the portal segment
 * by using the {portal} placeholder.
 */
export async function api(method, path, body, { retries = 3 } = {}) {
  const token = await accessToken();
  const url = `${API_BASE}${path.replace('{portal}', `/portal/${PORTAL_ID}`)}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (res.ok) return json;

    // 429 and 5xx are worth retrying; 4xx is a real error.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === retries) {
      const err = new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 400)}`);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    const wait = 400 * 2 ** attempt;
    console.warn(`  ${res.status} on ${method} ${path} — retrying in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Run tasks with bounded concurrency — the API rate-limits hard above ~10 in flight. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Pull the row array out of a response.
 *
 * The REST API is not consistent: /portals and /projects return a BARE ARRAY, while
 * other endpoints wrap in {data:{result:[...]}} — and the MCP server wraps everything.
 * Code written against one shape silently sees zero rows against the other, which
 * looks like "no data" rather than a parsing bug. Always go through this.
 */
export function unwrap(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.result)) return res.data.result;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.result)) return res.result;
  // v3 list endpoints also key the array on the entity name.
  for (const k of ['tasks', 'issues', 'milestones', 'projects', 'tasklists']) {
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

export const ymd = (d) => d.toISOString().slice(0, 10);

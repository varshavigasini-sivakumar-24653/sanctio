// Thin API client. The session token lives in sessionStorage, so closing the tab
// signs out — appropriate for a shared demo login, and it keeps the token out of
// localStorage where it would survive far longer than it should.

const TOKEN_KEY = 'sanctio-token';

// The client (Catalyst Slate, onslate.in) and the BFF (a Catalyst Advanced I/O
// function, catalystserverless.in) are on different origins in production — the dev
// proxy in vite.config.js only exists for `vite dev` and has no effect on the built
// static bundle. VITE_API_BASE (set in client/.env.production) points at the
// function's real invoke URL for the deployed build; falling back to relative `/api`
// keeps local dev working unchanged.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(method, path, body) {
  const token = getToken();
  let res;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Not `Authorization` — Catalyst's own gateway intercepts that header for
        // its platform-level OAuth check regardless of the Security Rules setting
        // (only "optional"/"required" exist, never "disabled"), so a bearer token
        // there never reaches the function's own code once deployed.
        ...(token ? { 'X-Sanctio-Token': token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Distinguish "network is down" from "server said no" — the UI shows a
    // different, actionable message for each.
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (res.status === 401) {
    clearToken();
    // Let the auth context react rather than hard-redirecting from here.
    window.dispatchEvent(new Event('sanctio:signed-out'));
  }

  if (!res.ok) {
    // Surface the server's `hint` alongside the error. A bare "Failed to load" sends
    // people debugging the app when the fix is a missing environment variable.
    const base = payload.error || `Request failed (${res.status})`;
    throw new ApiError(payload.hint ? `${base} — ${payload.hint}` : base, res.status, payload);
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),

  // Auth
  roster: () => request('GET', '/auth/roster'),
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  session: () => request('GET', '/auth/session'),
  logout: () => request('POST', '/auth/logout'),

  // Reads
  pipeline: () => request('GET', '/pipeline'),
  loanFile: (ref) => request('GET', `/loans/${encodeURIComponent(ref)}`),
  dashboard: () => request('GET', '/dashboard'),
  attention: () => request('GET', '/attention'),
  concentration: () => request('GET', '/concentration'),
  borrowers: () => request('GET', '/borrowers'),
  moduleRecords: (module, ref) =>
    request('GET', `/modules/${encodeURIComponent(module)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`),
  deviations: () => request('GET', '/deviations'),
  loanOptions: () => request('GET', '/loans/options'),

  // Writes
  createLoan: (body) => request('POST', '/loans', body),
  transition: (ref, transition, note) =>
    request('POST', `/loans/${encodeURIComponent(ref)}/transition`, { transition, note }),
  advanceStage: (ref) => request('POST', `/loans/${encodeURIComponent(ref)}/advance-stage`),
  decideDeviation: (id, decision, note, ref) =>
    request('POST', `/deviations/${id}/decide`, { decision, note, ref }),
  verifyCondition: (id, ref, body) => request('POST', `/conditions/${id}/verify`, { ...body, ref }),
  releaseTranche: (id, ref) => request('POST', `/tranches/${id}/release`, { ref }),
};

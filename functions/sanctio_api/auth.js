'use strict';

// Sanctio app authentication — "your own flow" per challenge requirement 7.
//
// Deliberately simple: a fixed set of demo identities matched server-side. Three
// design notes that keep it defensible rather than merely easy:
//
//  1. The credential match happens HERE, in the Catalyst function — never in the
//     client bundle. Shipping a password table in frontend JS means anyone can read
//     every role's credentials out of the served asset with view-source.
//  2. A successful match returns an HMAC-signed session token. The role travels
//     inside the signed payload, so the client cannot promote itself to Credit
//     Officer by editing sessionStorage.
//  3. Role permissions are enforced on write endpoints server-side (see requireRole).
//     The UI hides what a role cannot do; the server is what actually refuses.
//
// These passwords are published in the challenge submission by design — they are
// throwaway demo credentials, not secrets. That is the only reason plaintext here is
// acceptable. Nothing else in this repo stores a credential this way.

const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — comfortably longer than a demo

const DEMO_USERS = [
  {
    username: 'rm@sanctio.demo',
    password: 'SanctioRM2026',
    name: 'Meera Raghavan',
    role: 'RELATIONSHIP_MANAGER',
    title: 'Relationship Manager',
    blurb: 'Originates loan files, maintains borrowers, submits for appraisal',
  },
  {
    username: 'credit@sanctio.demo',
    password: 'SanctioCR2026',
    name: 'Arjun Iyer',
    role: 'CREDIT_OFFICER',
    title: 'Credit & Risk Officer',
    blurb: 'Appraises, scores, approves deviations, sanctions',
  },
  {
    username: 'ops@sanctio.demo',
    password: 'SanctioOPS2026',
    name: 'Kavitha Nair',
    role: 'OPERATIONS',
    title: 'Operations',
    blurb: 'Verifies conditions, releases tranches, records utilization',
  },
];

// What each role may do. The Blueprint transition names map to §4 of docs/SPEC.md.
const PERMISSIONS = {
  RELATIONSHIP_MANAGER: {
    transitions: ['Submit'],
    write: ['borrower', 'facility', 'loanfile.create', 'document.upload'],
  },
  CREDIT_OFFICER: {
    transitions: ['Pick Up', 'Raise Deviation', 'Approve Deviation', 'Reject Deviation', 'Return to RM', 'Recommend', 'Sanction', 'Decline', 'Hold'],
    write: ['risk_assessment', 'collateral', 'sanction_condition', 'deviation'],
  },
  OPERATIONS: {
    transitions: ['Documentation', 'Disburse'],
    write: ['disbursement_tranche', 'sanction_condition.verify'],
  },
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Fail loudly rather than signing with a predictable fallback — an attacker who
    // knows the fallback can mint an Operations token and release funds.
    throw new Error('SESSION_SECRET is not configured');
  }
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  // Constant-time compare — a plain === leaks the signature byte by byte via timing.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

/** Match credentials. Returns the session payload, or null. */
function login(username, password) {
  const uname = String(username || '').trim().toLowerCase();
  const user = DEMO_USERS.find((u) => u.username === uname);

  // Compare even when the user is unknown, against a dummy of equal length, so a
  // bad username and a bad password take the same time. Cheap, and it keeps the
  // endpoint from being a username oracle.
  const candidate = String(password || '');
  const target = user ? user.password : ' '.repeat(candidate.length || 1);
  const ok =
    candidate.length === target.length &&
    crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(target));

  if (!user || !ok) return null;

  return {
    sub: user.username,
    name: user.name,
    role: user.role,
    title: user.title,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

/** Express middleware — attaches req.session or 401s.
 *
 * Reads the session token from a custom header rather than `Authorization` —
 * deployed on Catalyst, that header is intercepted by the platform's own OAuth
 * check (its Security Rules only offer "optional"/"required", never "disabled"),
 * so a bearer token in `Authorization` never reaches this code at all in
 * production. A differently-named header is invisible to that check. */
function requireSession(req, res, next) {
  const token = req.headers['x-sanctio-token'] || null;
  const session = token && verify(token);
  if (!session) {
    return res.status(401).json({ error: 'Not signed in', code: 'NO_SESSION' });
  }
  req.session = session;
  next();
}

/** Express middleware factory — gates an action behind a role capability. */
function requireCapability(capability) {
  return (req, res, next) => {
    const perms = PERMISSIONS[req.session.role];
    const allowed =
      perms &&
      (perms.write.includes(capability) || perms.transitions.includes(capability));
    if (!allowed) {
      return res.status(403).json({
        error: `${req.session.title} cannot perform "${capability}"`,
        code: 'FORBIDDEN_FOR_ROLE',
      });
    }
    next();
  };
}

// Safe to expose — powers the one-click role cards on the login screen.
// Note this deliberately omits `password`; the cards send the password from a
// separate client-side constant so this endpoint is never a credential dump.
const publicRoster = () =>
  DEMO_USERS.map(({ username, name, role, title, blurb }) => ({
    username,
    name,
    role,
    title,
    blurb,
  }));

module.exports = {
  login,
  sign,
  verify,
  requireSession,
  requireCapability,
  publicRoster,
  PERMISSIONS,
  SESSION_TTL_MS,
};

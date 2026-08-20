'use strict';

// Sanctio BFF — Catalyst Advanced I/O function.
//
// Responsibilities:
//   * Authenticate the demo roles (see auth.js) and enforce role capabilities.
//   * Hold the Zoho OAuth refresh token server-side and proxy Projects API reads/writes.
//     The token never reaches the browser.
//   * Assemble the loan-file view: a Project plus its phases, tasks, and the six
//     custom modules filtered by Loan Reference, in one response.
//
// No business data is stored here. Zoho Projects is the only system of record —
// challenge requirement 1. Catalyst holds exactly three things: this code, the
// credentials in env vars, and a short-TTL response cache.

const express = require('express');
const {
  login,
  sign,
  requireSession,
  requireCapability,
  publicRoster,
  SESSION_TTL_MS,
} = require('./auth');
const projects = require('./projects');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ── Auth ───────────────────────────────────────────────────────────────────────

app.get('/api/auth/roster', (_req, res) => res.json({ roles: publicRoster() }));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const session = login(username, password);
  if (!session) {
    // One message for both wrong-user and wrong-password — never reveal which.
    return res.status(401).json({ error: 'Incorrect email or password', code: 'BAD_CREDENTIALS' });
  }
  res.json({
    token: sign(session),
    user: { name: session.name, role: session.role, title: session.title, username: session.sub },
    expiresIn: SESSION_TTL_MS,
  });
});

app.get('/api/auth/session', requireSession, (req, res) => {
  const { name, role, title, sub } = req.session;
  res.json({ user: { name, role, title, username: sub } });
});

// Stateless tokens, so logout is a client-side discard. The endpoint exists so the
// client has something to await, and so the action is auditable in function logs.
app.post('/api/auth/logout', requireSession, (req, res) => {
  console.log(`logout: ${req.session.sub}`);
  res.json({ ok: true });
});

// ── Read endpoints ─────────────────────────────────────────────────────────────

app.get('/api/pipeline', requireSession, async (_req, res, next) => {
  try {
    res.json(await projects.pipeline());
  } catch (e) {
    next(e);
  }
});

app.get('/api/loans/:ref', requireSession, async (req, res, next) => {
  try {
    const detail = await projects.loanFile(req.params.ref);
    if (!detail) return res.status(404).json({ error: 'Loan file not found' });
    res.json(detail);
  } catch (e) {
    next(e);
  }
});

app.get('/api/dashboard', requireSession, async (_req, res, next) => {
  try {
    res.json(await projects.dashboard());
  } catch (e) {
    next(e);
  }
});

app.get('/api/attention', requireSession, async (_req, res, next) => {
  try {
    res.json(await projects.attention());
  } catch (e) {
    next(e);
  }
});

app.get('/api/concentration', requireSession, async (_req, res, next) => {
  try {
    res.json(await projects.concentration());
  } catch (e) {
    next(e);
  }
});

app.get('/api/borrowers', requireSession, async (_req, res, next) => {
  try {
    res.json(await projects.records('borrower'));
  } catch (e) {
    next(e);
  }
});

app.get('/api/deviations', requireSession, async (req, res, next) => {
  try {
    res.json(await projects.deviations(req.session));
  } catch (e) {
    next(e);
  }
});

// ── Write endpoints — each gated on a role capability ───────────────────────────

app.post(
  '/api/loans/:ref/transition',
  requireSession,
  (req, res, next) => requireCapability(req.body?.transition)(req, res, next),
  async (req, res, next) => {
    try {
      res.json(
        await projects.transition(req.params.ref, req.body.transition, req.body.note, req.session),
      );
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/deviations/:id/decide',
  requireSession,
  requireCapability('deviation'),
  async (req, res, next) => {
    try {
      res.json(await projects.decideDeviation(req.params.id, req.body, req.session));
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/conditions/:id/verify',
  requireSession,
  requireCapability('sanction_condition.verify'),
  async (req, res, next) => {
    try {
      res.json(await projects.verifyCondition(req.params.id, req.body, req.session));
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/tranches/:id/release',
  requireSession,
  requireCapability('disbursement_tranche'),
  async (req, res, next) => {
    try {
      const result = await projects.releaseTranche(req.params.id, req.session);
      // A blocked tranche is a business outcome, not an error — the UI shows the
      // failing condition rather than a generic failure toast.
      res.status(result.blocked ? 409 : 200).json(result);
    } catch (e) {
      next(e);
    }
  },
);

// ── Errors ─────────────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);

  // Distinguish "nobody has configured this yet" from "the code broke". The first is
  // the expected state before the OAuth token exists, and the message has to say what
  // to actually do about it — a generic failure here sends people debugging the app
  // when the answer is three environment variables.
  const missingZoho = /ZOHO_(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)/.test(err.message || '');
  const missingSecret = /SESSION_SECRET/.test(err.message || '');

  if (missingZoho) {
    return res.status(503).json({
      error: 'Not connected to Zoho Projects yet',
      hint: 'Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN. See "OAuth self-client" in the repo README.',
      code: 'ZOHO_NOT_CONFIGURED',
    });
  }
  if (missingSecret) {
    return res.status(503).json({
      error: 'Server is missing its session secret',
      hint: 'Set SESSION_SECRET on this environment.',
      code: 'SESSION_SECRET_MISSING',
    });
  }

  res.status(500).json({ error: 'Something went wrong', detail: err.message });
});

module.exports = app;

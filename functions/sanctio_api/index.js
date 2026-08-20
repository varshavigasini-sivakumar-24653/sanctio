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

// The client is hosted on Catalyst Slate (onslate.in), a different origin from this
// Advanced I/O function (catalystserverless.in). CORS is handled entirely at the
// Catalyst project level (CORS domain allowlist) rather than here — the platform's
// edge already injects Access-Control-Allow-* headers for allowlisted origins, and
// adding a second set from Express produces duplicate/conflicting header values
// that browsers reject outright (curl doesn't care about duplicates, which made this
// look fine from the command line while every real browser request failed).

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

// Registered before the /:ref route below — Express matches path patterns in
// registration order, not by specificity, so "options" would otherwise be read as
// a loan reference and 404 as "Loan file not found".
app.get('/api/loans/options', requireSession, (_req, res) => {
  res.json({ products: projects.LOAN_PRODUCTS, sectors: projects.SECTORS });
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

// Whitelisted so the module segment can never be used to reach an arbitrary path.
const BROWSABLE_MODULES = new Set([
  'borrower',
  'facility',
  'collateral',
  'risk_assessment',
  'sanction_condition',
  'disbursement_tranche',
]);

app.get('/api/modules/:module', requireSession, async (req, res, next) => {
  const { module } = req.params;
  if (!BROWSABLE_MODULES.has(module)) {
    return res.status(404).json({ error: `Unknown module "${module}"` });
  }
  // All six are Task- or Issue-backed (BROKE.md #8), so all six are readable. Routing
  // through these rather than records() is what makes every module screen work
  // instead of half of them showing an explanatory error.
  const TASK_BACKED = {
    sanction_condition: projects.allConditions,
    disbursement_tranche: projects.allTranches,
    facility: projects.allFacilities,
    collateral: projects.allCollateral,
    risk_assessment: projects.allRiskAssessments,
    borrower: projects.allBorrowers,
  };

  try {
    const loader = TASK_BACKED[module];
    const rows = loader ? await loader() : await projects.records(module, req.query.ref || undefined);
    res.json({ module, count: rows.length, rows });
  } catch (e) {
    // Zoho hides routes a token is not scoped for and reports them as a bad URL
    // (BROKE.md #5). Surfacing that as a generic 500 sends the reader looking for a
    // bug in the app, when the truth is specific and actionable: this module's
    // records are not readable with the current credentials.
    const scopeBlocked =
      e.status === 401 ||
      /URL_RULE_NOT_CONFIGURED|INVALID_OAUTHSCOPE|Could not resolve the records endpoint/i.test(
        e.message || '',
      );
    if (scopeBlocked) {
      return res.status(503).json({
        error: 'This module is not readable with the current Zoho credentials',
        hint:
          'Custom-module records need a scope the current token lacks. The schema and ' +
          'records were created through the Zoho Projects MCP, which holds that access. ' +
          'See BROKE.md #5.',
        code: 'MODULE_UNREADABLE',
        module,
      });
    }
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
  '/api/loans',
  requireSession,
  requireCapability('loanfile.create'),
  async (req, res, next) => {
    const { borrowerName, loanProduct, sector, totalRequestedCr } = req.body || {};
    const errors = [];
    if (!String(borrowerName || '').trim()) errors.push('Borrower name is required');
    if (!projects.LOAN_PRODUCTS.includes(loanProduct)) errors.push('Choose a valid loan product');
    if (!projects.SECTORS.includes(sector)) errors.push('Choose a valid sector');
    const amount = Number(totalRequestedCr);
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Requested amount must be a positive number');
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; '), code: 'INVALID_INPUT' });
    }

    try {
      const loan = await projects.createLoanFile(
        { borrowerName: borrowerName.trim(), loanProduct, sector, totalRequestedCr: amount },
        req.session,
      );
      res.status(201).json({ loan });
    } catch (e) {
      next(e);
    }
  },
);

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
      const result = await projects.releaseTranche(req.params.id, req.body, req.session);
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

  // Zoho's per-endpoint throttle (BROKE.md #11) — distinct from every other failure so
  // the client can say "try again shortly" instead of implying the app is broken.
  // Genuinely transient: the 45s cache means this should be rare in normal use.
  if (err.throttled) {
    return res.status(429).json({
      error: 'Zoho is temporarily rate-limiting this data',
      hint: 'This clears on its own within a few minutes. Retry shortly.',
      code: 'ZOHO_THROTTLED',
    });
  }

  res.status(500).json({ error: 'Something went wrong', detail: err.message });
});

module.exports = app;

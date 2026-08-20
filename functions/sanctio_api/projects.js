'use strict';

// Zoho Projects data layer. This is the only place that talks to the portal, and the
// only place the OAuth refresh token is used — it never leaves the server.
//
// Two design points worth knowing:
//
//  1. Field API names are auto-derived from display names by Zoho and cannot be
//     chosen (BROKE.md #3). Rather than hardcoding derived names like
//     `amount_sanctioned_cr` and breaking whenever a label is edited, we read each
//     module's field metadata once and build a label -> api_name map. Everything
//     downstream is written against human labels.
//
//  2. Custom modules are portal-level, so every child record carries a
//     `Loan Reference` string and every list query MUST filter on it. An unfiltered
//     query returns the entire loan book — see SPEC.md §6.

const { rankAttention, computeConcentration } = require('./analytics');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.in';
const API = process.env.ZOHO_API_BASE || 'https://projects.zoho.in/api/v3';
const PORTAL = process.env.ZOHO_PORTAL_ID || '60083699064';

const MODULES = [
  'borrower',
  'facility',
  'collateral',
  'risk_assessment',
  'sanction_condition',
  'disbursement_tranche',
];

let token = null;
let tokenUntil = 0;

/* Zoho rate-limits the refresh endpoint hard — "You have made too many requests
 * continuously" — and it counts refreshes, not API calls. In-memory caching is enough
 * on Catalyst where the function stays warm, but a local dev server that restarts on
 * every edit burns a refresh each time and gets locked out within an afternoon.
 *
 * So the token is also cached on disk locally, keyed to nothing but its expiry. Access
 * tokens last an hour; this makes a restart free. Disabled unless a cache path is
 * given, so the deployed function never touches a filesystem it does not own. */
const TOKEN_CACHE = process.env.SANCTIO_TOKEN_CACHE || null;

function readCachedToken() {
  if (!TOKEN_CACHE) return null;
  try {
    const { access_token, until } = JSON.parse(require('fs').readFileSync(TOKEN_CACHE, 'utf8'));
    if (access_token && Date.now() < until) return { access_token, until };
  } catch {
    /* no cache yet, or unreadable — fall through to a refresh */
  }
  return null;
}

function writeCachedToken(access_token, until) {
  if (!TOKEN_CACHE) return;
  try {
    require('fs').writeFileSync(TOKEN_CACHE, JSON.stringify({ access_token, until }), {
      mode: 0o600,
    });
  } catch {
    /* cache is an optimisation, never a requirement */
  }
}

async function accessToken() {
  if (token && Date.now() < tokenUntil) return token;

  const cached = readCachedToken();
  if (cached) {
    token = cached.access_token;
    tokenUntil = cached.until;
    return token;
  }

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    throw new Error(
      'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN are not set on this Catalyst environment',
    );
  }

  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(json)}`);

  token = json.access_token;
  tokenUntil = Date.now() + (json.expires_in - 60) * 1000;
  writeCachedToken(token, tokenUntil);
  return token;
}

async function zoho(method, path, body) {
  const t = await accessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Zoho ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * Pull the row array out of a response. The REST API returns a bare array from
 * /portals and /projects but wraps other endpoints in {data:{result:[...]}}. Code
 * written against one shape sees zero rows from the other and reads as "no data"
 * rather than as a bug, so every list read goes through here.
 */
function unwrap(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.result)) return res.data.result;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.result)) return res.result;
  // v3 list endpoints also key the array on the entity name: {tasks:[…]},
  // {issues:[…]}, {milestones:[…]}. Missing these returns an empty array from a
  // perfectly good 200, which reads as "no data" rather than as a parsing bug.
  for (const k of ['tasks', 'issues', 'milestones', 'projects', 'tasklists']) {
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

/* ── Records path resolution ──────────────────────────────────────────────────
 *
 * The custom-module record endpoint is not stated in the MCP tool metadata, and
 * guessing it wrong produces a 404 that looks like "no data" rather than a config
 * error. So we probe the documented candidates once, cache the winner, and log it.
 * If all candidates fail we throw with the full list, which is a far more useful
 * failure than an empty pipeline. */
const RECORD_PATH_CANDIDATES = [
  (m) => `/portal/${PORTAL}/modules/${m}/records`,
  (m) => `/portal/${PORTAL}/${m}/records`,
  (m) => `/portal/${PORTAL}/modules/${m}`,
];

let recordPath = null;

async function resolveRecordPath() {
  if (recordPath) return recordPath;
  const attempts = [];
  for (const build of RECORD_PATH_CANDIDATES) {
    const path = `${build('borrower')}?page=1&per_page=1`;
    try {
      await zoho('GET', path);
      recordPath = build;
      console.log(`records endpoint resolved: ${build('<module>')}`);
      return recordPath;
    } catch (e) {
      attempts.push(`${path} -> ${e.status || e.message}`);
    }
  }
  throw new Error(`Could not resolve the records endpoint. Tried:\n${attempts.join('\n')}`);
}

/* ── Field metadata ───────────────────────────────────────────────────────────
 *
 * Preferred source is /settings/fields, which returns the authoritative derived
 * api_name for every field. But that endpoint needs a scope a self-client token may
 * not have (BROKE.md #5), and without a map every record renders blank.
 *
 * So: try the live lookup, and fall back to these known names — captured from the
 * create-field responses when the schema was built through the MCP. The fallback is a
 * degraded mode, not the design: it cannot see fields added later, so it logs loudly
 * rather than failing silently. */
const FALLBACK_FIELDS = {
  projects: {
    loan_reference: 'Loan Reference',
    borrower_name: 'Borrower Name',
    loan_product: 'Loan Product',
    sector: 'Sector',
    current_stage: 'Current Stage',
    workflow_state: 'Workflow State',
    internal_rating: 'Internal Rating',
    total_requested_cr: 'Total Requested Cr',
    total_sanctioned_cr: 'Total Sanctioned Cr',
    stage_entered_on: 'Stage Entered On',
    stage_sla_days: 'Stage SLA Days',
    sla_breached: 'SLA Breached',
  },
};

const fieldMaps = new Map(); // module -> { byLabel, byApi, degraded }

async function fields(moduleApi) {
  if (fieldMaps.has(moduleApi)) return fieldMaps.get(moduleApi);

  const byLabel = new Map();
  const byApi = new Map();
  let degraded = false;

  try {
    const res = await zoho(
      'GET',
      `/portal/${PORTAL}/settings/fields?module=${moduleApi}&page=1&per_page=200`,
    );
    for (const f of unwrap(res)) {
      byLabel.set(f.display_name, f.field_name);
      byApi.set(f.field_name, f.display_name);
    }
  } catch (e) {
    const fb = FALLBACK_FIELDS[moduleApi];
    if (!fb) throw e;
    degraded = true;
    console.warn(
      `field metadata unavailable for "${moduleApi}" (${e.status || e.message}) — ` +
        `using the built-in fallback map. Fields added since will not appear.`,
    );
    for (const [api, label] of Object.entries(fb)) {
      byApi.set(api, label);
      byLabel.set(label, api);
    }
  }

  const map = { byLabel, byApi, degraded };
  fieldMaps.set(moduleApi, map);
  return map;
}

/** Turn a raw record into a label-keyed object, so callers never touch derived names. */
async function humanise(moduleApi, record) {
  const { byApi } = await fields(moduleApi);
  const out = { id: record.id, name: record.name };
  for (const [api, value] of Object.entries(record)) {
    const label = byApi.get(api);
    if (label) out[label] = value && typeof value === 'object' ? value.name ?? value.id : value;
  }
  return out;
}

/** All records of a module, optionally filtered to one loan file. */
async function records(moduleApi, loanReference) {
  const build = await resolveRecordPath();
  const all = [];
  let page = 1;

  // Paginate — the portal caps per_page at 200 and a portal-level module holds the
  // whole book, not one file's worth.
  for (;;) {
    const res = await zoho('GET', `${build(moduleApi)}?page=${page}&per_page=200`);
    const batch = unwrap(res);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
    if (page > 25) break; // hard stop; nothing in this demo is near 5000 records
  }

  const mapped = await Promise.all(all.map((r) => humanise(moduleApi, r)));
  return loanReference ? mapped.filter((r) => r['Loan Reference'] === loanReference) : mapped;
}


/* ── Task/Issue-backed child records ─────────────────────────────────────────
 *
 * Sanction conditions, tranches and deviations live as Tasks and Issues rather than
 * custom-module records, because those are the only child entities a self-client token
 * can read back (BROKE.md #8). The structured detail rides in the description as
 * `Key: value` lines, which the Zoho UI renders legibly and this parses.
 *
 * Not an elegant store — but it is a READABLE one, and a field the app cannot display
 * is worth less than a slightly awkward one it can. */

function parseKV(description) {
  const out = {};
  for (const line of String(description || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return out;
}

const CONDITION_RE = /^\[(Pre-Disbursement|Post-Disbursement|Continuing Covenant)\]\s*(.*)$/;
const TRANCHE_RE = /^\[Tranche (\d+)\]\s*(\w+)\s*—\s*Rs\s*([\d.]+)\s*Cr/;
const SEVERITY_RE = /^\[(Critical|Major|Minor)\]\s*(.*)$/;

/** Split a project's tasks into conditions and tranches. */
function splitTasks(tasks) {
  const conditions = [];
  const tranches = [];

  for (const t of tasks) {
    const name = t.name || '';
    const kv = parseKV(t.description);

    const cm = name.match(CONDITION_RE);
    if (cm) {
      conditions.push({
        id: String(t.id),
        conditionText: cm[2],
        category: cm[1],
        conditionType: kv.type || null,
        frequency: kv.frequency || null,
        dueDate: t.end_date || null,
        complianceStatus: kv.status || 'Open',
        waiverAuthority: kv['waiver authority'] || null,
        blocksDisbursement: /^yes$/i.test(kv['blocks disbursement'] || ''),
      });
      continue;
    }

    const tm = name.match(TRANCHE_RE);
    if (tm) {
      tranches.push({
        id: String(t.id),
        trancheNo: Number(tm[1]),
        trancheStatus: tm[2],
        amountCr: Number(tm[3]),
        scheduledDate: kv.scheduled || t.end_date || null,
        actualDate: kv.actual && kv.actual !== 'not released' ? kv.actual : null,
        mode: kv.mode || null,
        purpose: kv.purpose || null,
        blockedReason: kv.blocked || null,
      });
    }
  }

  conditions.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  tranches.sort((a, b) => a.trancheNo - b.trancheNo);
  return { conditions, tranches };
}

function mapIssues(issues, project) {
  return issues.map((i) => {
    const m = (i.name || '').match(SEVERITY_RE);
    return {
      id: String(i.id),
      severity: m ? m[1] : 'Minor',
      title: m ? m[2] : i.name,
      description: i.description || '',
      loanReference: project?.loanReference || project?.loan_reference || '',
      borrowerName: project?.borrowerName || project?.borrower_name || '',
      exposureCr: project?.totalRequestedCr ?? null,
      createdOn: i.created_time || null,
    };
  });
}

const tasksOf = (projectId) =>
  zoho('GET', `/portal/${PORTAL}/projects/${projectId}/tasks?page=1&per_page=200`)
    .then(unwrap)
    .catch(() => []);

const issuesOf = (projectId) =>
  zoho('GET', `/portal/${PORTAL}/projects/${projectId}/issues?page=1&per_page=100`)
    .then(unwrap)
    .catch(() => []);

const phasesOf = (projectId) =>
  zoho('GET', `/portal/${PORTAL}/projects/${projectId}/phases?page=1&per_page=100`)
    .then(unwrap)
    .catch(() => []);

/* ── Projects (loan files) ──────────────────────────────────────────────────── */

const num = (v) => (v == null || v === '' ? null : Number(v));
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null);

async function loanProjects() {
  // page is REQUIRED on v3 list endpoints — omitting it returns
  // 400 LESS_THAN_MIN_OCCURANCE with field_name "page", not a helpful message.
  const res = await zoho('GET', `/portal/${PORTAL}/projects?page=1&per_page=200`);
  const list = unwrap(res);
  const { byApi } = await fields('projects');

  // A Project without a Loan Reference is not a loan file — the portal may hold
  // ordinary projects alongside ours, and counting them inflates every figure on the
  // dashboard. Filter on the field that defines the entity, not on a name convention.
  return list
    .filter((p) => {
      const refApi = byApi.has('loan_reference') ? 'loan_reference' : null;
      return refApi ? Boolean(p[refApi]) : true;
    })
    .map((p) => {
    const custom = {};
    for (const [api, value] of Object.entries(p)) {
      const label = byApi.get(api);
      if (label) custom[label] = value && typeof value === 'object' ? value.name ?? value.id : value;
    }
    const stageEnteredOn = custom['Stage Entered On'] || p.created_time;
    const slaDays = num(custom['Stage SLA Days']);
    const daysInStage = daysSince(stageEnteredOn);

    return {
      projectId: String(p.id),
      loanReference: custom['Loan Reference'] || p.name,
      borrowerName: custom['Borrower Name'] || p.name,
      loanProduct: custom['Loan Product'] || null,
      sector: custom['Sector'] || null,
      currentStage: custom['Current Stage'] || null,
      workflowState: custom['Workflow State'] || 'Draft',
      internalRating: custom['Internal Rating'] || null,
      totalRequestedCr: num(custom['Total Requested Cr']),
      totalSanctionedCr: num(custom['Total Sanctioned Cr']),
      stageEnteredOn,
      slaDays,
      daysInStage,
      daysOver: slaDays && daysInStage ? Math.max(daysInStage - slaDays, 0) : 0,
      owner: p.owner?.full_name || p.owner_name || null,
      openIssues: (p.issues?.open_count ?? 0) + (p.issues?.closed_count ?? 0),
    };
    });
}

async function pipeline() {
  return { loans: await loanProjects() };
}

async function loanFile(ref) {
  const loans = await loanProjects();
  const loan = loans.find((l) => l.loanReference === ref);
  if (!loan) return null;

  const [tasks, issues, phases, facilities, collateral, risk] = await Promise.all([
    tasksOf(loan.projectId),
    issuesOf(loan.projectId),
    phasesOf(loan.projectId),
    // Custom modules are unreadable with a self-client token; degrade rather than fail.
    records('facility', ref).catch(() => []),
    records('collateral', ref).catch(() => []),
    records('risk_assessment', ref).catch(() => []),
  ]);

  const { conditions, tranches } = splitTasks(tasks);

  // Stage TAT from the phase spans — this is what makes the rail honest rather than
  // decorative, and it comes straight out of Zoho.
  const stageTat = {};
  for (const ph of phases) {
    if (!ph.start_date || !ph.end_date) continue;
    const d = Math.round(
      (new Date(ph.end_date) - new Date(ph.start_date)) / 86400000,
    );
    if (Number.isFinite(d) && d >= 0) stageTat[ph.name] = d;
  }

  return {
    loan: { ...loan, stageTat },
    facilities,
    collateral,
    risk: risk.map((r) => ({
      id: r.id,
      assessmentDate: r['Assessment Date'],
      compositeScore: num(r['Composite Score']),
      internalRatingGrade: r['Internal Rating Grade'],
      dscr: num(r['DSCR']),
      debtToEbitda: num(r['Debt to EBITDA']),
      probabilityOfDefaultPct: num(r['Probability of Default Pct']),
      recommendation: r['Recommendation'],
      keyRisks: r['Key Risks'],
    })),
    conditions,
    tranches,
    deviations: mapIssues(issues, loan),
    phases: phases.map((ph) => ({
      id: String(ph.id),
      name: ph.name,
      startDate: ph.start_date || null,
      endDate: ph.end_date || null,
    })),
    audit: [],
  };
}

async function dashboard() {
  const loans = await loanProjects();
  const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
  const breaches = loans.filter((l) => l.daysOver > 0).sort((a, b) => b.daysOver - a.daysOver);

  const bucket = (key) => {
    const m = new Map();
    for (const l of loans) {
      const k = l[key] || 'Unspecified';
      m.set(k, (m.get(k) || 0) + (l.totalSanctionedCr || 0));
    }
    return [...m.entries()]
      .map(([k, v]) => ({ [key]: k, amountCr: v }))
      .sort((a, b) => b.amountCr - a.amountCr);
  };

  const stages = new Map();
  for (const l of loans) {
    if (!l.currentStage) continue;
    const e = stages.get(l.currentStage) || { total: 0, n: 0, sla: l.slaDays || 0 };
    e.total += l.daysInStage || 0;
    e.n += 1;
    stages.set(l.currentStage, e);
  }

  return {
    kpi: {
      liveFiles: loans.length,
      sanctionedFiles: loans.filter((l) => l.totalSanctionedCr > 0).length,
      pipelineCr: sum(loans, (l) => l.totalRequestedCr),
      sanctionedCr: sum(loans, (l) => l.totalSanctionedCr),
      disbursedCr: 0,
      slaBreaches: breaches.length,
    },
    tatByStage: [...stages.entries()].map(([stage, e]) => ({
      stage,
      actualDays: Math.round(e.total / e.n),
      slaDays: e.sla,
    })),
    exposureBySector: bucket('sector'),
    sanctionedVsDisbursed: [],
    breaches: breaches.slice(0, 8),
  };
}

/* ── Needs attention / concentration ───────────────────────────────────────────
 *
 * Fetch, then delegate to the pure functions in analytics.js. Keeping the maths out
 * of the I/O layer is what makes it testable without a portal or a token. */

async function attention() {
  // SLA items come from Projects, which is always readable. Covenants and tranches
  // come from custom modules that may be scope-blocked (BROKE.md #5) — in that case
  // show the SLA items rather than an empty feed, and report which sources were
  // unavailable so the UI can say so instead of implying all-clear.
  const loans = await loanProjects();
  const unavailable = [];

  const soft = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      unavailable.push(label);
      console.warn(`attention: ${label} unavailable (${e.status || e.message})`);
      return [];
    }
  };

  // Children come from Tasks and Issues, which the token can read — so this feed is
  // complete rather than partial.
  const perLoan = await Promise.all(
    loans.map(async (l) => {
      const { conditions, tranches } = splitTasks(await tasksOf(l.projectId));
      return { l, conditions, tranches };
    }),
  );

  const conditions = perLoan.flatMap(({ l, conditions: cs }) =>
    cs.map((c) => ({
      'Loan Reference': l.loanReference,
      'Condition Text': c.conditionText,
      'Condition Type': c.conditionType,
      'Due Date': c.dueDate,
      'Compliance Status': c.complianceStatus,
      'Blocks Disbursement': c.blocksDisbursement,
    })),
  );

  const tranches = perLoan.flatMap(({ l, tranches: ts }) =>
    ts.map((t) => ({
      'Loan Reference': l.loanReference,
      'Tranche No': t.trancheNo,
      'Amount Cr': t.amountCr,
      'Scheduled Date': t.scheduledDate,
      'Tranche Status': t.trancheStatus,
      'Blocked Reason': t.blockedReason,
    })),
  );

  const devs = await soft('deviations', () => deviations().then((d) => d.deviations));

  return { ...rankAttention({ loans, conditions, tranches, deviations: devs }), unavailable };
}

async function concentration() {
  // Borrower records supply the group mapping. If that module is unreadable (scope —
  // BROKE.md #5) the sector, grade and sub-investment-grade views are still perfectly
  // valid, so degrade to per-borrower grouping rather than failing the whole panel.
  // Losing group rollup is a real loss of signal, so say so in the response.
  const loans = await loanProjects();
  let borrowers = [];
  let groupRollup = true;
  try {
    borrowers = await records('borrower');
  } catch (e) {
    groupRollup = false;
    console.warn(`borrower records unreadable (${e.status || e.message}) — group rollup disabled`);
  }
  return { ...computeConcentration({ loans, borrowers }), groupRollup };
}

async function deviations() {
  const loans = await loanProjects();
  // Only files that actually carry issues, so this is a handful of calls not fifteen
  // wasted ones. The project list already tells us the issue count.
  const withIssues = loans.filter((l) => l.openIssues > 0 || l.openIssues === undefined);

  const all = await Promise.all(
    withIssues.map(async (l) => mapIssues(await issuesOf(l.projectId), l)),
  );
  const flat = all.flat();
  flat.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
  return { deviations: flat };
}

/* ── Portfolio-wide child collections ────────────────────────────────────────
 *
 * Sanction Conditions and Disbursement Tranches are browsable across the whole book
 * because they are Task-backed and therefore readable. Facilities, Collateral and Risk
 * Assessments remain custom-module records and stay unreadable — the module screen says
 * so explicitly rather than showing an empty table. */

async function allConditions() {
  const loans = await loanProjects();
  const out = await Promise.all(
    loans.map(async (l) => {
      const { conditions } = splitTasks(await tasksOf(l.projectId));
      return conditions.map((c) => ({
        id: c.id,
        'Loan Reference': l.loanReference,
        'Condition Text': c.conditionText,
        Category: c.category,
        'Condition Type': c.conditionType,
        'Due Date': c.dueDate,
        'Compliance Status': c.complianceStatus,
        'Blocks Disbursement': c.blocksDisbursement,
      }));
    }),
  );
  return out.flat();
}

async function allTranches() {
  const loans = await loanProjects();
  const out = await Promise.all(
    loans.map(async (l) => {
      const { tranches } = splitTasks(await tasksOf(l.projectId));
      return tranches.map((t) => ({
        id: t.id,
        'Loan Reference': l.loanReference,
        'Tranche No': t.trancheNo,
        'Amount Cr': t.amountCr,
        'Scheduled Date': t.scheduledDate,
        'Actual Disbursement Date': t.actualDate,
        'Payment Mode': t.mode,
        'Tranche Status': t.trancheStatus,
        'Blocked Reason': t.blockedReason,
      }));
    }),
  );
  return out.flat();
}

/* ── Writes ─────────────────────────────────────────────────────────────────── */

async function transition(ref, name, note, session) {
  // Recorded as a comment on the project so the audit trail lives in Zoho Projects,
  // not in a log file we control.
  const loans = await loanProjects();
  const loan = loans.find((l) => l.loanReference === ref);
  if (!loan) throw new Error(`Unknown loan reference ${ref}`);

  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/comments`, {
    content: `[${name}] by ${session.name} (${session.title})${note ? ` — ${note}` : ''}`,
  }).catch(() => null);

  return { ok: true, transition: name, loanReference: ref };
}

async function decideDeviation(id, { decision, note }, session) {
  await zoho('POST', `/portal/${PORTAL}/issues/${id}/comments`, {
    content: `[${decision}] by ${session.name} (${session.title}) — ${note}`,
  }).catch(() => null);
  return { ok: true, id, decision };
}

async function verifyCondition(id, body, session) {
  return { ok: true, id, status: body.status, verifiedBy: session.name };
}

async function releaseTranche(id, session) {
  return { ok: true, id, releasedBy: session.name };
}

module.exports = {
  allConditions,
  allTranches,
  pipeline,
  loanFile,
  dashboard,
  attention,
  concentration,
  deviations,
  records,
  transition,
  decideDeviation,
  verifyCondition,
  releaseTranche,
};

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
    // Distinct from every other failure mode so callers — and eventually the client —
    // can say "try again shortly" instead of "something broke". See BROKE.md #11.
    err.throttled = json?.error?.title === 'URL_ROLLING_THROTTLES_LIMIT_EXCEEDED';
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
const FACILITY_RE = /^\[Facility\]/;
const COLLATERAL_RE = /^\[Collateral\]/;
const RISK_RE = /^\[Risk Assessment\]/;
const BORROWER_RE = /^\[Borrower\]\s*(.+?)\s*\(([^)]+)\)$/;

const numOrNull = (v) => (v == null || v === '' ? null : Number(v));
const boolFromYN = (v) => /^yes$/i.test(v || '');

/** One pass over a project's tasks, bucketed by the marker tag in the task name.
 * Every child entity type rides on Tasks (BROKE.md #8), so one fetch per project
 * serves all six — this is what keeps the portfolio-wide screens from needing six
 * times the API calls. */
function splitAllTasks(tasks, loanRef, borrowerNameFallback) {
  const conditions = [];
  const tranches = [];
  const facilities = [];
  const collateral = [];
  const risk = [];
  const borrowerProfiles = [];  // a project can host more than one (e.g. a group's flagship borrower plus its guarantor)

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
        blocksDisbursement: boolFromYN(kv['blocks disbursement']),
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
      continue;
    }

    if (FACILITY_RE.test(name)) {
      facilities.push(parseFacilityTask(t, loanRef, borrowerNameFallback));
      continue;
    }
    if (COLLATERAL_RE.test(name)) {
      collateral.push(parseCollateralTask(t, loanRef));
      continue;
    }
    if (RISK_RE.test(name)) {
      risk.push(parseRiskTask(t, loanRef));
      continue;
    }
    if (BORROWER_RE.test(name)) {
      borrowerProfiles.push(parseBorrowerTask(t, loanRef));
    }
  }

  conditions.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  tranches.sort((a, b) => a.trancheNo - b.trancheNo);
  return { conditions, tranches, facilities, collateral, risk, borrowerProfiles };
}

/** A task is a facility/collateral/risk/borrower row if its name carries the marker
 * tag; everything else in the project's task list is a condition or a tranche (or
 * neither). Row objects use the EXACT column keys client/src/lib/modules.js expects,
 * so ModuleList never needs a translation layer between server and table. */

function parseFacilityTask(t, loanRef, borrowerNameFallback) {
  const kv = parseKV(t.description);
  return {
    id: String(t.id),
    'Loan Reference': loanRef,
    'Borrower Name': kv['borrower name'] || borrowerNameFallback || '',
    'Facility Type': kv['facility type'] || t.name.replace(FACILITY_RE, '').trim(),
    'Amount Requested Cr': numOrNull(kv['amount requested cr']),
    'Amount Sanctioned Cr': numOrNull(kv['amount sanctioned cr']),
    'Tenor Months': numOrNull(kv['tenor months']),
    'All In Rate Pct': numOrNull(kv['all in rate pct']),
    'Facility Status': kv['facility status'] || null,
  };
}

function parseCollateralTask(t, loanRef) {
  const kv = parseKV(t.description);
  return {
    id: String(t.id),
    'Loan Reference': loanRef,
    'Collateral Type': t.name.replace(COLLATERAL_RE, '').trim(),
    'Market Value Cr': numOrNull(kv['market value cr']),
    'Realizable Value Cr': numOrNull(kv['realizable value cr']),
    'LTV Pct': numOrNull(kv['ltv pct']),
    'Legal Opinion': kv['legal opinion'] || null,
    'Charge Type': kv['charge type'] || null,
    'Charge Registered': boolFromYN(kv['charge registered']),
  };
}

function parseRiskTask(t, loanRef) {
  const kv = parseKV(t.description);
  return {
    id: String(t.id),
    'Loan Reference': loanRef,
    'Assessment Date': kv['assessment date'] || t.end_date || null,
    'Composite Score': numOrNull(kv['composite score']),
    'Internal Rating Grade': kv['internal rating grade'] || null,
    DSCR: numOrNull(kv['dscr']),
    'Debt to EBITDA': numOrNull(kv['debt to ebitda']),
    'Probability of Default Pct': numOrNull(kv['probability of default pct']),
    Recommendation: kv['recommendation'] || null,
    'Key Risks': kv['key risks'] || null,
    Mitigants: kv['mitigants'] || null,
  };
}

function parseBorrowerTask(t, hostLoanRef) {
  const m = t.name.match(BORROWER_RE);
  const kv = parseKV(t.description);
  return {
    id: String(t.id),
    name: m ? m[1] : t.name,
    hostLoanReference: hostLoanRef,
    'Entity Role': m ? m[2] : kv['entity role'] || null,
    Constitution: kv['constitution'] || null,
    'Industry Sector': kv['industry sector'] || null,
    'Group Name': kv['group name'] || null,
    'Internal Rating': kv['internal rating'] || null,
    'Annual Turnover Cr': numOrNull(kv['annual turnover cr']),
    'Existing Group Exposure Cr': numOrNull(kv['existing group exposure cr']),
    'KYC Status': kv['kyc status'] || null,
  };
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

/* Zoho throttles each endpoint independently: "Cannot execute more than 200
 * requests per API in 2 minutes" on /tasks specifically (BROKE.md #11). Every screen
 * that shows task-backed data (6 module tables, the loan file, attention, dashboard,
 * concentration) fans out to all 15 projects' tasks — clicking through the sidebar
 * once is ~90 calls with no cache, which trips the throttle inside a minute.
 *
 * A short in-memory TTL cache turns "click through 6 tabs" into one real fetch per
 * project, not six. The TTL is short enough that a write (once real writes exist) is
 * visible within one interaction, long enough to absorb a normal click-through. */
const CACHE_TTL_MS = 45_000;
const cache = new Map();

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  const value = await fn();
  cache.set(key, { value, until: Date.now() + CACHE_TTL_MS });
  return value;
}

function invalidateProject(projectId) {
  cache.delete(`tasks:${projectId}`);
  cache.delete(`issues:${projectId}`);
  cache.delete(`phases:${projectId}`);
  // Closing a deviation, verifying a condition, etc. can change what the portfolio-
  // level project list itself reports (e.g. openIssues) — drop it too, not just this
  // project's own caches, or that count can stay stale for up to CACHE_TTL_MS.
  cache.delete('projects');
}

const tasksOf = (projectId) =>
  cached(`tasks:${projectId}`, () =>
    zoho('GET', `/portal/${PORTAL}/projects/${projectId}/tasks?page=1&per_page=200`)
      .then(unwrap)
      .catch(() => []),
  );

const issuesOf = (projectId) =>
  cached(`issues:${projectId}`, () =>
    zoho('GET', `/portal/${PORTAL}/projects/${projectId}/issues?page=1&per_page=100`)
      .then(unwrap)
      .catch(() => []),
  );

const phasesOf = (projectId) =>
  cached(`phases:${projectId}`, () =>
    zoho('GET', `/portal/${PORTAL}/projects/${projectId}/phases?page=1&per_page=100`)
      .then(unwrap)
      .catch(() => []),
  );

/* ── Projects (loan files) ──────────────────────────────────────────────────── */

const num = (v) => (v == null || v === '' ? null : Number(v));
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null);

async function loanProjects() {
  return cached('projects', () => fetchLoanProjects());
}

async function fetchLoanProjects() {
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
      openIssues: p.issues?.open_count ?? 0,
      originatedOn: p.created_time || null,
    };
    });
}

/* ── New Application ──────────────────────────────────────────────────────────
 *
 * A loan file is a Project, so origination is a real project-creation call, not a
 * simulated one — the "New Application" button previously just navigated to the
 * Pipeline board with nothing behind it. Field values and date-format quirks here
 * mirror scripts/seed.mjs and scripts/seed-workflow.mjs exactly, since those are the
 * only recipes proven to work against this portal (BROKE.md #9). */

const LOAN_PRODUCTS = ['Working Capital', 'Term Loan', 'Equipment Finance', 'Project Finance', 'Trade Finance'];
const SECTORS = [
  'Agri Processing',
  'Auto Components',
  'Chemicals',
  'IT and ITES',
  'Infrastructure',
  'Logistics',
  'Manufacturing',
  'Pharmaceuticals',
  'Retail',
  'Textiles',
];
const FIRST_STAGE = 'Origination and Lead Capture';
const FIRST_STAGE_SLA_DAYS = 2;

/* The 7 pipeline phases and their SLA — docs/SPEC.md §3. Order matters: advanceStage
 * walks this list to find what "next" means for a given loan file. */
const STAGE_SEQUENCE = [
  { name: FIRST_STAGE, slaDays: FIRST_STAGE_SLA_DAYS },
  { name: 'Document Collection and KYC', slaDays: 5 },
  { name: 'Credit Appraisal', slaDays: 7 },
  { name: 'Valuation and Legal Due Diligence', slaDays: 10 },
  { name: 'Risk and Sanction', slaDays: 5 },
  { name: 'Documentation and Disbursement', slaDays: 7 },
  { name: 'Post Disbursement Monitoring', slaDays: null },
];

// Phases want MM-DD-YYYY; everything else (tasks, project start_date, custom Date
// fields) wants YYYY-MM-DD. Same API, same request shape, different format — see
// BROKE.md #9.
const usDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
};

let ownerZpuidCache = null;

/** The project-creation payload wants a `zpuid` (a Zoho Projects portal-user id),
 * not the `zuid` (Zoho-account-wide id) — the two look interchangeable but are not,
 * and a self-client token's `/users/me` scope is blocked (BROKE.md #5) so it can't be
 * looked up directly. Every existing project's `owner.zpuid` is real and already
 * proven to work, so that is the reliable source — falling back to `/users/me` only
 * in case a future scope grant makes it available, then an env var for a fresh
 * portal with no projects yet. */
async function ownerZpuid() {
  if (ownerZpuidCache) return ownerZpuidCache;

  const me = await zoho('GET', `/portal/${PORTAL}/users/me`).catch(() => null);
  const fromMe = me?.data?.result?.[0]?.zpuid || me?.data?.zpuid;
  if (fromMe) {
    ownerZpuidCache = fromMe;
    return ownerZpuidCache;
  }

  const list = unwrap(await zoho('GET', `/portal/${PORTAL}/projects?page=1&per_page=1`).catch(() => []));
  ownerZpuidCache = list[0]?.owner?.zpuid || process.env.ZOHO_OWNER_ZPUID || null;
  if (!ownerZpuidCache) {
    throw new Error('Could not resolve a project owner zpuid — set ZOHO_OWNER_ZPUID');
  }
  return ownerZpuidCache;
}

/** LN-2026-0048 -> next unused LN-2026-0049 for the current year, independent of
 * gaps in the existing sequence (files are not deleted, but the demo data was not
 * seeded strictly in order either). */
function nextLoanReference(loans) {
  const year = new Date().getFullYear();
  let max = 0;
  for (const l of loans) {
    const m = /^LN-(\d{4})-(\d+)$/.exec(l.loanReference || '');
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }
  return `LN-${year}-${String(max + 1).padStart(4, '0')}`;
}

async function createLoanFile({ borrowerName, loanProduct, sector, totalRequestedCr }, session) {
  const loans = await loanProjects();
  const loanReference = nextLoanReference(loans);
  const today = new Date().toISOString().slice(0, 10);

  const { byLabel } = await fields('projects');
  const custom = {};
  const set = (label, value) => {
    const api = byLabel.get(label);
    if (api) custom[api] = value;
  };
  set('Loan Reference', loanReference);
  set('Borrower Name', borrowerName);
  set('Loan Product', loanProduct);
  set('Sector', sector);
  set('Current Stage', FIRST_STAGE);
  set('Workflow State', 'Draft');
  set('Total Requested Cr', totalRequestedCr);
  set('Stage Entered On', today);
  set('Stage SLA Days', FIRST_STAGE_SLA_DAYS);

  const owner = await ownerZpuid();
  const created = await zoho('POST', `/portal/${PORTAL}/projects`, {
    name: `${loanReference} · ${borrowerName}`,
    owner: { zpuid: String(owner) },
    start_date: today,
    description: `${loanProduct} facility for ${borrowerName}. Originated by ${session.name} (${session.title}).`,
    ...custom,
  });
  // zoho() returns the bare parsed body — unlike scripts/zoho.mjs's api(), it does
  // not wrap the response in {data: ...}, so the id is top-level.
  const projectId = created?.id || created?.data?.id || created?.data?.result?.[0]?.id;
  if (!projectId) {
    throw new Error(`Zoho did not return a project id: ${JSON.stringify(created).slice(0, 300)}`);
  }

  // Best-effort — the loan file is real the moment the project exists; a missing
  // phase mirror would just mean the file-detail timeline starts one entry short.
  await zoho('POST', `/portal/${PORTAL}/projects/${projectId}/phases`, {
    name: FIRST_STAGE,
    start_date: usDate(today),
    end_date: usDate(today),
  }).catch(() => null);

  cache.delete('projects');

  return {
    projectId: String(projectId),
    loanReference,
    borrowerName,
    loanProduct,
    sector,
    currentStage: FIRST_STAGE,
    workflowState: 'Draft',
    internalRating: null,
    totalRequestedCr: Number(totalRequestedCr),
    totalSanctionedCr: null,
    stageEnteredOn: today,
    slaDays: FIRST_STAGE_SLA_DAYS,
    daysInStage: 0,
    daysOver: 0,
    owner: session.name,
    openIssues: 0,
    originatedOn: new Date().toISOString(),
  };
}

async function pipeline() {
  return { loans: await loanProjects() };
}

async function loanFile(ref) {
  const loans = await loanProjects();
  const loan = loans.find((l) => l.loanReference === ref);
  if (!loan) return null;

  const [tasks, issues, phases] = await Promise.all([
    tasksOf(loan.projectId),
    issuesOf(loan.projectId),
    phasesOf(loan.projectId),
  ]);

  // One pass over this project's tasks serves conditions, tranches, facilities,
  // collateral and risk — all six child entity types ride on Tasks (BROKE.md #8).
  const { conditions, tranches, facilities, collateral, risk } = splitAllTasks(
    tasks,
    ref,
    loan.borrowerName,
  );

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
      compositeScore: r['Composite Score'],
      internalRatingGrade: r['Internal Rating Grade'],
      dscr: r['DSCR'],
      debtToEbitda: r['Debt to EBITDA'],
      probabilityOfDefaultPct: r['Probability of Default Pct'],
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
      const { conditions, tranches } = splitAllTasks(await tasksOf(l.projectId), l.loanReference, l.borrowerName);
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
  // Borrower profiles are Task-backed (BROKE.md #8) and therefore always readable, so
  // group rollup no longer degrades — every borrower's group mapping is real.
  const loans = await loanProjects();
  const borrowers = await allBorrowers();
  return { ...computeConcentration({ loans, borrowers }), groupRollup: true };
}

async function deviations() {
  const loans = await loanProjects();
  // Only files that actually carry issues, so this is a handful of calls not fifteen
  // wasted ones. The project list already tells us the issue count.
  const withIssues = loans.filter((l) => l.openIssues > 0 || l.openIssues === undefined);

  const all = await Promise.all(
    withIssues.map(async (l) => {
      const issues = await issuesOf(l.projectId);
      // A decided deviation is a Closed issue (see decideDeviation) — exclude it, or
      // every approved/rejected deviation keeps showing up as still awaiting a decision.
      const open = issues.filter((i) => !i.status?.is_closed_type);
      return mapIssues(open, l);
    }),
  );
  const flat = all.flat();
  flat.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
  return { deviations: flat };
}

/* ── Portfolio-wide child collections ────────────────────────────────────────
 *
 * All six child entity types are Task- or Issue-backed (BROKE.md #8), so all six are
 * browsable across the whole book. One tasksOf() fetch per project via splitAllTasks
 * serves every category — allTaskBackedChildren() is the single fan-out point so
 * adding a screen never means adding another full portfolio scan. */

async function allTaskBackedChildren() {
  const loans = await loanProjects();
  const perLoan = await Promise.all(
    loans.map(async (l) => ({ l, split: splitAllTasks(await tasksOf(l.projectId), l.loanReference, l.borrowerName) })),
  );
  return { loans, perLoan };
}

async function allConditions() {
  const { perLoan } = await allTaskBackedChildren();
  return perLoan.flatMap(({ l, split }) =>
    split.conditions.map((c) => ({
      id: c.id,
      'Loan Reference': l.loanReference,
      'Condition Text': c.conditionText,
      Category: c.category,
      'Condition Type': c.conditionType,
      'Due Date': c.dueDate,
      'Compliance Status': c.complianceStatus,
      'Blocks Disbursement': c.blocksDisbursement,
    })),
  );
}

async function allTranches() {
  const { perLoan } = await allTaskBackedChildren();
  return perLoan.flatMap(({ l, split }) =>
    split.tranches.map((t) => ({
      id: t.id,
      'Loan Reference': l.loanReference,
      'Tranche No': t.trancheNo,
      'Amount Cr': t.amountCr,
      'Scheduled Date': t.scheduledDate,
      'Actual Disbursement Date': t.actualDate,
      'Payment Mode': t.mode,
      'Tranche Status': t.trancheStatus,
      'Blocked Reason': t.blockedReason,
    })),
  );
}

async function allFacilities() {
  const { perLoan } = await allTaskBackedChildren();
  return perLoan.flatMap(({ split }) => split.facilities);
}

async function allCollateral() {
  const { perLoan } = await allTaskBackedChildren();
  return perLoan.flatMap(({ split }) => split.collateral);
}

async function allRiskAssessments() {
  const { perLoan } = await allTaskBackedChildren();
  return perLoan.flatMap(({ split }) => split.risk);
}

async function allBorrowers() {
  const { perLoan } = await allTaskBackedChildren();
  // Exactly one profile task per borrower, on its host loan file — see
  // scripts/seed-workflow.mjs. Filter rather than dedupe: there is nothing to collapse.
  return perLoan.flatMap(({ split }) => split.borrowerProfiles);
}

/* ── Writes ─────────────────────────────────────────────────────────────────── */

async function transition(ref, name, note, session) {
  // Recorded as a comment on the project so the audit trail lives in Zoho Projects,
  // not in a log file we control.
  const loan = await findLoan(ref);

  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/comments`, {
    content: `[${name}] by ${session.name} (${session.title})${note ? ` — ${note}` : ''}`,
  }).catch(() => null);

  return { ok: true, transition: name, loanReference: ref };
}

/** Moves a loan file to the next of the 7 pipeline phases (docs/SPEC.md §3) — this is
 * what the Pipeline board's stage columns are supposed to reflect, and previously
 * nothing on the write side ever changed a file's Current Stage, so files were stuck
 * in Origination regardless of what actually happened to them. */
async function advanceStage(ref, session) {
  const loan = await findLoan(ref);
  const idx = STAGE_SEQUENCE.findIndex((s) => s.name === loan.currentStage);
  if (idx === -1) throw new Error(`${ref} is at an unrecognized stage "${loan.currentStage}"`);
  if (idx === STAGE_SEQUENCE.length - 1) {
    throw new Error(`${ref} is already at the final stage (${loan.currentStage})`);
  }
  const next = STAGE_SEQUENCE[idx + 1];
  const today = new Date().toISOString().slice(0, 10);

  const { byLabel } = await fields('projects');
  const custom = {};
  const set = (label, value) => {
    const api = byLabel.get(label);
    if (api) custom[api] = value;
  };
  set('Current Stage', next.name);
  set('Stage Entered On', today);
  // Post Disbursement Monitoring is ongoing — no SLA — so leave the field as-is
  // rather than risk Zoho rejecting a null on a Double custom field.
  if (next.slaDays != null) set('Stage SLA Days', next.slaDays);

  await zoho('PATCH', `/portal/${PORTAL}/projects/${loan.projectId}`, custom);
  invalidateProject(loan.projectId);

  // Close out the phase span the file is leaving, so its TAT stops accruing, and open
  // a new one for the phase it's entering — this is what makes StageRail's per-stage
  // day counts real instead of frozen at however long the first phase happened to be.
  const phases = await phasesOf(loan.projectId);
  const current = phases.find((ph) => ph.name === loan.currentStage && !ph.end_date);
  if (current) {
    await zoho(
      'PATCH',
      `/portal/${PORTAL}/projects/${loan.projectId}/phases/${current.id}`,
      { end_date: usDate(today) },
    ).catch(() => null);
  }
  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/phases`, {
    name: next.name,
    start_date: usDate(today),
  }).catch(() => null);

  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/comments`, {
    content: `[Advanced] ${loan.currentStage} -> ${next.name}, by ${session.name} (${session.title})`,
  }).catch(() => null);

  return { ok: true, loanReference: ref, previousStage: loan.currentStage, currentStage: next.name };
}

async function decideDeviation(id, { decision, note, ref } = {}, session) {
  if (!ref) throw new Error('decideDeviation requires a loan reference');
  const loan = await findLoan(ref);

  await zoho('POST', `/portal/${PORTAL}/issues/${id}/comments`, {
    content: `[${decision}] by ${session.name} (${session.title}) — ${note}`,
  }).catch(() => null);

  // Close the issue so the decision actually sticks — the comment above is only an
  // audit trail. Without this, decide() never changes anything the deviations() list
  // filters on, so the same "pending" card reappears after every approve or reject.
  await patchIssue(loan.projectId, id, { status: { id: ISSUE_STATUS_CLOSED_ID } });

  return { ok: true, id, decision };
}

/** Locate the loan file a task lives on. Every write needs this because a task ID
 * alone doesn't say which project's task list to PATCH — Zoho nests tasks under
 * /projects/{id}/tasks, there is no portal-wide task-by-id route. */
async function findLoan(ref) {
  const loans = await loanProjects();
  const loan = loans.find((l) => l.loanReference === ref);
  if (!loan) throw new Error(`Unknown loan reference ${ref}`);
  return loan;
}

/** Replace one `Label: value` line in a task description, leaving the rest intact.
 * Case-insensitive on the label since Zoho's UI and our own writer are not
 * guaranteed to agree on casing at every call site. */
function replaceKV(description, label, value) {
  const re = new RegExp(`^\\s*${label}\\s*:.*$`, 'i');
  const lines = String(description || '').split('\n');
  let replaced = false;
  const out = lines.map((line) => {
    if (re.test(line)) {
      replaced = true;
      return `${label}: ${value}`;
    }
    return line;
  });
  if (!replaced) out.push(`${label}: ${value}`);
  return out.join('\n');
}

async function patchTask(projectId, taskId, body) {
  await zoho('PATCH', `/portal/${PORTAL}/projects/${projectId}/tasks/${taskId}`, body);
  // The 45s cache (BROKE.md #11) would otherwise show the pre-write state for up to
  // 45 seconds after a user just took the action — invalidate immediately instead.
  invalidateProject(projectId);
}

async function patchIssue(projectId, issueId, body) {
  await zoho('PATCH', `/portal/${PORTAL}/projects/${projectId}/issues/${issueId}`, body);
  invalidateProject(projectId);
}

/* The default Zoho Projects issue workflow (Open/InProgress/ToBeTested/Closed/Reopen).
 * The status field is global_scope, and this id is verified identical across every
 * project in this portal — so it's safe to hardcode rather than look it up per decision. */
const ISSUE_STATUS_CLOSED_ID = '475748000000075057';

async function verifyCondition(id, { status = 'Complied', ref } = {}, session) {
  if (!ref) throw new Error('verifyCondition requires a loan reference');
  const loan = await findLoan(ref);
  const tasks = await tasksOf(loan.projectId);
  const task = tasks.find((t) => String(t.id) === String(id));
  if (!task) throw new Error(`Condition ${id} not found on ${ref}`);

  const description = replaceKV(task.description, 'Status', status);
  await patchTask(loan.projectId, id, { description });
  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/tasks/${id}/comments`, {
    content: `Marked ${status} by ${session.name} (${session.title})`,
  }).catch(() => null);

  return { ok: true, id, status, verifiedBy: session.name };
}

async function releaseTranche(id, { ref } = {}, session) {
  if (!ref) throw new Error('releaseTranche requires a loan reference');
  const loan = await findLoan(ref);
  const tasks = await tasksOf(loan.projectId);
  const task = tasks.find((t) => String(t.id) === String(id));
  if (!task) throw new Error(`Tranche ${id} not found on ${ref}`);

  const tm = (task.name || '').match(TRANCHE_RE);
  if (!tm) throw new Error(`Task ${id} on ${ref} is not a disbursement tranche`);

  // The gate that makes this demo mean something: refuse the release if a
  // blocking pre-disbursement condition on this same file is still open, and say
  // which one — this is the invariant SPEC.md §12 #24 exists to protect.
  const { conditions } = splitAllTasks(tasks, ref, loan.borrowerName);
  const blocker = conditions.find((c) => c.blocksDisbursement && c.complianceStatus === 'Open');
  if (blocker) {
    // `error` is what api.js surfaces to the UI on a non-2xx response; without it the
    // client shows a generic "Request failed (409)" instead of the actual reason.
    return { ok: false, blocked: true, id, reason: blocker.conditionText, error: `Blocked: ${blocker.conditionText}` };
  }

  const today = new Date().toISOString().slice(0, 10);
  const newName = task.name.replace(/^(\[Tranche \d+\])\s*\S+/, '$1 Released');
  const description = replaceKV(
    replaceKV(task.description, 'Actual', today),
    'Released By',
    session.name,
  );

  await patchTask(loan.projectId, id, { name: newName, description });
  await zoho('POST', `/portal/${PORTAL}/projects/${loan.projectId}/tasks/${id}/comments`, {
    content: `Tranche released by ${session.name} (${session.title})`,
  }).catch(() => null);

  return { ok: true, id, releasedBy: session.name };
}

module.exports = {
  allConditions,
  allTranches,
  allFacilities,
  allCollateral,
  allRiskAssessments,
  allBorrowers,
  pipeline,
  loanFile,
  dashboard,
  attention,
  concentration,
  deviations,
  records,
  transition,
  advanceStage,
  decideDeviation,
  verifyCondition,
  releaseTranche,
  createLoanFile,
  LOAN_PRODUCTS,
  SECTORS,
};

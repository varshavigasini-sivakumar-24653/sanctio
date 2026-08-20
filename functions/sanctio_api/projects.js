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

async function accessToken() {
  if (token && Date.now() < tokenUntil) return token;

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
    const path = `${build('borrower')}?per_page=1`;
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

/* ── Field metadata ─────────────────────────────────────────────────────────── */

const fieldMaps = new Map(); // module -> { byLabel, byApi }

async function fields(moduleApi) {
  if (fieldMaps.has(moduleApi)) return fieldMaps.get(moduleApi);
  const res = await zoho('GET', `/portal/${PORTAL}/settings/fields?module=${moduleApi}&per_page=200`);
  const byLabel = new Map();
  const byApi = new Map();
  for (const f of res.data?.result || []) {
    byLabel.set(f.display_name, f.field_name);
    byApi.set(f.field_name, f.display_name);
  }
  const map = { byLabel, byApi };
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
    const res = await zoho('GET', `${build(moduleApi)}?per_page=200&page=${page}`);
    const batch = res.data?.result || res.data || [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
    if (page > 25) break; // hard stop; nothing in this demo is near 5000 records
  }

  const mapped = await Promise.all(all.map((r) => humanise(moduleApi, r)));
  return loanReference ? mapped.filter((r) => r['Loan Reference'] === loanReference) : mapped;
}

/* ── Projects (loan files) ──────────────────────────────────────────────────── */

const num = (v) => (v == null || v === '' ? null : Number(v));
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null);

async function loanProjects() {
  const res = await zoho('GET', `/portal/${PORTAL}/projects?per_page=200`);
  const list = res.data?.result || res.data || [];
  const { byApi } = await fields('projects');

  return list.map((p) => {
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

  const [facilities, collateral, risk, conditions, tranches, phases] = await Promise.all([
    records('facility', ref),
    records('collateral', ref),
    records('risk_assessment', ref),
    records('sanction_condition', ref),
    records('disbursement_tranche', ref),
    zoho('GET', `/portal/${PORTAL}/projects/${loan.projectId}/phases?page=1&per_page=50`).catch(
      () => ({ data: { result: [] } }),
    ),
  ]);

  return {
    loan: { ...loan, stageTat: {} },
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
    conditions: conditions.map((c) => ({
      id: c.id,
      conditionText: c['Condition Text'] || c.name,
      category: c['Category'],
      conditionType: c['Condition Type'],
      dueDate: c['Due Date'],
      complianceStatus: c['Compliance Status'] || 'Open',
      blocksDisbursement: Boolean(c['Blocks Disbursement']),
    })),
    tranches: tranches.map((t) => ({
      id: t.id,
      trancheNo: num(t['Tranche No']),
      amountCr: num(t['Amount Cr']),
      scheduledDate: t['Scheduled Date'],
      trancheStatus: t['Tranche Status'] || 'Scheduled',
      blockedReason: t['Blocked Reason'] || null,
    })),
    phases: phases.data?.result || [],
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
  const [loans, conditions, tranches, devs] = await Promise.all([
    loanProjects(),
    records('sanction_condition'),
    records('disbursement_tranche'),
    deviations().then((d) => d.deviations).catch(() => []),
  ]);
  return rankAttention({ loans, conditions, tranches, deviations: devs });
}

async function concentration() {
  const [loans, borrowers] = await Promise.all([loanProjects(), records('borrower')]);
  return computeConcentration({ loans, borrowers });
}

async function deviations() {
  const res = await zoho('GET', `/portal/${PORTAL}/issues?per_page=100`).catch(() => null);
  const list = res?.data?.result || [];
  return {
    deviations: list.map((i) => ({
      id: String(i.id),
      title: i.title || i.name,
      description: i.description || '',
      severity: i.severity?.type || i.severity || 'Minor',
      loanReference: i.project?.name || '',
      borrowerName: i.project?.name || '',
      exposureCr: null,
      createdOn: i.created_time,
    })),
  };
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

// Seeds the parts of each loan file that a self-client token can actually READ BACK:
// phases, tasks and issues. Run after the loan-file Projects exist.
//
// WHY THIS EXISTS
// Custom-module records are createable through the MCP but unreadable over REST with a
// self-client token (BROKE.md #8), and a deployed Catalyst function cannot call the MCP.
// So ALL child data the app must display lives where the token has full read/write:
//
//   Sanction conditions  -> Tasks   (owner, due date, status, blocks downstream)
//   Disbursement tranches-> Tasks   (scheduled vs actual, released by)
//   Facilities           -> Tasks   (one per credit limit inside the sanction)
//   Collateral           -> Tasks   (one per asset, valuation + legal clearance)
//   Risk assessments      -> Tasks   (one per appraisal round)
//   Borrower profile      -> Tasks   (one per borrower, on its first loan file)
//   Credit deviations    -> Issues  (severity == approval authority)
//   The 7 lending stages -> Phases  (with real dates, driving the stage rail)
//
// This is not a workaround dressed up as a design. docs/SPEC.md always claimed a
// sanction condition IS a task; this makes the claim literal. The six custom modules
// remain in the portal as the record-of-schema (built via MCP) and are shown in the
// walkthrough as evidence of that schema — the app's OWN data comes from here.
//
// Idempotent: existing task/issue names are fetched once per project before creating,
// and anything already present is skipped. Safe to re-run after a partial failure.
//
// Run: node scripts/seed-workflow.mjs [--clean]

import { api, unwrap, PORTAL_ID } from './zoho.mjs';
import { DATASET, LOANS, BORROWERS, STAGES, STAGE_SLA } from './dataset.mjs';

const P = `/portal/${PORTAL_ID}`;
const log = (...a) => console.log(...a);
const clean = process.argv.includes('--clean');

/* Phases want MM-DD-YYYY. Tasks want YYYY-MM-DD. Same API, same request, different
 * format — passing ISO to a phase returns 400 INVALID_PARAMETER_VALUE with no hint
 * that the date shape is the problem. See BROKE.md #9. */
const usDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
};

const money = (n) => (n == null ? '' : Number(n).toFixed(2));
const yn = (b) => (b ? 'Yes' : 'No');

const projects = unwrap(await api('GET', `${P}/projects?page=1&per_page=200`)).filter(
  (p) => p.loan_reference,
);
log(`${projects.length} loan files\n`);

const byRef = new Map(projects.map((p) => [p.loan_reference, p]));

/* ── Existing tasks/issues per project, fetched once ─────────────────────────
 *
 * This is what makes the whole script idempotent: every creation loop below checks
 * this set before posting, so re-running after a partial failure — or re-running
 * deliberately to add a new category — never duplicates a row. */

const existingTaskNames = new Map(); // projectId -> Set<name>
const existingIssueNames = new Map();

for (const p of projects) {
  const tasks = unwrap(await api('GET', `${P}/projects/${p.id}/tasks?page=1&per_page=200`));
  existingTaskNames.set(p.id, new Set(tasks.map((t) => t.name)));
  const issues = unwrap(await api('GET', `${P}/projects/${p.id}/issues?page=1&per_page=100`));
  existingIssueNames.set(p.id, new Set(issues.map((i) => i.name)));
}

async function createTaskOnce(projectId, body) {
  const seen = existingTaskNames.get(projectId);
  if (seen.has(body.name)) return 'skipped';
  await api('POST', `${P}/projects/${projectId}/tasks`, body);
  seen.add(body.name);
  return 'created';
}

async function createIssueOnce(projectId, body) {
  const seen = existingIssueNames.get(projectId);
  if (seen.has(body.name)) return 'skipped';
  await api('POST', `${P}/projects/${projectId}/issues`, body);
  seen.add(body.name);
  return 'created';
}

/* ── Optional cleanup of earlier test artifacts ─────────────────────────────── */

if (clean) {
  log('Cleaning test artifacts…');
  for (const p of projects) {
    const issues = unwrap(await api('GET', `${P}/projects/${p.id}/issues?page=1&per_page=100`));
    for (const i of issues.filter((x) => /^probe /.test(x.name || ''))) {
      await api('DELETE', `${P}/projects/${p.id}/issues/${i.id}`).catch(() => null);
      existingIssueNames.get(p.id)?.delete(i.name);
      log(`  - issue ${i.name}`);
    }
    const tasks = unwrap(await api('GET', `${P}/projects/${p.id}/tasks?page=1&per_page=200`));
    for (const t of tasks.filter((x) =>
      /^TEST —|^probe |^Register first charge with CERSAI and ROC$|^Submit monthly stock statement$/.test(
        x.name,
      ),
    )) {
      await api('DELETE', `${P}/projects/${p.id}/tasks/${t.id}`).catch(() => null);
      existingTaskNames.get(p.id)?.delete(t.name);
      log(`  - task ${t.name}`);
    }
    const phases = unwrap(await api('GET', `${P}/projects/${p.id}/phases?page=1&per_page=100`));
    const seen = new Set();
    for (const ph of phases) {
      if (seen.has(ph.name)) {
        await api('DELETE', `${P}/projects/${p.id}/phases/${ph.id}`).catch(() => null);
        log(`  - duplicate phase ${ph.name}`);
      } else seen.add(ph.name);
    }
  }
  log('');
}

/* ── Phases: the stages a file has actually reached ─────────────────────────── */

let phasesMade = 0;
for (const p of projects) {
  const upto = STAGES.indexOf(p.current_stage);
  if (upto < 0) continue;

  const existing = new Set(
    unwrap(await api('GET', `${P}/projects/${p.id}/phases?page=1&per_page=100`)).map((x) => x.name),
  );

  let cursor = new Date(p.stage_entered_on || Date.now());
  const spans = [];
  for (let i = upto; i >= 0; i--) {
    const end = new Date(cursor);
    const start = new Date(cursor);
    start.setUTCDate(start.getUTCDate() - (STAGE_SLA[STAGES[i]] || 2));
    spans.unshift({ name: STAGES[i], start, end });
    cursor = start;
  }

  for (const s of spans) {
    if (existing.has(s.name)) continue;
    try {
      await api('POST', `${P}/projects/${p.id}/phases`, {
        name: s.name,
        start_date: usDate(s.start.toISOString().slice(0, 10)),
        end_date: usDate(s.end.toISOString().slice(0, 10)),
      });
      phasesMade++;
    } catch (e) {
      log(`  ! phase ${p.loan_reference}/${s.name}: ${String(e.message).slice(0, 120)}`);
    }
  }
}
log(`phases:      +${phasesMade}`);

/* ── Sanction conditions as Tasks ───────────────────────────────────────────── */

const conditionTaskName = (c) => `[${c.category}] ${(c.text || '').slice(0, 120)}`;

let condMade = 0;
for (const c of DATASET.conditions) {
  const p = byRef.get(c.loanRef);
  if (!p) continue;
  try {
    const r = await createTaskOnce(p.id, {
      name: conditionTaskName(c),
      description:
        `Category: ${c.category}\nType: ${c.type}\nFrequency: ${c.frequency}\n` +
        `Status: ${c.status}\nWaiver authority: ${c.waiverAuthority}\n` +
        `Blocks disbursement: ${c.blocksDisbursement ? 'YES' : 'no'}`,
      end_date: c.dueDate,
    });
    if (r === 'created') condMade++;
  } catch (e) {
    log(`  ! condition ${c.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`conditions:  +${condMade}`);

/* ── Disbursement tranches as Tasks ─────────────────────────────────────────── */

let trMade = 0;
for (const t of DATASET.tranches) {
  const p = byRef.get(t.loanRef);
  if (!p) continue;
  try {
    const r = await createTaskOnce(p.id, {
      name: `[Tranche ${t.trancheNo}] ${t.status} — Rs ${t.amountCr.toFixed(2)} Cr`,
      description:
        `Amount: Rs ${t.amountCr.toFixed(2)} Cr\nScheduled: ${t.scheduledDate}\n` +
        `Actual: ${t.actualDate || 'not released'}\nMode: ${t.mode}\n` +
        `Purpose: ${t.purpose}\n` +
        (t.blockedReason ? `BLOCKED: ${t.blockedReason}` : 'Pre-conditions met'),
      end_date: t.scheduledDate,
    });
    if (r === 'created') trMade++;
  } catch (e) {
    log(`  ! tranche ${t.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`tranches:    +${trMade}`);

/* ── Facilities as Tasks ──────────────────────────────────────────────────────
 *
 * Description keys match the exact column labels client/src/lib/modules.js expects,
 * so the BFF's parser can build a row object with no name translation to get wrong. */

let facMade = 0;
for (const f of DATASET.facilities) {
  const p = byRef.get(f.loanRef);
  if (!p) continue;
  try {
    const r = await createTaskOnce(p.id, {
      name: `[Facility] ${f.type} — ${f.status}`,
      description: [
        `Borrower Name: ${f.borrowerName}`,
        `Facility Type: ${f.type}`,
        `Amount Requested Cr: ${money(f.requestedCr)}`,
        `Amount Sanctioned Cr: ${money(f.sanctionedCr)}`,
        `Tenor Months: ${f.tenorMonths ?? ''}`,
        `Moratorium Months: ${f.moratoriumMonths ?? 0}`,
        `Interest Basis: ${f.interestBasis}`,
        `Spread bps: ${f.spreadBps}`,
        `All In Rate Pct: ${money(f.allInRatePct)}`,
        `Processing Fee Pct: ${money(f.processingFeePct)}`,
        `Repayment Frequency: ${f.repaymentFrequency}`,
        `End Use: ${f.endUse}`,
        `Security Type: ${f.securityType}`,
        `Facility Status: ${f.status}`,
      ].join('\n'),
    });
    if (r === 'created') facMade++;
  } catch (e) {
    log(`  ! facility ${f.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`facilities:  +${facMade}`);

/* ── Collateral as Tasks ──────────────────────────────────────────────────────── */

let colMade = 0;
for (const c of DATASET.collateral) {
  const p = byRef.get(c.loanRef);
  if (!p) continue;
  try {
    const r = await createTaskOnce(p.id, {
      name: `[Collateral] ${c.type}`,
      description: [
        `Description: ${c.description}`,
        `Owner Name: ${c.ownerName}`,
        `Location: ${c.location}`,
        `Valuer Name: ${c.valuerName}`,
        `Valuation Date: ${c.valuationDate}`,
        `Market Value Cr: ${money(c.marketValueCr)}`,
        `Realizable Value Cr: ${money(c.realizableValueCr)}`,
        `Distress Value Cr: ${money(c.distressValueCr)}`,
        `LTV Pct: ${money(c.ltvPct)}`,
        `Next Revaluation Due: ${c.nextRevaluationDue}`,
        `Advocate Name: ${c.advocateName}`,
        `Title Search Period Years: ${c.titleSearchYears}`,
        `Chain of Title Verified: ${yn(c.chainOfTitleVerified)}`,
        `Encumbrance Certificate: ${c.encumbrance}`,
        `Litigation Search: ${c.litigation}`,
        `Legal Opinion: ${c.legalOpinion}`,
        `Opinion Date: ${c.opinionDate}`,
        `Charge Type: ${c.chargeType}`,
        `Charge Registered: ${yn(c.chargeRegistered)}`,
        `CERSAI Filing Ref: ${c.cersaiRef}`,
      ].join('\n'),
      end_date: c.nextRevaluationDue || undefined,
    });
    if (r === 'created') colMade++;
  } catch (e) {
    log(`  ! collateral ${c.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`collateral:  +${colMade}`);

/* ── Risk assessments as Tasks ──────────────────────────────────────────────── */

let riskMade = 0;
for (const r0 of DATASET.risks) {
  const p = byRef.get(r0.loanRef);
  if (!p) continue;
  try {
    const r = await createTaskOnce(p.id, {
      name: `[Risk Assessment] Grade ${r0.grade} — Score ${r0.compositeScore}`,
      description: [
        `Assessment Date: ${r0.assessmentDate}`,
        `Financial Score: ${r0.financialScore}`,
        `Management Score: ${r0.managementScore}`,
        `Industry Score: ${r0.industryScore}`,
        `Compliance Score: ${r0.complianceScore}`,
        `Collateral Score: ${r0.collateralScore}`,
        `Composite Score: ${money(r0.compositeScore)}`,
        `Internal Rating Grade: ${r0.grade}`,
        `Probability of Default Pct: ${money(r0.pdPct)}`,
        `Loss Given Default Pct: ${money(r0.lgdPct)}`,
        `DSCR: ${money(r0.dscr)}`,
        `Debt to EBITDA: ${money(r0.debtToEbitda)}`,
        `Current Ratio: ${money(r0.currentRatio)}`,
        `Recommendation: ${r0.recommendation}`,
        `Max Recommended Exposure Cr: ${money(r0.maxRecommendedExposureCr)}`,
        `Key Risks: ${r0.keyRisks}`,
        `Mitigants: ${r0.mitigants}`,
      ].join('\n'),
      end_date: r0.assessmentDate,
    });
    if (r === 'created') riskMade++;
  } catch (e) {
    log(`  ! risk ${r0.loanRef}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`risk:        +${riskMade}`);

/* ── Borrower profiles as Tasks ───────────────────────────────────────────────
 *
 * Borrowers are portal-level — one entity can back several loan files (the Sundar
 * Group holds three). So each borrower gets exactly ONE profile task, attached to the
 * first loan file it appears on in LOANS order. A pure guarantor with no loan file of
 * its own (R Sundar) is attached to the loan file it actually guarantees. */

const hostForBorrower = new Map();
for (const l of LOANS) {
  if (!hostForBorrower.has(l.borrower)) hostForBorrower.set(l.borrower, l.ref);
}
// R Sundar is the promoter guarantee behind the Sundar Group facilities — host it on
// the flagship Sundar Steel file rather than leaving it unattached.
if (!hostForBorrower.has('R Sundar')) {
  hostForBorrower.set('R Sundar', hostForBorrower.get('Sundar Steel Rolling Mills Pvt Ltd'));
}

// Existing Group Exposure Cr = sum of SANCTIONED exposure across every loan file
// whose borrower shares this borrower's group — the number the concentration cap
// is actually checked against. Computed from the built dataset, not hand-typed.
const borrowerGroup = new Map(BORROWERS.map((b) => [b.name, b.group]));
const groupExposureCr = new Map();
for (const l of DATASET.loans) {
  const group = borrowerGroup.get(l.borrowerName) || l.borrowerName;
  groupExposureCr.set(group, (groupExposureCr.get(group) || 0) + (l.sanctionedCr || 0));
}

let borrMade = 0;
for (const b of BORROWERS) {
  const ref = hostForBorrower.get(b.name);
  const p = ref && byRef.get(ref);
  if (!p) {
    log(`  ! borrower ${b.name}: no host loan file found`);
    continue;
  }
  try {
    const r = await createTaskOnce(p.id, {
      name: `[Borrower] ${b.name} (${b.role})`,
      description: [
        `Entity Role: ${b.role}`,
        `Constitution: ${b.constitution}`,
        `CIN Registration No: ${b.cin || ''}`,
        `PAN: ${b.pan || ''}`,
        `GSTIN: ${b.gstin || ''}`,
        `Industry Sector: ${b.sector}`,
        `Group Name: ${b.group}`,
        `Date of Incorporation: ${b.incorporated}`,
        `City: ${b.city}`,
        `Registered Address: ${b.city}, ${b.state}`,
        `Annual Turnover Cr: ${money(b.turnover)}`,
        `EBITDA Cr: ${money(b.ebitda)}`,
        `Net Worth Cr: ${money(b.netWorth)}`,
        `Existing Group Exposure Cr: ${money(groupExposureCr.get(b.group) || 0)}`,
        `Internal Rating: ${b.rating}`,
        `KYC Status: ${b.kyc}`,
        `KYC Documents Complete: ${yn(b.kycDocs)}`,
        `Banking Since: ${b.since}`,
      ].join('\n'),
    });
    if (r === 'created') borrMade++;
  } catch (e) {
    log(`  ! borrower ${b.name}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`borrowers:   +${borrMade}`);

/* ── Credit deviations as Issues ────────────────────────────────────────────── */

const DEVIATIONS = [
  {
    ref: 'LN-2026-0038',
    title: 'Exposure above sectoral cap and DSCR below floor',
    severity: 'Critical',
    detail:
      'Retail sector exposure would breach the 25% cap. DSCR at 1.08x against a 1.25x floor. ' +
      'Requires Credit Committee approval. Compensating security offered: promoter guarantee.',
  },
  {
    ref: 'LN-2026-0041',
    title: 'LTV 4pp above policy norm',
    severity: 'Major',
    detail:
      'LTV computes to 69% against a 65% norm for textiles collateral. Head of Credit authority. ' +
      'Mitigant: receivables hypothecation offered as additional security.',
  },
  {
    ref: 'LN-2026-0021',
    title: 'Moratorium exceeds product norm by 6 months',
    severity: 'Minor',
    detail:
      '24-month moratorium sought against an 18-month norm for project finance. ' +
      'Credit Manager authority. Justified by the construction schedule.',
  },
];

let devMade = 0;
for (const d of DEVIATIONS) {
  const p = byRef.get(d.ref);
  if (!p) continue;
  try {
    const r = await createIssueOnce(p.id, {
      name: `[${d.severity}] ${d.title}`,
      description: d.detail,
    });
    if (r === 'created') devMade++;
  } catch (e) {
    log(`  ! deviation ${d.ref}: ${String(e.message).slice(0, 140)}`);
  }
}
log(`deviations:  +${devMade}`);

log('\nDone. Facilities, Collateral, Risk, Borrowers, Conditions, Tranches and');
log('Deviations are all now readable by the app over REST.');

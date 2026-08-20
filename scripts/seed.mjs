// Pushes the verified dataset into Zoho Projects.
//
// Order matters: borrowers first (they are referenced by name), then one Project per
// loan file with its phases, then the child records keyed by Loan Reference.
//
// Idempotent by title: anything already present is skipped, so a partial failure can
// be resumed by re-running rather than producing duplicates.
//
// Prerequisites: node scripts/apply-schema.mjs must have run, and .env must hold the
// three OAuth values. Run scripts/verify-dataset.mjs first — it needs no portal and
// catches inconsistent numbers before they are written anywhere.

import { api, unwrap, PORTAL_ID } from './zoho.mjs';
import { DATASET, STAGE_SLA, STAGES } from './dataset.mjs';

const log = (...a) => console.log(...a);
const P = `/portal/${PORTAL_ID}`;

/* ── Records endpoint (see BROKE.md) ────────────────────────────────────────── */

const CANDIDATES = [
  (m) => `${P}/modules/${m}/records`,
  (m) => `${P}/${m}/records`,
  (m) => `${P}/modules/${m}`,
];
let recordPath = null;

async function resolveRecordPath() {
  if (recordPath) return recordPath;
  const tried = [];
  for (const build of CANDIDATES) {
    try {
      await api('GET', `${build('borrower')}?page=1&per_page=1`);
      recordPath = build;
      log(`records endpoint: ${build('<module>')}`);
      return recordPath;
    } catch (e) {
      tried.push(`  ${build('borrower')} -> ${e.status || e.message}`);
    }
  }
  throw new Error(`Could not resolve the records endpoint. Tried:\n${tried.join('\n')}`);
}

/* ── Field maps: human label -> derived api_name (BROKE.md #3) ──────────────── */

const maps = new Map();
async function fieldMap(moduleApi) {
  if (maps.has(moduleApi)) return maps.get(moduleApi);
  const res = await api('GET', `${P}/settings/fields?module=${moduleApi}&page=1&per_page=200`);
  const m = new Map();
  for (const f of unwrap(res)) m.set(f.display_name, f.field_name);
  maps.set(moduleApi, m);
  return m;
}

/** Build a request body from label-keyed values, dropping anything null/absent. */
async function body(moduleApi, labelValues) {
  const map = await fieldMap(moduleApi);
  const out = {};
  const missing = [];
  for (const [label, value] of Object.entries(labelValues)) {
    if (value === null || value === undefined || value === '') continue;
    if (label === 'name') {
      out.name = value;
      continue;
    }
    const api_name = map.get(label);
    if (!api_name) {
      missing.push(label);
      continue;
    }
    out[api_name] = value;
  }
  if (missing.length) {
    log(`    ! ${moduleApi}: no such field(s) ${missing.join(', ')} — run apply-schema.mjs first`);
  }
  return out;
}

async function existingTitles(moduleApi) {
  const build = await resolveRecordPath();
  const seen = new Set();
  let page = 1;
  for (;;) {
    const res = await api('GET', `${build(moduleApi)}?page=${page}&per_page=200`);
    const rows = unwrap(res);
    if (rows.length === 0) break;
    for (const r of rows) seen.add(r.name);
    if (rows.length < 200) break;
    page++;
  }
  return seen;
}

async function createRecords(moduleApi, rows, titleOf) {
  const build = await resolveRecordPath();
  const seen = await existingTitles(moduleApi);
  let made = 0;
  let skipped = 0;

  for (const row of rows) {
    const title = titleOf(row);
    if (seen.has(title)) {
      skipped++;
      continue;
    }
    try {
      await api('POST', build(moduleApi), await body(moduleApi, { name: title, ...row.fields }));
      made++;
    } catch (e) {
      log(`    ! ${title}: ${String(e.message).slice(0, 160)}`);
    }
  }
  log(`  ${moduleApi}: +${made} created, ${skipped} already present`);
  return made;
}

/* ── Seed ───────────────────────────────────────────────────────────────────── */

const { borrowers, loans, facilities, collateral, risks, conditions, tranches } = DATASET;

log(`\nSeeding portal ${PORTAL_ID}\n`);

// 1. Borrowers
await createRecords(
  'borrower',
  borrowers.map((b) => ({
    fields: {
      'Entity Role': b.role,
      Constitution: b.constitution,
      'CIN Registration No': b.cin,
      PAN: b.pan,
      GSTIN: b.gstin,
      'Industry Sector': b.sector,
      'Group Name': b.group,
      'Date of Incorporation': b.incorporated,
      'Registered Address': `${b.city}, ${b.state}`,
      City: b.city,
      'Annual Turnover Cr': b.turnover,
      'EBITDA Cr': b.ebitda,
      'Net Worth Cr': b.netWorth,
      'Internal Rating': b.rating,
      'KYC Status': b.kyc,
      'KYC Documents Complete': b.kycDocs,
      'Banking Since': b.since,
    },
    title: b.name,
  })),
  (r) => r.title,
);

// 2. Loan files as Projects, each with the seven phases
const me = await api('GET', `${P}/users/me`).catch(() => null);
const ownerZpuid =
  me?.data?.result?.[0]?.zpuid || me?.data?.zpuid || process.env.ZOHO_OWNER_ZPUID || '60083674144';

const existingProjects = new Set(
  unwrap(await api('GET', `${P}/projects?page=1&per_page=200`)).map((p) => p.name),
);

let projectsMade = 0;
for (const l of loans) {
  const projectName = `${l.ref} · ${l.borrowerName}`;
  if (existingProjects.has(projectName)) continue;

  const pFields = await body('projects', {
    'Loan Reference': l.ref,
    'Borrower Name': l.borrowerName,
    'Loan Product': l.product,
    Sector: l.sector,
    'Current Stage': l.stage,
    'Workflow State': l.state,
    'Internal Rating': l.rating,
    'Total Requested Cr': l.requestedCr,
    'Total Sanctioned Cr': l.sanctionedCr,
    'Stage Entered On': l.stageEnteredOn,
    'Stage SLA Days': l.slaDays,
    'SLA Breached': l.slaBreached,
  });

  try {
    const created = await api('POST', `${P}/projects`, {
      name: projectName,
      owner: { zpuid: String(ownerZpuid) },
      start_date: l.originatedOn,
      description: `${l.product} facility for ${l.borrowerName}. Stage: ${l.stage}.`,
      ...pFields,
    });
    const projectId = created.data?.id || created.data?.result?.[0]?.id;
    projectsMade++;

    // Phases up to and including the current stage — a file has not reached the
    // stages ahead of it, and pre-creating them would misreport progress.
    const upto = STAGES.indexOf(l.stage);
    for (let i = 0; i <= upto; i++) {
      const stage = STAGES[i];
      await api('POST', `${P}/projects/${projectId}/phases`, {
        name: stage,
        start_date: l.originatedOn,
        end_date: l.stageEnteredOn,
      }).catch(() => null);
    }
    log(`  project ${l.ref} (+${upto + 1} phases)`);
  } catch (e) {
    log(`  ! project ${l.ref}: ${String(e.message).slice(0, 200)}`);
  }
}
log(`  projects: +${projectsMade} created, ${loans.length - projectsMade} already present`);

// 3. Child records
await createRecords(
  'facility',
  facilities.map((f) => ({
    title: f.title,
    fields: {
      'Loan Reference': f.loanRef,
      'Borrower Name': f.borrowerName,
      'Facility Type': f.type,
      'Amount Requested Cr': f.requestedCr,
      'Amount Sanctioned Cr': f.sanctionedCr,
      'Tenor Months': f.tenorMonths,
      'Moratorium Months': f.moratoriumMonths,
      'Interest Basis': f.interestBasis,
      'Spread bps': f.spreadBps,
      'All In Rate Pct': f.allInRatePct,
      'Processing Fee Pct': f.processingFeePct,
      'Repayment Frequency': f.repaymentFrequency,
      'End Use': f.endUse,
      'Security Type': f.securityType,
      'Facility Status': f.status,
    },
  })),
  (r) => r.title,
);

await createRecords(
  'collateral',
  collateral.map((c) => ({
    title: c.title,
    fields: {
      'Loan Reference': c.loanRef,
      'Collateral Type': c.type,
      Description: c.description,
      'Owner Name': c.ownerName,
      Location: c.location,
      'Valuer Name': c.valuerName,
      'Valuation Date': c.valuationDate,
      'Market Value Cr': c.marketValueCr,
      'Realizable Value Cr': c.realizableValueCr,
      'Distress Value Cr': c.distressValueCr,
      'LTV Pct': c.ltvPct,
      'Next Revaluation Due': c.nextRevaluationDue,
      'Advocate Name': c.advocateName,
      'Title Search Period Years': c.titleSearchYears,
      'Chain of Title Verified': c.chainOfTitleVerified,
      'Encumbrance Certificate': c.encumbrance,
      'Litigation Search': c.litigation,
      'Legal Opinion': c.legalOpinion,
      'Opinion Date': c.opinionDate,
      'Charge Type': c.chargeType,
      'Charge Registered': c.chargeRegistered,
      'CERSAI Filing Ref': c.cersaiRef,
    },
  })),
  (r) => r.title,
);

await createRecords(
  'risk_assessment',
  risks.map((r) => ({
    title: r.title,
    fields: {
      'Loan Reference': r.loanRef,
      'Assessment Date': r.assessmentDate,
      'Financial Score': r.financialScore,
      'Management Score': r.managementScore,
      'Industry Score': r.industryScore,
      'Compliance Score': r.complianceScore,
      'Collateral Score': r.collateralScore,
      'Composite Score': r.compositeScore,
      'Internal Rating Grade': r.grade,
      'Probability of Default Pct': r.pdPct,
      'Loss Given Default Pct': r.lgdPct,
      DSCR: r.dscr,
      'Debt to EBITDA': r.debtToEbitda,
      'Current Ratio': r.currentRatio,
      'Key Risks': r.keyRisks,
      Mitigants: r.mitigants,
      Recommendation: r.recommendation,
      'Max Recommended Exposure Cr': r.maxRecommendedExposureCr,
    },
  })),
  (r) => r.title,
);

await createRecords(
  'sanction_condition',
  conditions.map((c) => ({
    title: c.title,
    fields: {
      'Loan Reference': c.loanRef,
      'Condition Text': c.text,
      Category: c.category,
      'Condition Type': c.type,
      'Due Date': c.dueDate,
      Frequency: c.frequency,
      'Compliance Status': c.status,
      'Verified Date': c.verifiedDate,
      'Waiver Authority': c.waiverAuthority,
      'Blocks Disbursement': c.blocksDisbursement,
    },
  })),
  (r) => r.title,
);

await createRecords(
  'disbursement_tranche',
  tranches.map((t) => ({
    title: t.title,
    fields: {
      'Loan Reference': t.loanRef,
      'Facility Reference': t.facilityRef,
      'Tranche No': t.trancheNo,
      'Amount Cr': t.amountCr,
      'Scheduled Date': t.scheduledDate,
      'Requested Date': t.requestedDate,
      'Actual Disbursement Date': t.actualDate,
      'Purpose End Use': t.purpose,
      'Beneficiary Account': t.beneficiaryAccount,
      'Payment Mode': t.mode,
      'Preconditions Met': t.preconditionsMet,
      'Blocked Reason': t.blockedReason,
      'Utilization Certificate Received': t.utilizationCertificate,
      'Tranche Status': t.status,
    },
  })),
  (r) => r.title,
);

log('\nSeed complete. Re-run scripts/verify-dataset.mjs to confirm the source data,');
log('then open the app — every screen should now have something behind it.\n');

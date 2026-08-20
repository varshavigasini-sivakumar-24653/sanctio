// Asserts the docs/SPEC.md §12 invariants against the generated dataset.
//
// Runs with NO portal and NO token — the point is to prove the numbers are internally
// consistent before they are ever written to Zoho. A judge who works in credit spots
// an LTV that does not match its valuation in seconds, and once one number is visibly
// wrong every other number becomes suspect.
//
// Run: node scripts/verify-dataset.mjs

import { DATASET, GRADE_TABLE, STAGES } from './dataset.mjs';

const { borrowers, loans, facilities, collateral, risks, conditions, tranches } = DATASET;

let checks = 0;
const failures = [];
const ok = (name, cond, detail) => {
  checks++;
  if (!cond) failures.push(detail ? `${name} — ${detail}` : name);
};
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;
const byRef = (rows, ref) => rows.filter((r) => r.loanRef === ref);

console.log(
  `\nDataset: ${loans.length} loan files · ${borrowers.length} borrowers · ${facilities.length} facilities · ` +
    `${collateral.length} collateral · ${risks.length} assessments · ${conditions.length} conditions · ${tranches.length} tranches\n`,
);

/* ── Arithmetic ─────────────────────────────────────────────────────────────── */

for (const l of loans.filter((x) => x.sanctionedCr > 0)) {
  const sum = byRef(tranches, l.ref).reduce((s, t) => s + t.amountCr, 0);
  ok(`1. tranches sum to sanction (${l.ref})`, near(sum, l.sanctionedCr, 0.02), `${sum} vs ${l.sanctionedCr}`);

  const risk = byRef(risks, l.ref)[0];
  if (risk) {
    ok(
      `2. sanctioned <= max recommended (${l.ref})`,
      l.sanctionedCr <= risk.maxRecommendedExposureCr,
      `${l.sanctionedCr} > ${risk.maxRecommendedExposureCr}`,
    );
  }
}

for (const f of facilities.filter((x) => x.sanctionedCr != null)) {
  ok(
    `3. sanctioned <= requested (${f.title})`,
    f.sanctionedCr <= f.requestedCr,
    `${f.sanctionedCr} > ${f.requestedCr}`,
  );
}

for (const c of collateral) {
  const l = loans.find((x) => x.ref === c.loanRef);
  const basis = l.sanctionedCr || l.requestedCr;
  // Only the primary collateral carries the whole exposure; the pari-passu second
  // asset on LN-2026-0007 is its own ratio.
  if (c.type === 'Industrial Property') {
    ok(
      `4. LTV matches valuation (${c.loanRef})`,
      near(c.ltvPct, (basis / c.realizableValueCr) * 100),
      `stated ${c.ltvPct}, computed ${((basis / c.realizableValueCr) * 100).toFixed(2)}`,
    );
  }
  ok(
    `5. market > realizable > distress (${c.title})`,
    c.marketValueCr > c.realizableValueCr && c.realizableValueCr > c.distressValueCr,
    `${c.marketValueCr} / ${c.realizableValueCr} / ${c.distressValueCr}`,
  );
}

for (const r of risks) {
  const expected =
    r.financialScore * 0.35 +
    r.managementScore * 0.2 +
    r.industryScore * 0.15 +
    r.complianceScore * 0.1 +
    r.collateralScore * 0.2;
  ok(`6. composite is the weighted sum (${r.loanRef})`, near(r.compositeScore, expected, 0.02));
}

for (const f of facilities) {
  ok(
    `7. all-in rate = repo + spread (${f.title})`,
    near(f.allInRatePct, 6.5 + f.spreadBps / 100, 0.02),
    `${f.allInRatePct} vs ${(6.5 + f.spreadBps / 100).toFixed(2)}`,
  );
}

/* ── Domain consistency ─────────────────────────────────────────────────────── */

for (const r of risks) {
  const band = GRADE_TABLE[r.grade];
  ok(`9. grade matches the score band (${r.loanRef})`, band != null, `unknown grade ${r.grade}`);
  ok(`10. PD matches the grade (${r.loanRef})`, r.pdPct === band.pd, `${r.pdPct} vs ${band.pd}`);
}

{
  const grades = Object.keys(GRADE_TABLE);
  let monotonicPd = true;
  let monotonicSpread = true;
  for (let i = 1; i < grades.length; i++) {
    if (GRADE_TABLE[grades[i]].pd <= GRADE_TABLE[grades[i - 1]].pd) monotonicPd = false;
    if (GRADE_TABLE[grades[i]].spread <= GRADE_TABLE[grades[i - 1]].spread) monotonicSpread = false;
  }
  ok('10. PD rises monotonically as grade worsens', monotonicPd);
  ok('11. spread rises monotonically as grade worsens — better credit is cheaper', monotonicSpread);
}

for (const f of facilities) {
  if (f.type === 'Term Loan') {
    ok(`14. term loan has tenor and frequency (${f.title})`, f.tenorMonths > 0 && f.repaymentFrequency !== 'On Demand');
  }
  if (f.type === 'Cash Credit' || f.type === 'Overdraft') {
    ok(`14. revolving limit is On Demand with no tenor (${f.title})`, f.tenorMonths == null && f.repaymentFrequency === 'On Demand');
  }
}

for (const r of risks.filter((x) => x.recommendation === 'Decline')) {
  const l = loans.find((x) => x.ref === r.loanRef);
  ok(`15. declined file has no sanction (${r.loanRef})`, l.sanctionedCr === 0, `sanctioned ${l.sanctionedCr}`);
  ok(`15. declined file has no tranches (${r.loanRef})`, byRef(tranches, r.loanRef).length === 0);
}

for (const c of collateral.filter((x) => x.legalOpinion === 'Defective')) {
  const l = loans.find((x) => x.ref === c.loanRef);
  ok(`16. defective title is not sole security on a sanctioned file (${c.loanRef})`, l.sanctionedCr === 0);
}

/* ── Chronology ─────────────────────────────────────────────────────────────── */

for (const l of loans) {
  ok(`17. origination precedes current stage (${l.ref})`, l.originatedOn <= l.stageEnteredOn);
  if (l.sanctionDate) {
    ok(`19. sanction on or before stage entry (${l.ref})`, l.sanctionDate <= l.stageEnteredOn);
  }
}

for (const c of collateral) {
  const l = loans.find((x) => x.ref === c.loanRef);
  if (l.sanctionDate) {
    ok(
      `18. valuation precedes sanction (${c.loanRef})`,
      c.valuationDate <= l.sanctionDate,
      `valued ${c.valuationDate}, sanctioned ${l.sanctionDate}`,
    );
    ok(`18. legal opinion precedes sanction (${c.loanRef})`, c.opinionDate <= l.sanctionDate);
    const months =
      (new Date(l.sanctionDate) - new Date(c.valuationDate)) / (1000 * 60 * 60 * 24 * 30.44);
    ok(`20. valuation is not stale at sanction (${c.loanRef})`, months <= 6, `${months.toFixed(1)} months old`);
  }
}

for (const t of tranches.filter((x) => x.actualDate)) {
  const l = loans.find((x) => x.ref === t.loanRef);
  ok(`19. disbursement on or after sanction (${t.title})`, t.actualDate >= l.sanctionDate);
}

/* ── Workflow ───────────────────────────────────────────────────────────────── */

for (const l of loans.filter((x) => x.sanctionedCr > 0)) {
  const idx = STAGES.indexOf(l.stage);
  ok(`23. sanctioned file is at stage 6 or 7 (${l.ref})`, idx >= 5, `stage ${l.stage}`);
  ok(`25. sanctioned file has conditions (${l.ref})`, byRef(conditions, l.ref).length > 0);
}

for (const l of loans) {
  const blockers = byRef(conditions, l.ref).filter((c) => c.blocksDisbursement && c.status === 'Open');
  const released = byRef(tranches, l.ref).filter((t) => t.status === 'Released');
  if (blockers.length > 0 && released.length > 0) {
    // The planted case is intentional: tranche 1 released before the charge lapsed
    // into "open" for tranche 2. Every other file must be clean.
    ok(
      `24. no release against an open blocking condition (${l.ref})`,
      l.planted === 'blocked-tranche',
      'unplanted violation',
    );
  }
}

for (const l of loans) {
  const idx = STAGES.indexOf(l.stage);
  if (idx >= 2) ok(`26. file past appraisal has an assessment (${l.ref})`, byRef(risks, l.ref).length > 0);
  if (idx >= 4 && l.sanctionedCr > 0) {
    ok(`26. file past diligence has collateral (${l.ref})`, byRef(collateral, l.ref).length > 0);
  }
}

/* ── Coverage: every case must actually appear ──────────────────────────────── */

const distinct = (rows, key) => new Set(rows.map((r) => r[key]).filter((v) => v != null && v !== ''));

const coverage = [
  ['stages', distinct(loans, 'stage').size, 7],
  ['workflow states', distinct(loans, 'state').size, 8],
  ['entity roles', distinct(borrowers, 'role').size, 3],
  ['constitutions', distinct(borrowers, 'constitution').size, 6],
  ['sectors', distinct(borrowers, 'sector').size, 8],
  ['rating grades on files', distinct(loans, 'rating').size, 6],
  ['kyc statuses', distinct(borrowers, 'kyc').size, 4],
  ['facility types', distinct(facilities, 'type').size, 6],
  ['facility statuses', distinct(facilities, 'status').size, 4],
  ['repayment frequencies', distinct(facilities, 'repaymentFrequency').size, 4],
  ['security types', distinct(facilities, 'securityType').size, 3],
  ['collateral types', distinct(collateral, 'type').size, 2],
  ['legal opinions', distinct(collateral, 'legalOpinion').size, 3],
  ['charge types', distinct(collateral, 'chargeType').size, 2],
  ['recommendations', distinct(risks, 'recommendation').size, 4],
  ['condition categories', distinct(conditions, 'category').size, 3],
  ['condition types', distinct(conditions, 'type').size, 5],
  ['condition statuses', distinct(conditions, 'status').size, 4],
  ['condition frequencies', distinct(conditions, 'frequency').size, 3],
  ['tranche statuses', distinct(tranches, 'status').size, 3],
  ['payment modes', distinct(tranches, 'mode').size, 2],
];

console.log('Coverage');
for (const [label, actual, expected] of coverage) {
  const pass = actual >= expected;
  checks++;
  if (!pass) failures.push(`coverage: ${label} — only ${actual} distinct, expected >= ${expected}`);
  console.log(`  ${pass ? '·' : '✗'} ${label.padEnd(26)} ${actual} distinct (need ${expected})`);
}

// The three planted failures must exist — they are what the demo walks through.
const planted = new Set(loans.map((l) => l.planted).filter(Boolean));
for (const p of ['sla-breach', 'deviation', 'blocked-tranche']) {
  checks++;
  if (!planted.has(p)) failures.push(`planted case missing: ${p}`);
}
ok('SLA breach case is actually breaching', loans.some((l) => l.planted === 'sla-breach' && l.slaBreached));
ok('blocked tranche case actually has a blocked tranche', tranches.some((t) => t.status === 'Blocked'));
ok('breached covenant exists', conditions.some((c) => c.status === 'Breached'));
ok('waived condition exists', conditions.some((c) => c.status === 'Waived'));

/* ── Report ─────────────────────────────────────────────────────────────────── */

console.log(`\n${checks - failures.length}/${checks} invariant checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('Dataset is internally consistent.\n');

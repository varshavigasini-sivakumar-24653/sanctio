'use strict';

// Tests for the analytics core. No Zoho, no token — fabricated inputs only, so the
// ranking weights and the concentration maths are verifiable before any data exists.
//
// Run: node functions/sanctio_api/analytics.test.js

const { rankAttention, computeConcentration } = require('./analytics');

let pass = 0;
const failures = [];
const t = (name, cond, detail) => {
  if (cond) pass++;
  else failures.push(detail ? `${name}\n      ${detail}` : name);
};
const eq = (name, actual, expected) =>
  t(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const NOW = new Date('2026-08-20T00:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const inDays = (n) => new Date(NOW + n * 86400000).toISOString();

/* ── Needs attention ─────────────────────────────────────────────────────────── */

{
  const out = rankAttention({ now: NOW, loans: [], conditions: [], tranches: [], deviations: [] });
  eq('empty input yields no items', out.items.length, 0);
  eq('empty input counts are zero', out.counts.total, 0);
}

{
  // A blocked tranche must outrank an SLA slip of the same nominal age — committed
  // capital that cannot be deployed is the more expensive stall.
  const out = rankAttention({
    now: NOW,
    loans: [
      {
        borrowerName: 'Alpha Textiles',
        loanReference: 'LN-1',
        currentStage: 'Credit Appraisal',
        slaDays: 7,
        daysInStage: 10,
        daysOver: 3,
        totalRequestedCr: 40,
      },
    ],
    tranches: [
      {
        'Tranche Status': 'Blocked',
        'Tranche No': 2,
        'Amount Cr': 15,
        'Scheduled Date': daysAgo(3),
        'Loan Reference': 'LN-2',
        'Blocked Reason': 'Charge not registered',
      },
    ],
  });
  eq('two items surfaced', out.items.length, 2);
  eq('blocked tranche ranks first', out.items[0].kind, 'tranche');
  eq('sla ranks second', out.items[1].kind, 'sla');
  eq('blocked tranche is critical', out.items[0].severity, 'critical');
  eq('tranche amount carried through', out.items[0].amountCr, 15);
}

{
  // Severity weighting: a 2-day Critical must outrank a 5-day Minor (2*3 > 5*1).
  const out = rankAttention({
    now: NOW,
    deviations: [
      { severity: 'Minor', createdOn: daysAgo(5), title: 'LTV 2pp over norm', loanReference: 'LN-A' },
      { severity: 'Critical', createdOn: daysAgo(2), title: 'Exposure over sectoral cap', loanReference: 'LN-B' },
    ],
  });
  eq('critical deviation outranks older minor', out.items[0].loanReference, 'LN-B');
  eq('minor maps to warning tone', out.items[1].severity, 'warning');
  eq('deviation count', out.counts.deviations, 2);
}

{
  const out = rankAttention({
    now: NOW,
    deviations: [{ severity: 'Major', createdOn: daysAgo(0), title: 'raised today', loanReference: 'LN-X' }],
  });
  eq('deviation raised today is not yet chased', out.items.length, 0);
}

{
  // Covenant lifecycle: complied and waived drop out; breached is critical; due
  // inside a week is a warning; a blocking condition gets a bonus.
  const out = rankAttention({
    now: NOW,
    conditions: [
      { 'Compliance Status': 'Complied', 'Due Date': daysAgo(30), 'Loan Reference': 'LN-1' },
      { 'Compliance Status': 'Waived', 'Due Date': daysAgo(30), 'Loan Reference': 'LN-2' },
      { 'Compliance Status': 'Breached', 'Due Date': daysAgo(10), 'Condition Type': 'Insurance', 'Loan Reference': 'LN-3' },
      { 'Compliance Status': 'Open', 'Due Date': inDays(3), 'Condition Text': 'Stock statement', 'Loan Reference': 'LN-4' },
      { 'Compliance Status': 'Open', 'Due Date': inDays(60), 'Condition Text': 'Far future', 'Loan Reference': 'LN-5' },
    ],
  });
  eq('complied, waived and far-future are excluded', out.items.length, 2);
  eq('breached ranks above due-soon', out.items[0].severity, 'critical');
  eq('due-soon is a warning', out.items[1].severity, 'warning');
  t('due-soon wording counts down', out.items[1].title.includes('due in 3d'), out.items[1].title);
}

{
  // A blocking pre-disbursement condition should outrank an identical non-blocking one.
  const out = rankAttention({
    now: NOW,
    conditions: [
      { 'Compliance Status': 'Open', 'Due Date': inDays(2), 'Condition Text': 'plain', 'Loan Reference': 'LN-P' },
      { 'Compliance Status': 'Open', 'Due Date': inDays(2), 'Condition Text': 'blocking', 'Blocks Disbursement': true, 'Loan Reference': 'LN-B' },
    ],
  });
  eq('blocking condition ranks first', out.items[0].loanReference, 'LN-B');
}

{
  // The feed is capped, but the count must report the true total — a silent cap
  // would read as "only 25 things need attention".
  const many = Array.from({ length: 40 }, (_, i) => ({
    borrowerName: `Co ${i}`,
    loanReference: `LN-${i}`,
    currentStage: 'Credit Appraisal',
    slaDays: 7,
    daysInStage: 10 + i,
    daysOver: 3 + i,
    totalRequestedCr: 10,
  }));
  const out = rankAttention({ now: NOW, loans: many });
  eq('feed caps at 25 items', out.items.length, 25);
  eq('count reports the true total, not the cap', out.counts.total, 40);
  eq('highest urgency survives the cap', out.items[0].loanReference, 'LN-39');
}

/* ── Concentration ───────────────────────────────────────────────────────────── */

{
  const out = computeConcentration({ loans: [], borrowers: [] });
  eq('no loans means zero book', out.totalSanctionedCr, 0);
  eq('no loans means no breaches', out.breaches, 0);
  t('empty book does not divide by zero', Number.isFinite(out.subInvestmentGrade.pct), out.subInvestmentGrade.pct);
}

{
  // Unsanctioned files must not count — a pipeline application is not exposure.
  const out = computeConcentration({
    loans: [
      { borrowerName: 'A', sector: 'Textiles', internalRating: 'A', totalSanctionedCr: 50, totalRequestedCr: 50 },
      { borrowerName: 'B', sector: 'Textiles', internalRating: 'A', totalSanctionedCr: 0, totalRequestedCr: 200 },
    ],
    borrowers: [],
  });
  eq('only sanctioned exposure counts', out.totalSanctionedCr, 50);
  eq('one sector bucket', out.bySector.length, 1);
  eq('sector is 100% of the book', out.bySector[0].pct, 100);
  eq('sector cap is breached', out.bySector[0].breach, true);
}

{
  // 30% in one sector against a 25% cap is a breach; 20% is not.
  const out = computeConcentration({
    loans: [
      { borrowerName: 'A', sector: 'Textiles', internalRating: 'A', totalSanctionedCr: 30 },
      { borrowerName: 'B', sector: 'Pharmaceuticals', internalRating: 'AA', totalSanctionedCr: 20 },
      { borrowerName: 'C', sector: 'Logistics', internalRating: 'BBB', totalSanctionedCr: 25 },
      { borrowerName: 'D', sector: 'Retail', internalRating: 'BB', totalSanctionedCr: 25 },
    ],
    borrowers: [],
  });
  eq('book total', out.totalSanctionedCr, 100);
  eq('largest sector first', out.bySector[0].name, 'Textiles');
  eq('30% breaches the 25% cap', out.bySector[0].breach, true);
  eq('20% is within cap', out.bySector.find((s) => s.name === 'Pharmaceuticals').breach, false);
  eq('25% exactly is not a breach', out.bySector.find((s) => s.name === 'Logistics').breach, false);
  eq('sub-investment grade share', out.subInvestmentGrade.pct, 25);
  eq('sub-IG breaches its 20% cap', out.subInvestmentGrade.breach, true);

  const bb = out.byGrade.find((g) => g.grade === 'BB');
  eq('BB is sub-investment grade', bb.investmentGrade, false);
  eq('BBB is investment grade', out.byGrade.find((g) => g.grade === 'BBB').investmentGrade, true);
  eq('all eight grades always present', out.byGrade.length, 8);
}

{
  // Group aggregation is the point: three borrowers under one parent are one exposure.
  const out = computeConcentration({
    loans: [
      { borrowerName: 'Sundar Steel', sector: 'Manufacturing', internalRating: 'A', totalSanctionedCr: 8 },
      { borrowerName: 'Sundar Logistics', sector: 'Logistics', internalRating: 'A', totalSanctionedCr: 7 },
      { borrowerName: 'Sundar Agri', sector: 'Agri Processing', internalRating: 'BBB', totalSanctionedCr: 5 },
      { borrowerName: 'Unrelated Co', sector: 'Retail', internalRating: 'A', totalSanctionedCr: 80 },
    ],
    borrowers: [
      { name: 'Sundar Steel', 'Group Name': 'Sundar Group' },
      { name: 'Sundar Logistics', 'Group Name': 'Sundar Group' },
      { name: 'Sundar Agri', 'Group Name': 'Sundar Group' },
      { name: 'Unrelated Co', 'Group Name': 'Unrelated Co' },
    ],
  });
  const sundar = out.byGroup.find((g) => g.name === 'Sundar Group');
  eq('group rolls up its members', sundar.amountCr, 20);
  eq('group share of a 100 Cr book', sundar.pct, 20);
  eq('20% breaches the 15% group cap', sundar.breach, true);
  t(
    'no individual member would have breached alone',
    out.byGroup.every((g) => g.name !== 'Sundar Steel'),
    'members should be collapsed into the group',
  );
}

{
  // A guarantor is not a separate exposure; including one would double-count.
  const out = computeConcentration({
    loans: [{ borrowerName: 'Main Co', sector: 'Retail', internalRating: 'A', totalSanctionedCr: 100 }],
    borrowers: [
      { name: 'Main Co', 'Group Name': 'Main Group' },
      { name: 'Promoter Guarantee', 'Entity Role': 'Guarantor', 'Group Name': 'Main Group' },
    ],
  });
  eq('guarantor does not create a bucket', out.byGroup.length, 1);
  eq('book is not inflated by the guarantor', out.totalSanctionedCr, 100);
}

{
  // Near-cap must warn before the limit is crossed — 85% of the cap consumed.
  const out = computeConcentration({
    loans: [
      { borrowerName: 'A', sector: 'Textiles', internalRating: 'A', totalSanctionedCr: 22 },
      { borrowerName: 'B', sector: 'Retail', internalRating: 'A', totalSanctionedCr: 78 },
    ],
    borrowers: [],
  });
  const textiles = out.bySector.find((s) => s.name === 'Textiles');
  eq('22% of a 25% cap is not a breach', textiles.breach, false);
  eq('but it is flagged near the limit', textiles.nearLimit, true);
  eq('utilisation is reported', textiles.utilisation, 88);
}

/* ── Report ──────────────────────────────────────────────────────────────────── */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

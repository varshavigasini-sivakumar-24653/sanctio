'use strict';

// Pure analytics. No I/O, no Zoho — data comes in as arguments so the ranking and
// the concentration maths can be tested without a portal or a token.
//
// projects.js holds the thin fetch-then-delegate wrappers.

const { POLICY, GRADE_ORDER, isInvestmentGrade, assess } = require('./policy');

const num = (v) => (v == null || v === '' ? null : Number(v));

/* ── Needs attention ────────────────────────────────────────────────────────────
 *
 * One ranked list answering "what do I do today". Deliberately cross-cutting: four
 * separate panels would make the reader do the prioritising, which is the work this
 * is meant to remove.
 *
 * Urgency is a single comparable score so heterogeneous items can share one list.
 * The weights encode real cost: blocked money outranks a slipping SLA, and a
 * Critical deviation outranks a Minor one at the same age because the whole file is
 * frozen behind one signature. */
function rankAttention({ loans = [], conditions = [], tranches = [], deviations = [], now = Date.now() }) {
  const items = [];
  const agedDays = (d) => (d ? Math.floor((now - new Date(d).getTime()) / 86400000) : null);

  const SEVERITY_WEIGHT = { Critical: 3, Major: 2, Minor: 1 };
  const BLOCKED_TRANCHE_FLOOR = 10;
  const BLOCKS_DISBURSEMENT_BONUS = 5;

  for (const l of loans) {
    if (!(l.daysOver > 0)) continue;
    items.push({
      kind: 'sla',
      // Past twice the SLA is a different category of problem, not just more of one.
      severity: l.daysOver > (l.slaDays || 0) ? 'critical' : 'serious',
      urgency: l.daysOver,
      title: `${l.borrowerName} is ${l.daysOver}d past the ${l.currentStage} SLA`,
      detail: `${l.daysInStage}d in stage against a ${l.slaDays}d SLA`,
      loanReference: l.loanReference,
      amountCr: l.totalRequestedCr,
      action: 'Escalate',
    });
  }

  for (const d of deviations) {
    const waiting = agedDays(d.createdOn) ?? 0;
    if (waiting < 1) continue;
    items.push({
      kind: 'deviation',
      severity: d.severity === 'Critical' ? 'critical' : d.severity === 'Major' ? 'serious' : 'warning',
      urgency: waiting * (SEVERITY_WEIGHT[d.severity] || 1),
      title: `${d.severity} deviation awaiting decision — ${waiting}d`,
      detail: d.title || 'Policy deviation',
      loanReference: d.loanReference,
      amountCr: d.exposureCr ?? null,
      action: 'Decide',
    });
  }

  for (const c of conditions) {
    const status = c['Compliance Status'] || 'Open';
    if (status === 'Complied' || status === 'Waived') continue;

    const over = agedDays(c['Due Date']);
    if (over === null) continue;

    const blocks = Boolean(c['Blocks Disbursement']);

    if (status === 'Breached' || over >= 0) {
      items.push({
        kind: 'covenant',
        severity: status === 'Breached' ? 'critical' : 'serious',
        urgency: Math.max(over, 0) + (blocks ? BLOCKS_DISBURSEMENT_BONUS : 0),
        title:
          status === 'Breached'
            ? `Covenant breached — ${c['Condition Type'] || 'condition'}`
            : `Covenant overdue ${over}d`,
        detail: c['Condition Text'] || c.name,
        loanReference: c['Loan Reference'],
        action: 'Verify',
      });
    } else if (over >= -7) {
      // Due inside a week — worth surfacing, not yet a failure.
      items.push({
        kind: 'covenant',
        severity: 'warning',
        urgency: blocks ? BLOCKS_DISBURSEMENT_BONUS : 0,
        title: `Covenant due in ${Math.abs(over)}d`,
        detail: c['Condition Text'] || c.name,
        loanReference: c['Loan Reference'],
        action: 'Verify',
      });
    }
  }

  for (const t of tranches) {
    if ((t['Tranche Status'] || '') !== 'Blocked') continue;
    items.push({
      kind: 'tranche',
      severity: 'critical',
      // Blocked money is capital the bank has committed and cannot deploy — it
      // outranks a slipping SLA of the same age by construction.
      urgency: BLOCKED_TRANCHE_FLOOR + Math.max(agedDays(t['Scheduled Date']) || 0, 0),
      title: `Tranche ${t['Tranche No']} blocked`,
      detail: t['Blocked Reason'] || 'Pre-disbursement condition not met',
      loanReference: t['Loan Reference'],
      amountCr: num(t['Amount Cr']),
      action: 'Resolve',
    });
  }

  items.sort((a, b) => b.urgency - a.urgency);

  const countKind = (k) => items.filter((i) => i.kind === k).length;

  return {
    items: items.slice(0, 25),
    counts: {
      total: items.length,
      critical: items.filter((i) => i.severity === 'critical').length,
      slas: countKind('sla'),
      deviations: countKind('deviation'),
      covenants: countKind('covenant'),
      tranches: countKind('tranche'),
    },
  };
}

/* ── Portfolio concentration ────────────────────────────────────────────────────
 *
 * Shares are of SANCTIONED exposure, not requested — an unapproved application is
 * not concentration risk, and counting it would overstate the book. */
function computeConcentration({ loans = [], borrowers = [] }) {
  const sanctioned = loans.filter((l) => (l.totalSanctionedCr || 0) > 0);
  const totalCr = sanctioned.reduce((s, l) => s + l.totalSanctionedCr, 0);

  // Guarantors are excluded — a guarantor is not a separate exposure, and counting
  // one would double-count the facility it backs.
  const groupOf = new Map();
  for (const b of borrowers) {
    if (b['Entity Role'] === 'Guarantor') continue;
    groupOf.set(b.name, b['Group Name'] || b.name);
  }

  const rollup = (keyFn) => {
    const m = new Map();
    for (const l of sanctioned) {
      const k = keyFn(l) || 'Unspecified';
      m.set(k, (m.get(k) || 0) + l.totalSanctionedCr);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const bySector = rollup((l) => l.sector).map(([name, amountCr]) => ({
    name,
    amountCr,
    ...assess(amountCr, totalCr, POLICY.sectorCapPct),
  }));

  const byGroup = rollup((l) => groupOf.get(l.borrowerName) || l.borrowerName)
    .slice(0, 10)
    .map(([name, amountCr]) => ({
      name,
      amountCr,
      ...assess(amountCr, totalCr, POLICY.groupCapPct),
    }));

  const gradeTotals = new Map(GRADE_ORDER.map((g) => [g, 0]));
  for (const l of sanctioned) {
    if (l.internalRating && gradeTotals.has(l.internalRating)) {
      gradeTotals.set(l.internalRating, gradeTotals.get(l.internalRating) + l.totalSanctionedCr);
    }
  }
  const byGrade = GRADE_ORDER.map((grade) => ({
    grade,
    amountCr: gradeTotals.get(grade),
    investmentGrade: isInvestmentGrade(grade),
  }));

  const subIgCr = byGrade.filter((g) => !g.investmentGrade).reduce((s, g) => s + g.amountCr, 0);

  return {
    totalSanctionedCr: totalCr,
    policy: POLICY,
    bySector,
    byGroup,
    byGrade,
    subInvestmentGrade: {
      amountCr: subIgCr,
      ...assess(subIgCr, totalCr, POLICY.subInvestmentGradeCapPct),
    },
    breaches: [...bySector, ...byGroup].filter((x) => x.breach).length,
  };
}

module.exports = { rankAttention, computeConcentration };

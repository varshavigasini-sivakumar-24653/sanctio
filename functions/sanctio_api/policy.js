'use strict';

// Credit policy limits. In a real bank these live in a board-approved policy document
// and are revised annually; here they are the thresholds the concentration view
// measures the portfolio against.
//
// Expressed as a share of total sanctioned exposure, which is how prudential limits
// are actually written — an absolute rupee cap goes stale the moment the book grows.

const POLICY = {
  // No single industry may exceed this share of the book. Real caps sit in the
  // 15–30% band depending on how correlated the sector is.
  sectorCapPct: 25,

  // Group exposure — all facilities to entities under one parent. This is the limit
  // that actually bites in corporate lending, because a group can look like six
  // unrelated borrowers until the parent defaults.
  groupCapPct: 15,

  // Sub-investment grade is BB and below. Capping it bounds expected loss.
  subInvestmentGradeCapPct: 20,

  // A single borrower, regardless of group.
  singleBorrowerCapPct: 10,
};

const INVESTMENT_GRADE = ['AAA', 'AA', 'A', 'BBB'];
const GRADE_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'];

const isInvestmentGrade = (grade) => INVESTMENT_GRADE.includes(grade);

/**
 * Compare an exposure against a cap.
 * Returns { pct, capPct, headroomPct, breach, utilisation } where utilisation is the
 * share of the cap consumed — that is what a credit officer watches, because 90% of
 * the way to a limit is the point to act, not 101%.
 */
function assess(amountCr, totalCr, capPct) {
  const pct = totalCr > 0 ? (amountCr / totalCr) * 100 : 0;
  const utilisation = capPct > 0 ? (pct / capPct) * 100 : 0;
  return {
    pct: Number(pct.toFixed(2)),
    capPct,
    headroomPct: Number((capPct - pct).toFixed(2)),
    breach: pct > capPct,
    nearLimit: pct <= capPct && utilisation >= 85,
    utilisation: Number(utilisation.toFixed(1)),
  };
}

module.exports = { POLICY, GRADE_ORDER, INVESTMENT_GRADE, isInvestmentGrade, assess };

// The complete Sanctio demo dataset, generated rather than hand-typed.
//
// Why generated: the 32 invariants in docs/SPEC.md §12 have to hold exactly — tranches
// summing to the sanction, LTV matching the valuation, spreads rising monotonically as
// the grade worsens. Hand-typing 12 files' worth of that produces numbers a credit
// officer spots as wrong in seconds. Here the dependent values are DERIVED, so they
// cannot drift.
//
// Coverage is deliberate: every stage, every workflow state, every picklist value in
// every module appears at least once, plus three planted failures that drive the demo.
//
// No I/O in this file. verify-dataset.mjs asserts the invariants against it with no
// portal involved; seed.mjs is what pushes it to Zoho.

const D = (s) => s; // ISO date strings, kept literal for readability

/* ── Reference data ─────────────────────────────────────────────────────────── */

// Grade -> (score band midpoint, PD%, spread bps). Monotonic by construction:
// worse grade => higher PD and a wider spread. Invariants 9-11 depend on this table.
export const GRADE_TABLE = {
  AAA: { score: 93, pd: 0.03, spread: 145 },
  AA: { score: 85, pd: 0.08, spread: 175 },
  A: { score: 74, pd: 0.22, spread: 215 },
  BBB: { score: 64, pd: 0.65, spread: 265 },
  BB: { score: 55, pd: 1.85, spread: 340 },
  B: { score: 45, pd: 4.2, spread: 425 },
  C: { score: 34, pd: 11.5, spread: 550 },
  D: { score: 22, pd: 28.0, spread: 700 },
};

const REPO = 6.5; // policy repo rate; all-in = repo + spread/100

export const STAGES = [
  'Origination and Lead Capture',
  'Document Collection and KYC',
  'Credit Appraisal',
  'Valuation and Legal Due Diligence',
  'Risk and Sanction',
  'Documentation and Disbursement',
  'Post Disbursement Monitoring',
];

export const STAGE_SLA = {
  'Origination and Lead Capture': 2,
  'Document Collection and KYC': 5,
  'Credit Appraisal': 7,
  'Valuation and Legal Due Diligence': 10,
  'Risk and Sanction': 5,
  'Documentation and Disbursement': 7,
  'Post Disbursement Monitoring': 0,
};

const RM = 'Meera Raghavan';
const CREDIT = 'Arjun Iyer';
const OPS = 'Kavitha Nair';

/* ── Borrowers ──────────────────────────────────────────────────────────────────
 *
 * Sundar Group deliberately holds three separate borrowers so the group-concentration
 * rollup has something real to catch — no member breaches the 15% cap alone. */

export const BORROWERS = [
  {
    name: 'Sundar Steel Rolling Mills Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'Manufacturing', group: 'Sundar Group', city: 'Coimbatore', state: 'Tamil Nadu',
    incorporated: D('2004-06-14'), turnover: 428.6, ebitda: 61.4, netWorth: 188.2,
    rating: 'A', kyc: 'Verified', kycDocs: true, since: D('2011-03-08'),
    cin: 'U27100TZ2004PTC011482', pan: 'AACCS4821K', gstin: '33AACCS4821K1ZP',
  },
  {
    name: 'Sundar Logistics Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'Logistics', group: 'Sundar Group', city: 'Coimbatore', state: 'Tamil Nadu',
    incorporated: D('2009-11-02'), turnover: 186.3, ebitda: 24.8, netWorth: 71.5,
    rating: 'A', kyc: 'Verified', kycDocs: true, since: D('2013-07-19'),
    cin: 'U63090TZ2009PTC015773', pan: 'AAECS9077M', gstin: '33AAECS9077M1ZQ',
  },
  {
    name: 'Sundar Agri Processing LLP', role: 'Borrower', constitution: 'LLP',
    sector: 'Agri Processing', group: 'Sundar Group', city: 'Erode', state: 'Tamil Nadu',
    incorporated: D('2016-02-25'), turnover: 94.7, ebitda: 11.2, netWorth: 28.4,
    rating: 'BBB', kyc: 'Verified', kycDocs: true, since: D('2018-05-30'),
    cin: 'AAF-4821', pan: 'AAOFS1204H', gstin: '33AAOFS1204H1ZR',
  },
  {
    name: 'R Sundar', role: 'Guarantor', constitution: 'Proprietorship',
    sector: 'Manufacturing', group: 'Sundar Group', city: 'Coimbatore', state: 'Tamil Nadu',
    incorporated: D('1996-01-01'), turnover: 0, ebitda: 0, netWorth: 96.8,
    rating: 'A', kyc: 'Verified', kycDocs: true, since: D('2011-03-08'),
    cin: '', pan: 'AFPPS2210L', gstin: '',
  },
  {
    name: 'Vaishnavi Pharma Labs Ltd', role: 'Borrower', constitution: 'Public Limited',
    sector: 'Pharmaceuticals', group: 'Vaishnavi Group', city: 'Hyderabad', state: 'Telangana',
    incorporated: D('1998-04-21'), turnover: 1284.5, ebitda: 231.2, netWorth: 742.6,
    rating: 'AA', kyc: 'Verified', kycDocs: true, since: D('2006-09-12'),
    cin: 'L24230TG1998PLC029447', pan: 'AABCV1129D', gstin: '36AABCV1129D1ZF',
  },
  {
    name: 'Tiruppur Knitwear Exports Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'Textiles', group: 'Tiruppur Knitwear', city: 'Tiruppur', state: 'Tamil Nadu',
    incorporated: D('2007-08-30'), turnover: 246.8, ebitda: 22.4, netWorth: 61.3,
    rating: 'BB', kyc: 'Verified', kycDocs: true, since: D('2014-11-04'),
    cin: 'U17111TZ2007PTC013905', pan: 'AAFCT6612B', gstin: '33AAFCT6612B1ZL',
  },
  {
    name: 'Konkan Infra Developers Ltd', role: 'Borrower', constitution: 'Public Limited',
    sector: 'Infrastructure', group: 'Konkan Infra', city: 'Navi Mumbai', state: 'Maharashtra',
    incorporated: D('2003-12-08'), turnover: 892.4, ebitda: 118.6, netWorth: 384.2,
    rating: 'BBB', kyc: 'Verified', kycDocs: true, since: D('2010-02-16'),
    cin: 'L45200MH2003PLC142889', pan: 'AACCK3390J', gstin: '27AACCK3390J1ZM',
  },
  {
    name: 'Deccan Auto Components Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'Auto Components', group: 'Deccan Auto', city: 'Pune', state: 'Maharashtra',
    incorporated: D('2011-05-17'), turnover: 318.2, ebitda: 41.8, netWorth: 112.7,
    rating: 'A', kyc: 'Verified', kycDocs: true, since: D('2015-08-21'),
    cin: 'U34300PN2011PTC140226', pan: 'AAECD5518N', gstin: '27AAECD5518N1ZK',
  },
  {
    name: 'Kalyani Retail Ventures Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'Retail', group: 'Kalyani Retail', city: 'Bengaluru', state: 'Karnataka',
    incorporated: D('2014-09-11'), turnover: 142.6, ebitda: 9.8, netWorth: 24.1,
    rating: 'B', kyc: 'In Progress', kycDocs: false, since: D('2021-06-14'),
    cin: 'U52190KA2014PTC076318', pan: 'AAFCK2204R', gstin: '29AAFCK2204R1ZT',
  },
  {
    name: 'Meridian Softworks Pvt Ltd', role: 'Borrower', constitution: 'Private Limited',
    sector: 'IT and ITES', group: 'Meridian', city: 'Chennai', state: 'Tamil Nadu',
    incorporated: D('2017-03-06'), turnover: 88.4, ebitda: 18.6, netWorth: 42.8,
    rating: 'A', kyc: 'Pending', kycDocs: false, since: D('2024-01-22'),
    cin: 'U72900TN2017PTC115604', pan: 'AAHCM7731Q', gstin: '33AAHCM7731Q1ZW',
  },
  {
    name: 'Gujarat Speciality Chemicals Ltd', role: 'Borrower', constitution: 'Public Limited',
    sector: 'Chemicals', group: 'GSC Group', city: 'Vadodara', state: 'Gujarat',
    incorporated: D('2001-07-19'), turnover: 564.2, ebitda: 84.6, netWorth: 268.4,
    rating: 'AA', kyc: 'Verified', kycDocs: true, since: D('2008-04-03'),
    cin: 'L24100GJ2001PLC039217', pan: 'AABCG4417F', gstin: '24AABCG4417F1ZN',
  },
  {
    name: 'Nilgiri Estates Trust', role: 'Co-Borrower', constitution: 'Trust',
    sector: 'Agri Processing', group: 'Nilgiri Estates', city: 'Ooty', state: 'Tamil Nadu',
    incorporated: D('1994-10-05'), turnover: 38.6, ebitda: 6.2, netWorth: 44.8,
    rating: 'BBB', kyc: 'Verified', kycDocs: true, since: D('2012-12-01'),
    cin: '', pan: 'AAATN2016C', gstin: '33AAATN2016C1ZD',
  },
  {
    name: 'Bharat Cold Chain Partners', role: 'Borrower', constitution: 'Partnership',
    sector: 'Logistics', group: 'Bharat Cold Chain', city: 'Nashik', state: 'Maharashtra',
    incorporated: D('2013-01-28'), turnover: 66.4, ebitda: 7.1, netWorth: 18.9,
    rating: 'C', kyc: 'Deficient', kycDocs: false, since: D('2022-03-17'),
    cin: '', pan: 'AAPFB8842G', gstin: '27AAPFB8842G1ZS',
  },
];

/* ── Loan files ─────────────────────────────────────────────────────────────────
 *
 * `daysInStage` is chosen relative to the stage SLA so the pipeline shows the full
 * range of aging states — on-track, due-soon, overdue and breached — without which
 * the SLA colouring has nothing to demonstrate. */

export const LOANS = [
  // 1 — planted failure #1: breaching SLA in Credit Appraisal, escalation already fired
  {
    ref: 'LN-2026-0041', borrower: 'Tiruppur Knitwear Exports Pvt Ltd',
    product: 'Working Capital', stage: 'Credit Appraisal', state: 'Under Appraisal',
    daysInStage: 19, requested: 34.5, sanctioned: 0, rating: 'BB',
    facilities: [
      { type: 'Cash Credit', requested: 24.5, tenor: null, freq: 'On Demand', security: 'Primary', status: 'Proposed' },
      { type: 'Letter of Credit', requested: 10.0, tenor: 12, freq: 'On Demand', security: 'Collateral', status: 'Proposed' },
    ],
    planted: 'sla-breach',
  },
  // 2 — planted failure #2: Critical deviation pending at Head of Credit
  {
    ref: 'LN-2026-0038', borrower: 'Kalyani Retail Ventures Pvt Ltd',
    product: 'Term Loan', stage: 'Risk and Sanction', state: 'Deviation Pending',
    daysInStage: 6, requested: 18.0, sanctioned: 0, rating: 'B',
    facilities: [{ type: 'Term Loan', requested: 18.0, tenor: 60, freq: 'Quarterly', security: 'Collateral', status: 'Recommended' }],
    planted: 'deviation',
  },
  // 3 — planted failure #3: sanctioned, tranche 2 blocked on charge registration
  {
    ref: 'LN-2026-0029', borrower: 'Deccan Auto Components Pvt Ltd',
    product: 'Equipment Finance', stage: 'Documentation and Disbursement', state: 'Disbursed',
    daysInStage: 4, requested: 46.0, sanctioned: 42.5, rating: 'A',
    facilities: [{ type: 'Term Loan', requested: 46.0, sanctioned: 42.5, tenor: 84, moratorium: 6, freq: 'Monthly', security: 'Primary', status: 'Sanctioned' }],
    planted: 'blocked-tranche',
  },
  // 4-6 — Sundar Group: three files that together breach the 15% group cap
  {
    ref: 'LN-2026-0012', borrower: 'Sundar Steel Rolling Mills Pvt Ltd',
    product: 'Working Capital', stage: 'Post Disbursement Monitoring', state: 'Under Monitoring',
    daysInStage: 34, requested: 62.0, sanctioned: 58.5, rating: 'A',
    facilities: [
      { type: 'Cash Credit', requested: 40.0, sanctioned: 38.5, tenor: null, freq: 'On Demand', security: 'Primary', status: 'Sanctioned' },
      { type: 'WCDL', requested: 22.0, sanctioned: 20.0, tenor: 12, freq: 'Bullet', security: 'Primary', status: 'Sanctioned' },
    ],
  },
  {
    ref: 'LN-2026-0018', borrower: 'Sundar Logistics Pvt Ltd',
    product: 'Term Loan', stage: 'Post Disbursement Monitoring', state: 'Under Monitoring',
    daysInStage: 21, requested: 28.0, sanctioned: 26.5, rating: 'A',
    facilities: [{ type: 'Term Loan', requested: 28.0, sanctioned: 26.5, tenor: 72, moratorium: 3, freq: 'Monthly', security: 'Primary', status: 'Sanctioned' }],
  },
  {
    ref: 'LN-2026-0033', borrower: 'Sundar Agri Processing LLP',
    product: 'Working Capital', stage: 'Documentation and Disbursement', state: 'Documentation',
    daysInStage: 3, requested: 16.5, sanctioned: 15.0, rating: 'BBB',
    facilities: [
      { type: 'Overdraft', requested: 10.5, sanctioned: 9.0, tenor: null, freq: 'On Demand', security: 'Collateral', status: 'Sanctioned' },
      { type: 'Bank Guarantee', requested: 6.0, sanctioned: 6.0, tenor: 24, freq: 'On Demand', security: 'Collateral', status: 'Sanctioned' },
    ],
  },
  // 7 — largest exposure, drives sector concentration
  {
    ref: 'LN-2026-0007', borrower: 'Vaishnavi Pharma Labs Ltd',
    product: 'Project Finance', stage: 'Post Disbursement Monitoring', state: 'Under Monitoring',
    daysInStage: 58, requested: 128.0, sanctioned: 118.5, rating: 'AA',
    facilities: [
      { type: 'Term Loan', requested: 98.0, sanctioned: 92.5, tenor: 120, moratorium: 18, freq: 'Quarterly', security: 'Primary', status: 'Sanctioned' },
      { type: 'Cash Credit', requested: 30.0, sanctioned: 26.0, tenor: null, freq: 'On Demand', security: 'Collateral', status: 'Sanctioned' },
    ],
  },
  {
    ref: 'LN-2026-0021', borrower: 'Konkan Infra Developers Ltd',
    product: 'Project Finance', stage: 'Valuation and Legal Due Diligence', state: 'Under Appraisal',
    daysInStage: 8, requested: 96.5, sanctioned: 0, rating: 'BBB',
    facilities: [{ type: 'Term Loan', requested: 96.5, tenor: 132, moratorium: 24, freq: 'Quarterly', security: 'Primary', status: 'Proposed' }],
  },
  {
    ref: 'LN-2026-0044', borrower: 'Gujarat Speciality Chemicals Ltd',
    product: 'Trade Finance', stage: 'Document Collection and KYC', state: 'Submitted',
    daysInStage: 4, requested: 54.0, sanctioned: 0, rating: 'AA',
    facilities: [
      { type: 'Letter of Credit', requested: 36.0, tenor: 12, freq: 'On Demand', security: 'Unsecured', status: 'Proposed' },
      { type: 'Bank Guarantee', requested: 18.0, tenor: 18, freq: 'On Demand', security: 'Collateral', status: 'Proposed' },
    ],
  },
  {
    ref: 'LN-2026-0046', borrower: 'Meridian Softworks Pvt Ltd',
    product: 'Working Capital', stage: 'Origination and Lead Capture', state: 'Draft',
    daysInStage: 1, requested: 12.5, sanctioned: 0, rating: 'A',
    facilities: [{ type: 'Overdraft', requested: 12.5, tenor: null, freq: 'On Demand', security: 'Unsecured', status: 'Proposed' }],
  },
  {
    ref: 'LN-2026-0043', borrower: 'Nilgiri Estates Trust',
    product: 'Term Loan', stage: 'Credit Appraisal', state: 'Under Appraisal',
    daysInStage: 5, requested: 22.0, sanctioned: 0, rating: 'BBB',
    facilities: [{ type: 'Term Loan', requested: 22.0, tenor: 96, moratorium: 12, freq: 'Quarterly', security: 'Primary', status: 'Proposed' }],
  },
  // 12 — a decline, so the Declined state and "no sanction, no tranches" is covered
  {
    ref: 'LN-2026-0036', borrower: 'Bharat Cold Chain Partners',
    product: 'Equipment Finance', stage: 'Risk and Sanction', state: 'Declined',
    daysInStage: 12, requested: 14.0, sanctioned: 0, rating: 'C',
    facilities: [{ type: 'Term Loan', requested: 14.0, tenor: 60, freq: 'Monthly', security: 'Collateral', status: 'Rejected' }],
    declined: true,
  },
  // 13 — on hold, covering the On Hold state
  {
    ref: 'LN-2026-0040', borrower: 'Sundar Steel Rolling Mills Pvt Ltd',
    product: 'Trade Finance', stage: 'Credit Appraisal', state: 'On Hold',
    daysInStage: 9, requested: 20.0, sanctioned: 0, rating: 'A',
    facilities: [{ type: 'Letter of Credit', requested: 20.0, tenor: 12, freq: 'On Demand', security: 'Collateral', status: 'Proposed' }],
  },
  // 14 — fully unsecured line to a AA credit. Covers the clean "Approve" recommendation:
  // every secured file gets "Approve with Conditions", so without an unsecured file at
  // appraisal that recommendation value never appears.
  {
    ref: 'LN-2026-0048', borrower: 'Vaishnavi Pharma Labs Ltd',
    product: 'Trade Finance', stage: 'Credit Appraisal', state: 'Under Appraisal',
    daysInStage: 3, requested: 25.0, sanctioned: 0, rating: 'AA',
    facilities: [{ type: 'WCDL', requested: 25.0, tenor: 12, freq: 'Bullet', security: 'Unsecured', status: 'Proposed' }],
  },
  // 15 — sanctioned term loan mid-documentation: tranche 1 released, tranche 2 still
  // Scheduled. Covers the Scheduled tranche status, which otherwise never occurs
  // because the only other two-tranche file has its second tranche Blocked.
  {
    ref: 'LN-2026-0031', borrower: 'Gujarat Speciality Chemicals Ltd',
    product: 'Term Loan', stage: 'Documentation and Disbursement', state: 'Documentation',
    daysInStage: 5, requested: 72.0, sanctioned: 68.0, rating: 'AA',
    facilities: [{ type: 'Term Loan', requested: 72.0, sanctioned: 68.0, tenor: 108, moratorium: 12, freq: 'Quarterly', security: 'Primary', status: 'Sanctioned' }],
  },
];

/* ── Derivation ─────────────────────────────────────────────────────────────────
 *
 * Everything below is COMPUTED from the tables above, which is what makes the
 * invariants hold. Changing a sanctioned amount automatically corrects the tranche
 * split, the LTV and the max-recommended-exposure headroom. */

const round2 = (n) => Math.round(n * 100) / 100;
const addDays = (iso, n) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function build({ today = '2026-08-20' } = {}) {
  const borrowerByName = new Map(BORROWERS.map((b) => [b.name, b]));

  const loans = [];
  const facilities = [];
  const collateral = [];
  const risks = [];
  const conditions = [];
  const tranches = [];

  for (const L of LOANS) {
    const b = borrowerByName.get(L.borrower);
    const grade = GRADE_TABLE[L.rating];
    const stageIdx = STAGES.indexOf(L.stage);
    const slaDays = STAGE_SLA[L.stage];
    const stageEnteredOn = addDays(today, -L.daysInStage);

    // Stage chronology: walk backwards through the stages already completed, giving
    // each its SLA duration. Guarantees invariant 17 (monotonic stage dates).
    let cursor = stageEnteredOn;
    const stageDates = { [L.stage]: stageEnteredOn };
    for (let i = stageIdx - 1; i >= 0; i--) {
      cursor = addDays(cursor, -(STAGE_SLA[STAGES[i]] || 2));
      stageDates[STAGES[i]] = cursor;
    }
    const originatedOn = stageDates[STAGES[0]] || stageEnteredOn;
    const sanctionDate = L.sanctioned > 0 ? stageDates['Risk and Sanction'] || stageEnteredOn : null;

    const sanctionedTotal = round2(
      L.facilities.reduce((s, f) => s + (f.sanctioned ?? 0), 0),
    );
    const requestedTotal = round2(L.facilities.reduce((s, f) => s + f.requested, 0));

    // Invariant 2: sanctioned must sit under the risk-assessed ceiling. Give ~8%
    // headroom so it is under the cap but not suspiciously round.
    const maxRecommended = round2((sanctionedTotal || requestedTotal) * 1.08);

    loans.push({
      ref: L.ref,
      borrowerName: L.borrower,
      product: L.product,
      sector: b.sector,
      stage: L.stage,
      state: L.state,
      rating: L.rating,
      requestedCr: requestedTotal,
      sanctionedCr: sanctionedTotal,
      stageEnteredOn,
      slaDays,
      slaBreached: slaDays > 0 && L.daysInStage > slaDays,
      originatedOn,
      sanctionDate,
      planted: L.planted || null,
    });

    // ── Facilities
    L.facilities.forEach((f, i) => {
      facilities.push({
        title: `${L.ref} · ${f.type}`,
        loanRef: L.ref,
        borrowerName: L.borrower,
        type: f.type,
        requestedCr: f.requested,
        sanctionedCr: f.sanctioned ?? null,
        tenorMonths: f.tenor,
        moratoriumMonths: f.moratorium ?? 0,
        interestBasis: 'Repo Linked',
        spreadBps: grade.spread,
        allInRatePct: round2(REPO + grade.spread / 100),
        processingFeePct: 0.35,
        repaymentFrequency: f.freq,
        endUse:
          f.type === 'Cash Credit' || f.type === 'Overdraft' || f.type === 'WCDL'
            ? 'Working capital gap — inventory and receivables cycle'
            : f.type === 'Bank Guarantee' || f.type === 'Letter of Credit'
              ? 'Non-fund based limit for supplier and tender obligations'
              : 'Capital expenditure — plant, machinery and civil works',
        securityType: f.security,
        status: f.status,
      });
    });

    // ── Collateral (secured files only)
    const secured = L.facilities.some((f) => f.security !== 'Unsecured');
    if (secured && stageIdx >= 3) {
      const base = requestedTotal;
      const market = round2(base * 1.62);
      const realizable = round2(market * 0.85);
      const distress = round2(realizable * 0.78);
      const valuationDate = addDays(sanctionDate || stageEnteredOn, -21);
      const defective = L.ref === 'LN-2026-0036'; // the declined file

      collateral.push({
        title: `${L.ref} · Industrial property, ${b.city}`,
        loanRef: L.ref,
        type: 'Industrial Property',
        description: `Factory land and building at ${b.city}, ${b.state}`,
        ownerName: L.borrower,
        location: `${b.city}, ${b.state}`,
        valuerName: 'Sundaram & Associates, Cat-I Valuers',
        valuationDate,
        marketValueCr: market,
        realizableValueCr: realizable,
        distressValueCr: distress,
        // Invariant 4: LTV is derived, never typed.
        ltvPct: round2(((sanctionedTotal || requestedTotal) / realizable) * 100),
        nextRevaluationDue: addDays(valuationDate, 365 * 3),
        advocateName: 'K. Raghunathan, Advocate',
        titleSearchYears: 13,
        chainOfTitleVerified: !defective,
        encumbrance: defective ? 'Encumbered' : 'Clear',
        litigation: defective ? 'Pending Litigation' : 'Clear',
        legalOpinion: defective ? 'Defective' : stageIdx >= 4 ? 'Clear' : 'Awaited',
        opinionDate: addDays(valuationDate, 9),
        chargeType: 'First Charge',
        chargeRegistered: L.planted !== 'blocked-tranche' && sanctionedTotal > 0,
        cersaiRef: sanctionedTotal > 0 ? `CERSAI/${L.ref.slice(-4)}/2026` : '',
      });

      // A second, different collateral type on the largest file — so more than one
      // collateral type appears in the data.
      if (L.ref === 'LN-2026-0007') {
        collateral.push({
          title: `${L.ref} · Plant and machinery`,
          loanRef: L.ref, type: 'Plant and Machinery',
          description: 'Imported granulation and coating lines',
          ownerName: L.borrower, location: `${b.city}, ${b.state}`,
          valuerName: 'Deloitte Valuation Advisory', valuationDate,
          marketValueCr: 48.5, realizableValueCr: 38.8, distressValueCr: 29.1,
          ltvPct: 62.4, nextRevaluationDue: addDays(valuationDate, 365 * 2),
          advocateName: 'K. Raghunathan, Advocate', titleSearchYears: 13,
          chainOfTitleVerified: true, encumbrance: 'Clear', litigation: 'Clear',
          legalOpinion: 'Clear with Conditions', opinionDate: addDays(valuationDate, 9),
          chargeType: 'Pari Passu', chargeRegistered: true,
          cersaiRef: 'CERSAI/0007B/2026',
        });
      }
    }

    // ── Risk assessment (from Credit Appraisal onwards)
    if (stageIdx >= 2) {
      const jitter = (n, d) => round2(n + d);
      const financial = grade.score + 2;
      const management = grade.score - 3;
      const industry = grade.score + 1;
      const compliance = b.kyc === 'Verified' ? grade.score + 5 : grade.score - 8;
      const collateralScore = secured ? grade.score + 4 : grade.score - 12;
      // Invariant 6: composite is the weighted sum, computed not typed.
      const composite = round2(
        financial * 0.35 + management * 0.2 + industry * 0.15 + compliance * 0.1 + collateralScore * 0.2,
      );

      risks.push({
        title: `${L.ref} · Credit appraisal`,
        loanRef: L.ref,
        assessmentDate: stageDates['Credit Appraisal'],
        financialScore: financial,
        managementScore: management,
        industryScore: industry,
        complianceScore: compliance,
        collateralScore,
        compositeScore: composite,
        grade: L.rating,
        pdPct: grade.pd,
        lgdPct: secured ? 35 : 65,
        dscr: jitter(L.declined ? 0.94 : 1.62, 0),
        debtToEbitda: round2((sanctionedTotal || requestedTotal) / (b.ebitda || 1)),
        currentRatio: L.declined ? 0.88 : 1.34,
        keyRisks: L.declined
          ? 'Negative DSCR at stressed pricing; promoter contribution unmet; KYC deficient.'
          : `${b.sector} demand cyclicality; receivable concentration with top-3 buyers at 41%.`,
        mitigants: L.declined
          ? 'None adequate at proposed structure.'
          : 'First charge on factory land and building; personal guarantee of promoter; monthly stock statements.',
        recommendation: L.declined
          ? 'Decline'
          : L.planted === 'deviation'
            ? 'Refer to Committee'
            : secured
              ? 'Approve with Conditions'
              : 'Approve',
        maxRecommendedExposureCr: maxRecommended,
      });
    }

    // ── Sanction conditions (sanctioned files only — invariant 25)
    if (sanctionedTotal > 0) {
      const blocked = L.planted === 'blocked-tranche';
      conditions.push(
        {
          title: `${L.ref} · Charge registration`,
          loanRef: L.ref,
          text: 'Registration of first charge on factory land and building with CERSAI and ROC.',
          category: 'Pre-Disbursement', type: 'Security Perfection',
          owner: OPS, dueDate: addDays(sanctionDate, 14), frequency: 'One Time',
          status: blocked ? 'Open' : 'Complied',
          verifiedBy: blocked ? null : OPS,
          verifiedDate: blocked ? null : addDays(sanctionDate, 11),
          waiverAuthority: 'Head of Credit',
          blocksDisbursement: true,
        },
        {
          title: `${L.ref} · Insurance assignment`,
          loanRef: L.ref,
          text: 'Comprehensive insurance of secured assets with bank clause, assigned in favour of the bank.',
          category: 'Continuing Covenant', type: 'Insurance',
          owner: OPS, dueDate: addDays(today, L.ref === 'LN-2026-0012' ? -6 : 24),
          frequency: 'Annual',
          status: L.ref === 'LN-2026-0012' ? 'Breached' : 'Complied',
          verifiedBy: L.ref === 'LN-2026-0012' ? null : OPS,
          verifiedDate: L.ref === 'LN-2026-0012' ? null : addDays(sanctionDate, 20),
          waiverAuthority: 'Credit Manager',
          blocksDisbursement: false,
        },
        {
          title: `${L.ref} · Stock statement`,
          loanRef: L.ref,
          text: 'Monthly stock and book-debt statement to be submitted by the 10th of the following month.',
          category: 'Post-Disbursement', type: 'Documentary',
          owner: RM, dueDate: addDays(today, 4), frequency: 'Monthly',
          status: 'Open', verifiedBy: null, verifiedDate: null,
          waiverAuthority: 'Credit Manager', blocksDisbursement: false,
        },
        {
          title: `${L.ref} · DSCR covenant`,
          loanRef: L.ref,
          text: 'Debt service coverage ratio to be maintained above 1.25x, tested on annual audited financials.',
          category: 'Continuing Covenant', type: 'Financial Covenant',
          owner: CREDIT, dueDate: addDays(today, 96), frequency: 'Annual',
          status: 'Open', verifiedBy: null, verifiedDate: null,
          waiverAuthority: 'Credit Committee', blocksDisbursement: false,
        },
        {
          title: `${L.ref} · End-use certificate`,
          loanRef: L.ref,
          text: 'Chartered accountant certificate confirming end-use of disbursed funds.',
          category: 'Post-Disbursement', type: 'Regulatory',
          owner: RM, dueDate: addDays(sanctionDate, 45), frequency: 'One Time',
          status: L.ref === 'LN-2026-0018' ? 'Waived' : 'Complied',
          verifiedBy: L.ref === 'LN-2026-0018' ? null : CREDIT,
          verifiedDate: L.ref === 'LN-2026-0018' ? null : addDays(sanctionDate, 40),
          waiverAuthority: 'Head of Credit', blocksDisbursement: false,
        },
      );

      // ── Tranches. Invariant 1: the split SUMS to the sanctioned amount, always.
      for (const f of L.facilities.filter((x) => (x.sanctioned ?? 0) > 0)) {
        const amt = f.sanctioned;
        const isTermish = f.type === 'Term Loan';
        const parts = isTermish ? [round2(amt * 0.6), round2(amt - round2(amt * 0.6))] : [amt];

        parts.forEach((part, i) => {
          const trancheNo = i + 1;
          const scheduled = addDays(sanctionDate, 14 + i * 30);
          const isBlockedOne = blocked && trancheNo === 2;
          const released = !isBlockedOne && (L.stage === 'Post Disbursement Monitoring' || trancheNo === 1);

          tranches.push({
            title: `${L.ref} · ${f.type} tranche ${trancheNo}`,
            loanRef: L.ref,
            facilityRef: `${L.ref} · ${f.type}`,
            trancheNo,
            amountCr: part,
            scheduledDate: scheduled,
            requestedDate: addDays(scheduled, -3),
            actualDate: released ? scheduled : null,
            purpose: isTermish ? 'Equipment purchase and civil works' : 'Working capital drawdown',
            beneficiaryAccount: `XXXXXX${(4200 + trancheNo).toString()}`,
            mode: part > 20 ? 'RTGS' : 'NEFT',
            preconditionsMet: !isBlockedOne,
            blockedReason: isBlockedOne
              ? 'Pre-disbursement condition open: first charge not yet registered with CERSAI'
              : '',
            releasedBy: released ? OPS : null,
            utilizationCertificate: released && L.stage === 'Post Disbursement Monitoring',
            status: isBlockedOne ? 'Blocked' : released ? 'Released' : 'Scheduled',
          });
        });
      }
    }
  }

  return { borrowers: BORROWERS, loans, facilities, collateral, risks, conditions, tranches };
}

export const DATASET = build();

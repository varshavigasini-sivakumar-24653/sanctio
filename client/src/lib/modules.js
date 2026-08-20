// The six custom modules, as the UI presents them.
//
// `columns` are the fields worth a table column — not every field, because a 20-column
// table is unreadable. The record drawer shows everything. Keys are the human labels
// the BFF maps derived API names onto (see functions/sanctio_api/projects.js).

export const MODULES = [
  {
    api: 'borrower',
    icon: 'building',
    label: 'Borrowers',
    singular: 'Borrower',
    blurb: 'Corporate entities, co-borrowers and guarantors',
    title: 'name',
    columns: [
      { key: 'name', label: 'Entity', width: 220 },
      { key: 'Entity Role', label: 'Role', type: 'pill', width: 110 },
      { key: 'Industry Sector', label: 'Sector', width: 140 },
      { key: 'Group Name', label: 'Group', width: 150 },
      { key: 'Internal Rating', label: 'Rating', type: 'num', width: 70 },
      { key: 'Annual Turnover Cr', label: 'Turnover', type: 'money', width: 110 },
      { key: 'Existing Group Exposure Cr', label: 'Group exposure', type: 'money', width: 130 },
      { key: 'KYC Status', label: 'KYC', type: 'pill', width: 110 },
    ],
  },
  {
    api: 'facility',
    icon: 'layers',
    label: 'Facilities',
    singular: 'Facility',
    blurb: 'Individual credit limits inside each sanction',
    title: 'name',
    columns: [
      { key: 'Loan Reference', label: 'Loan', type: 'ref', width: 120 },
      { key: 'Borrower Name', label: 'Borrower', width: 180 },
      { key: 'Facility Type', label: 'Type', width: 130 },
      { key: 'Amount Requested Cr', label: 'Requested', type: 'money', width: 110 },
      { key: 'Amount Sanctioned Cr', label: 'Sanctioned', type: 'money', width: 110 },
      { key: 'Tenor Months', label: 'Tenor', type: 'months', width: 80 },
      { key: 'All In Rate Pct', label: 'Rate', type: 'pct', width: 80 },
      { key: 'Facility Status', label: 'Status', type: 'pill', width: 120 },
    ],
  },
  {
    api: 'collateral',
    icon: 'shield',
    label: 'Collateral & Valuations',
    singular: 'Collateral',
    blurb: 'Security offered, its valuation and legal clearance',
    title: 'name',
    columns: [
      { key: 'Loan Reference', label: 'Loan', type: 'ref', width: 120 },
      { key: 'Collateral Type', label: 'Type', width: 160 },
      { key: 'Market Value Cr', label: 'Market', type: 'money', width: 105 },
      { key: 'Realizable Value Cr', label: 'Realizable', type: 'money', width: 105 },
      { key: 'LTV Pct', label: 'LTV', type: 'pct', width: 80 },
      { key: 'Legal Opinion', label: 'Legal opinion', type: 'pill', width: 150 },
      { key: 'Charge Type', label: 'Charge', width: 120 },
      { key: 'Charge Registered', label: 'Registered', type: 'bool', width: 100 },
    ],
  },
  {
    api: 'risk_assessment',
    icon: 'gauge',
    label: 'Risk Assessments',
    singular: 'Risk Assessment',
    blurb: 'Scored credit appraisals, one per round',
    title: 'name',
    columns: [
      { key: 'Loan Reference', label: 'Loan', type: 'ref', width: 120 },
      { key: 'Assessment Date', label: 'Assessed', type: 'date', width: 110 },
      { key: 'Composite Score', label: 'Score', type: 'num', width: 75 },
      { key: 'Internal Rating Grade', label: 'Grade', type: 'num', width: 70 },
      { key: 'DSCR', label: 'DSCR', type: 'ratio', width: 75 },
      { key: 'Debt to EBITDA', label: 'Debt/EBITDA', type: 'ratio', width: 100 },
      { key: 'Probability of Default Pct', label: 'PD', type: 'pct', width: 75 },
      { key: 'Recommendation', label: 'Recommendation', type: 'pill', width: 170 },
    ],
  },
  {
    api: 'sanction_condition',
    icon: 'clipboard',
    label: 'Sanction Conditions',
    singular: 'Sanction Condition',
    blurb: 'Pre-disbursement conditions and continuing covenants',
    title: 'Condition Text',
    columns: [
      { key: 'Loan Reference', label: 'Loan', type: 'ref', width: 120 },
      { key: 'Condition Text', label: 'Condition', width: 300 },
      { key: 'Category', label: 'Category', width: 150 },
      { key: 'Condition Type', label: 'Type', width: 150 },
      { key: 'Due Date', label: 'Due', type: 'date', width: 110 },
      { key: 'Compliance Status', label: 'Status', type: 'pill', width: 110 },
      { key: 'Blocks Disbursement', label: 'Blocks', type: 'bool', width: 90 },
    ],
  },
  {
    api: 'disbursement_tranche',
    icon: 'banknote',
    label: 'Disbursement Tranches',
    singular: 'Disbursement Tranche',
    blurb: 'Scheduled and actual money movement',
    title: 'name',
    columns: [
      { key: 'Loan Reference', label: 'Loan', type: 'ref', width: 120 },
      { key: 'Tranche No', label: '#', type: 'num', width: 50 },
      { key: 'Amount Cr', label: 'Amount', type: 'money', width: 110 },
      { key: 'Scheduled Date', label: 'Scheduled', type: 'date', width: 110 },
      { key: 'Actual Disbursement Date', label: 'Released', type: 'date', width: 110 },
      { key: 'Payment Mode', label: 'Mode', width: 90 },
      { key: 'Tranche Status', label: 'Status', type: 'pill', width: 110 },
      { key: 'Blocked Reason', label: 'Blocked reason', width: 220 },
    ],
  },
];

export const moduleByApi = (api) => MODULES.find((m) => m.api === api);

/* Status vocabulary -> pill tone. Kept in one place so "Breached" is critical
 * everywhere and never drifts between screens. */
const TONES = {
  // good
  Complied: 'good', Verified: 'good', Released: 'good', Sanctioned: 'good',
  Clear: 'good', Approve: 'good', 'First Charge': 'good',
  // warning
  Open: 'warning', Pending: 'warning', 'In Progress': 'warning', Scheduled: 'warning',
  Requested: 'warning', Proposed: 'warning', Awaited: 'warning', 'Approve with Conditions': 'warning',
  'Clear with Conditions': 'warning', 'Refer to Committee': 'warning',
  // serious
  Recommended: 'serious', Encumbered: 'serious', 'Pending Litigation': 'serious',
  // critical
  Breached: 'critical', Blocked: 'critical', Defective: 'critical', Deficient: 'critical',
  Decline: 'critical', Rejected: 'critical', 'Not Obtained': 'critical',
  // neutral
  Waived: 'neutral', Cancelled: 'neutral', Withdrawn: 'neutral', 'Not Done': 'neutral',
  Borrower: 'neutral', 'Co-Borrower': 'neutral', Guarantor: 'neutral',
};

export const toneFor = (value) => TONES[value] || 'neutral';

// Sanctio — full custom-module schema.
//
// Field types are the REAL Zoho Projects vocabulary, not the documented examples.
// See ../BROKE.md #1 — `Double`/`Numeric`/`Date` are capitalised, `singleline`/`picklist`
// are not, and a wrong value returns a 500 rather than a validation error.
//
// `opts` on a picklist is applied through the bulk-options API after the field exists.
// API names are auto-derived from `label` (spaces/punctuation -> underscores), so labels
// avoid slashes and parentheses to keep the derived names clean. See BROKE.md #3.

export const MODULES = [
  {
    api: 'borrower',
    label: 'Borrowers',
    fields: [
      { label: 'Entity Role', type: 'picklist', opts: ['Borrower', 'Co-Borrower', 'Guarantor'] },
      { label: 'Constitution', type: 'picklist', opts: ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust'] },
      { label: 'CIN Registration No', type: 'singleline' },
      { label: 'PAN', type: 'singleline' },
      { label: 'GSTIN', type: 'singleline' },
      { label: 'Industry Sector', type: 'picklist', opts: ['Manufacturing', 'Infrastructure', 'Pharmaceuticals', 'Textiles', 'Logistics', 'IT and ITES', 'Retail', 'Agri Processing', 'Chemicals', 'Auto Components'] },
      { label: 'Group Name', type: 'singleline' },
      { label: 'Date of Incorporation', type: 'Date' },
      { label: 'Registered Address', type: 'multiline' },
      { label: 'City', type: 'singleline' },
      { label: 'Annual Turnover Cr', type: 'Double', precision: '2' },
      { label: 'EBITDA Cr', type: 'Double', precision: '2' },
      { label: 'Net Worth Cr', type: 'Double', precision: '2' },
      { label: 'Existing Group Exposure Cr', type: 'Double', precision: '2' },
      { label: 'Internal Rating', type: 'picklist', opts: ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'] },
      { label: 'KYC Status', type: 'picklist', opts: ['Pending', 'In Progress', 'Verified', 'Deficient'] },
      { label: 'KYC Documents Complete', type: 'checkbox' },
      { label: 'Banking Since', type: 'Date' },
      { label: 'Relationship Manager', type: 'userpicklist' },
    ],
  },

  {
    api: 'facility',
    label: 'Facilities',
    fields: [
      { label: 'Loan Reference', type: 'singleline' },
      { label: 'Borrower Name', type: 'singleline' },
      { label: 'Facility Type', type: 'picklist', opts: ['Term Loan', 'Cash Credit', 'Overdraft', 'Bank Guarantee', 'Letter of Credit', 'WCDL'] },
      { label: 'Amount Requested Cr', type: 'Double', precision: '2' },
      { label: 'Amount Sanctioned Cr', type: 'Double', precision: '2' },
      { label: 'Tenor Months', type: 'Numeric' },
      { label: 'Moratorium Months', type: 'Numeric' },
      { label: 'Interest Basis', type: 'picklist', opts: ['Repo Linked', 'MCLR', 'Fixed'] },
      { label: 'Spread bps', type: 'Numeric' },
      { label: 'All In Rate Pct', type: 'Double', precision: '2' },
      { label: 'Processing Fee Pct', type: 'Double', precision: '2' },
      { label: 'Repayment Frequency', type: 'picklist', opts: ['Monthly', 'Quarterly', 'Bullet', 'On Demand'] },
      { label: 'End Use', type: 'multiline' },
      { label: 'Security Type', type: 'picklist', opts: ['Primary', 'Collateral', 'Unsecured'] },
      { label: 'Facility Status', type: 'picklist', opts: ['Proposed', 'Recommended', 'Sanctioned', 'Rejected', 'Withdrawn'] },
    ],
  },

  {
    api: 'collateral',
    label: 'Collateral and Valuations',
    sections: ['Valuation', 'Legal Due Diligence', 'Charge Creation'],
    fields: [
      { label: 'Loan Reference', type: 'singleline' },
      { label: 'Collateral Type', type: 'picklist', opts: ['Industrial Property', 'Commercial Property', 'Residential Property', 'Plant and Machinery', 'Stock and Book Debts', 'Fixed Deposit Lien', 'Personal Guarantee'] },
      { label: 'Description', type: 'multiline' },
      { label: 'Owner Name', type: 'singleline' },
      { label: 'Location', type: 'singleline' },

      { label: 'Valuer Name', type: 'singleline', section: 'Valuation' },
      { label: 'Valuation Date', type: 'Date', section: 'Valuation' },
      { label: 'Market Value Cr', type: 'Double', precision: '2', section: 'Valuation' },
      { label: 'Realizable Value Cr', type: 'Double', precision: '2', section: 'Valuation' },
      { label: 'Distress Value Cr', type: 'Double', precision: '2', section: 'Valuation' },
      { label: 'LTV Pct', type: 'Double', precision: '2', section: 'Valuation' },
      { label: 'Next Revaluation Due', type: 'Date', section: 'Valuation' },

      { label: 'Advocate Name', type: 'singleline', section: 'Legal Due Diligence' },
      { label: 'Title Search Period Years', type: 'Numeric', section: 'Legal Due Diligence' },
      { label: 'Chain of Title Verified', type: 'checkbox', section: 'Legal Due Diligence' },
      { label: 'Encumbrance Certificate', type: 'picklist', opts: ['Clear', 'Encumbered', 'Not Obtained'], section: 'Legal Due Diligence' },
      { label: 'Litigation Search', type: 'picklist', opts: ['Clear', 'Pending Litigation', 'Not Done'], section: 'Legal Due Diligence' },
      { label: 'Legal Opinion', type: 'picklist', opts: ['Clear', 'Clear with Conditions', 'Defective', 'Awaited'], section: 'Legal Due Diligence' },
      { label: 'Opinion Date', type: 'Date', section: 'Legal Due Diligence' },

      { label: 'Charge Type', type: 'picklist', opts: ['First Charge', 'Second Charge', 'Pari Passu', 'Negative Lien'], section: 'Charge Creation' },
      { label: 'Charge Registered', type: 'checkbox', section: 'Charge Creation' },
      { label: 'CERSAI Filing Ref', type: 'singleline', section: 'Charge Creation' },
    ],
  },

  {
    api: 'risk_assessment',
    label: 'Risk Assessments',
    fields: [
      { label: 'Loan Reference', type: 'singleline' },
      { label: 'Assessment Date', type: 'Date' },
      { label: 'Assessed By', type: 'userpicklist' },
      { label: 'Financial Score', type: 'Numeric' },
      { label: 'Management Score', type: 'Numeric' },
      { label: 'Industry Score', type: 'Numeric' },
      { label: 'Compliance Score', type: 'Numeric' },
      { label: 'Collateral Score', type: 'Numeric' },
      { label: 'Composite Score', type: 'Double', precision: '2' },
      { label: 'Internal Rating Grade', type: 'picklist', opts: ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'] },
      { label: 'Probability of Default Pct', type: 'Double', precision: '2' },
      { label: 'Loss Given Default Pct', type: 'Double', precision: '2' },
      { label: 'DSCR', type: 'Double', precision: '2' },
      { label: 'Debt to EBITDA', type: 'Double', precision: '2' },
      { label: 'Current Ratio', type: 'Double', precision: '2' },
      { label: 'Key Risks', type: 'multiline' },
      { label: 'Mitigants', type: 'multiline' },
      { label: 'Recommendation', type: 'picklist', opts: ['Approve', 'Approve with Conditions', 'Refer to Committee', 'Decline'] },
      { label: 'Max Recommended Exposure Cr', type: 'Double', precision: '2' },
    ],
  },

  {
    api: 'sanction_condition',
    label: 'Sanction Conditions',
    fields: [
      { label: 'Loan Reference', type: 'singleline' },
      { label: 'Condition Text', type: 'multiline' },
      { label: 'Category', type: 'picklist', opts: ['Pre-Disbursement', 'Post-Disbursement', 'Continuing Covenant'] },
      { label: 'Condition Type', type: 'picklist', opts: ['Documentary', 'Security Perfection', 'Financial Covenant', 'Regulatory', 'Insurance'] },
      { label: 'Owner', type: 'userpicklist' },
      { label: 'Due Date', type: 'Date' },
      { label: 'Frequency', type: 'picklist', opts: ['One Time', 'Monthly', 'Quarterly', 'Half Yearly', 'Annual'] },
      { label: 'Compliance Status', type: 'picklist', opts: ['Open', 'Complied', 'Waived', 'Breached'] },
      { label: 'Verified By', type: 'userpicklist' },
      { label: 'Verified Date', type: 'Date' },
      { label: 'Waiver Authority', type: 'picklist', opts: ['Credit Manager', 'Head of Credit', 'Credit Committee'] },
      { label: 'Blocks Disbursement', type: 'checkbox' },
    ],
  },

  {
    api: 'disbursement_tranche',
    label: 'Disbursement Tranches',
    fields: [
      { label: 'Loan Reference', type: 'singleline' },
      { label: 'Facility Reference', type: 'singleline' },
      { label: 'Tranche No', type: 'Numeric' },
      { label: 'Amount Cr', type: 'Double', precision: '2' },
      { label: 'Scheduled Date', type: 'Date' },
      { label: 'Requested Date', type: 'Date' },
      { label: 'Actual Disbursement Date', type: 'Date' },
      { label: 'Purpose End Use', type: 'multiline' },
      { label: 'Beneficiary Account', type: 'singleline' },
      { label: 'Payment Mode', type: 'picklist', opts: ['RTGS', 'NEFT', 'Internal Transfer'] },
      { label: 'Preconditions Met', type: 'checkbox' },
      { label: 'Blocked Reason', type: 'multiline' },
      { label: 'Released By', type: 'userpicklist' },
      { label: 'Utilization Certificate Received', type: 'checkbox' },
      { label: 'Tranche Status', type: 'picklist', opts: ['Scheduled', 'Requested', 'Blocked', 'Released', 'Cancelled'] },
    ],
  },
];

// The 7 lending stages, applied as Phases on every loan-file Project.
export const PHASES = [
  { name: 'Origination and Lead Capture', slaDays: 2, owner: 'rm' },
  { name: 'Document Collection and KYC', slaDays: 5, owner: 'rm' },
  { name: 'Credit Appraisal', slaDays: 7, owner: 'credit' },
  { name: 'Valuation and Legal Due Diligence', slaDays: 10, owner: 'credit' },
  { name: 'Risk and Sanction', slaDays: 5, owner: 'credit' },
  { name: 'Documentation and Disbursement', slaDays: 7, owner: 'ops' },
  { name: 'Post Disbursement Monitoring', slaDays: 0, owner: 'ops' },
];

// Loan-level attributes live as custom fields on the Project itself.
export const PROJECT_FIELDS = [
  { label: 'Loan Reference', type: 'singleline' },
  { label: 'Borrower Name', type: 'singleline' },
  { label: 'Loan Product', type: 'picklist', opts: ['Working Capital', 'Term Loan', 'Project Finance', 'Trade Finance', 'Equipment Finance'] },
  { label: 'Total Requested Cr', type: 'Double', precision: '2' },
  { label: 'Total Sanctioned Cr', type: 'Double', precision: '2' },
  { label: 'Current Stage', type: 'picklist', opts: PHASES.map((p) => p.name) },
  { label: 'Workflow State', type: 'picklist', opts: ['Draft', 'Submitted', 'Under Appraisal', 'Deviation Pending', 'Recommended', 'Sanctioned', 'Declined', 'On Hold', 'Documentation', 'Disbursed', 'Under Monitoring', 'Closed'] },
  { label: 'Internal Rating', type: 'picklist', opts: ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C', 'D'] },
  { label: 'Stage Entered On', type: 'Date' },
  { label: 'Stage SLA Days', type: 'Numeric' },
  { label: 'SLA Breached', type: 'checkbox' },
  { label: 'Sector', type: 'picklist', opts: ['Manufacturing', 'Infrastructure', 'Pharmaceuticals', 'Textiles', 'Logistics', 'IT and ITES', 'Retail', 'Agri Processing', 'Chemicals', 'Auto Components'] },
];

// The seven workflow stages, shared between Pipeline and Deal Desk so the board,
// the donut and the bar chart never drift out of sync on labels or colour.

export const STAGES = [
  'Origination and Lead Capture',
  'Document Collection and KYC',
  'Credit Appraisal',
  'Valuation and Legal Due Diligence',
  'Risk and Sanction',
  'Documentation and Disbursement',
  'Post Disbursement Monitoring',
];

export const SHORT = {
  'Origination and Lead Capture': 'Origination',
  'Document Collection and KYC': 'Docs & KYC',
  'Credit Appraisal': 'Appraisal',
  'Valuation and Legal Due Diligence': 'Legal',
  'Risk and Sanction': 'Sanction',
  'Documentation and Disbursement': 'Disbursement',
  'Post Disbursement Monitoring': 'Monitoring',
};

// Cool-to-warm progression across the seven stages — reads as "money moving toward
// disbursement" and doubles as the shared key between the board, the donut and the
// bar chart.
export const STAGE_COLOR = {
  'Origination and Lead Capture': '#4F46E5',
  'Document Collection and KYC': '#6366F1',
  'Credit Appraisal': '#818CF8',
  'Valuation and Legal Due Diligence': '#0EA5E9',
  'Risk and Sanction': '#06B6D4',
  'Documentation and Disbursement': '#F59E0B',
  'Post Disbursement Monitoring': '#10B981',
};

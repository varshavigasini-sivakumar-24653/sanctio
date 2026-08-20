import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Money, Pill, Skeleton, Avatar } from '../components/ui';
import AttentionFeed from '../components/AttentionFeed';
import { SLA_LABEL, date, days, slaState } from '../lib/format';

const STAGES = [
  'Origination and Lead Capture',
  'Document Collection and KYC',
  'Credit Appraisal',
  'Valuation and Legal Due Diligence',
  'Risk and Sanction',
  'Documentation and Disbursement',
  'Post Disbursement Monitoring',
];

const SHORT = {
  'Origination and Lead Capture': 'Origination',
  'Document Collection and KYC': 'Docs & KYC',
  'Credit Appraisal': 'Appraisal',
  'Valuation and Legal Due Diligence': 'Valuation & Legal',
  'Risk and Sanction': 'Sanction',
  'Documentation and Disbursement': 'Disbursement',
  'Post Disbursement Monitoring': 'Monitoring',
};

function LoanCard({ loan }) {
  const tone = slaState(loan.daysInStage, loan.slaDays);
  return (
    <Link
      to={`/loans/${encodeURIComponent(loan.loanReference)}`}
      className="card stack gap-8"
      style={{ padding: 12, textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div className="row gap-8">
        <span className="t-meta num grow">{loan.loanReference}</span>
        <Pill tone={tone}>{SLA_LABEL[tone]}</Pill>
      </div>

      <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.35 }}>{loan.borrowerName}</div>

      <div className="row gap-8">
        <Money cr={loan.totalRequestedCr} bold />
        {loan.internalRating && <span className="t-meta num">{loan.internalRating}</span>}
      </div>

      <div className="row gap-8">
        <span className="t-meta grow">{days(loan.daysInStage)} in stage</span>
        {loan.owner && <Avatar name={loan.owner} size={20} />}
      </div>
    </Link>
  );
}

function Column({ stage, loans }) {
  const total = loans.reduce((s, l) => s + (l.totalRequestedCr || 0), 0);
  return (
    <div className="stack gap-8" style={{ minWidth: 276, width: 276, flex: 'none' }}>
      <div className="row gap-8" style={{ paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        <span className="t-section grow">
          {SHORT[stage] || stage}
        </span>
        <span className="t-meta num">{loans.length}</span>
      </div>
      <div className="t-meta num" style={{ marginTop: -4 }}>
        <Money cr={total} />
      </div>

      <div className="stack gap-8">
        {loans.length === 0 ? (
          <div
            className="t-meta center"
            style={{
              padding: '20px 8px',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--r-md)',
            }}
          >
            No files
          </div>
        ) : (
          loans.map((l) => <LoanCard key={l.loanReference} loan={l} />)
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { data, error, loading, reload } = useAsync(() => api.pipeline(), []);

  return (
    <div className="stack gap-16" style={{ padding: 24 }}>
      <div className="row gap-16">
        <div className="stack gap-4 grow">
          <h1 className="t-page-title">Pipeline</h1>
          <span className="t-meta">
            {loading
              ? 'Loading loan files…'
              : data
                ? `${data.loans.length} live files · ${date(new Date())}`
                : ''}
          </span>
        </div>
      </div>

      <AttentionFeed />

      {loading && (
        <div className="row gap-16 scroll-x" style={{ alignItems: 'flex-start' }}>
          {STAGES.slice(0, 5).map((s) => (
            <div key={s} className="stack gap-8" style={{ width: 276, flex: 'none' }}>
              <Skeleton height={14} width={120} />
              <Skeleton height={92} radius={10} />
              <Skeleton height={92} radius={10} />
            </div>
          ))}
        </div>
      )}

      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.loans.length === 0 && (
        <EmptyState
          title="No loan files yet"
          hint="Seed the demo data with scripts/seed.mjs, or create a file from the Relationship Manager view."
        />
      )}

      {data && data.loans.length > 0 && (
        <div className="row gap-16 scroll-x" style={{ alignItems: 'flex-start', paddingBottom: 8 }}>
          {STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              loans={data.loans.filter((l) => l.currentStage === stage)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

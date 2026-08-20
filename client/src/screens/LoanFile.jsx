import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Avatar, EmptyState, ErrorState, Money, Pill, Skeleton } from '../components/ui';
import { SLA_LABEL, date, days, pct, ratio, slaState } from '../lib/format';
import { useAuth } from '../lib/providers';

const STAGES = [
  'Origination and Lead Capture',
  'Document Collection and KYC',
  'Credit Appraisal',
  'Valuation and Legal Due Diligence',
  'Risk and Sanction',
  'Documentation and Disbursement',
  'Post Disbursement Monitoring',
];

/* Horizontal stage rail with actual TAT under each completed stage. The numbers come
 * from Zoho Projects time logs, which is what makes the dashboard honest. */
function StageRail({ currentStage, stageTat = {} }) {
  const currentIndex = STAGES.indexOf(currentStage);
  return (
    <div className="row scroll-x" style={{ gap: 0, paddingBottom: 4 }}>
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage} className="stack gap-4" style={{ minWidth: 132, flex: 1 }}>
            <div className="row gap-4">
              <span
                style={{
                  height: 3,
                  flex: 1,
                  borderRadius: 2,
                  background: done || active ? 'var(--accent)' : 'var(--surface-3)',
                }}
              />
            </div>
            <span
              className="t-meta"
              style={{
                color: active ? 'var(--text-primary)' : undefined,
                fontWeight: active ? 600 : 400,
                paddingRight: 8,
              }}
            >
              {stage}
            </span>
            <span className="t-meta num">
              {stageTat[stage] != null ? days(stageTat[stage]) : done ? '—' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="row gap-12" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="t-meta" style={{ width: 168, flex: 'none' }}>
        {label}
      </span>
      <span className="grow" style={{ fontSize: 13 }}>
        {children}
      </span>
    </div>
  );
}

const TABS = ['Facilities', 'Collateral', 'Risk', 'Conditions', 'Tranches', 'Audit trail'];

export default function LoanFile() {
  const { ref } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState('Facilities');
  const { data, error, loading, reload } = useAsync(() => api.loanFile(ref), [ref]);

  if (loading) {
    return (
      <div className="stack gap-16" style={{ padding: 24 }}>
        <Skeleton height={16} width={140} />
        <Skeleton height={28} width={320} />
        <Skeleton height={64} radius={10} />
        <Skeleton height={280} radius={10} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  const { loan, facilities = [], collateral = [], risk = [], conditions = [], tranches = [], audit = [] } = data;
  const tone = slaState(loan.daysInStage, loan.slaDays);

  const byTab = {
    Facilities: facilities,
    Collateral: collateral,
    Risk: risk,
    Conditions: conditions,
    Tranches: tranches,
    'Audit trail': audit,
  };

  return (
    <div className="stack gap-20" style={{ padding: 24 }}>
      <Link to="/pipeline" className="t-meta" style={{ textDecoration: 'none' }}>
        ← Pipeline
      </Link>

      {/* Header */}
      <div className="stack gap-12">
        <div className="row gap-12">
          <span className="t-meta num">{loan.loanReference}</span>
          <Pill tone={tone}>{SLA_LABEL[tone]}</Pill>
          <Pill tone="neutral">{loan.workflowState}</Pill>
        </div>

        <div className="row gap-24" style={{ flexWrap: 'wrap' }}>
          <h1 className="t-page-title grow" style={{ minWidth: 260 }}>
            {loan.borrowerName}
          </h1>
          <div className="row gap-24">
            <div className="stack gap-4">
              <span className="t-meta">Requested</span>
              <Money cr={loan.totalRequestedCr} bold />
            </div>
            <div className="stack gap-4">
              <span className="t-meta">Sanctioned</span>
              <Money cr={loan.totalSanctionedCr} bold />
            </div>
            <div className="stack gap-4">
              <span className="t-meta">Rating</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {loan.internalRating || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <StageRail currentStage={loan.currentStage} stageTat={loan.stageTat} />
      </div>

      {/* Summary + tabs */}
      <div className="row gap-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card stack" style={{ padding: 16, minWidth: 300, flex: '1 1 320px' }}>
          <span className="t-section" style={{ marginBottom: 8 }}>
            File
          </span>
          <Row label="Product">{loan.loanProduct || '—'}</Row>
          <Row label="Sector">{loan.sector || '—'}</Row>
          <Row label="Stage entered">{date(loan.stageEnteredOn)}</Row>
          <Row label="Stage SLA">{days(loan.slaDays)}</Row>
          <Row label="In stage">{days(loan.daysInStage)}</Row>
          <Row label="Relationship manager">
            {loan.owner ? (
              <span className="row gap-8">
                <Avatar name={loan.owner} size={20} />
                {loan.owner}
              </span>
            ) : (
              '—'
            )}
          </Row>
        </div>

        <div className="card stack" style={{ flex: '2 1 460px', minWidth: 320 }}>
          <div className="row gap-4 scroll-x" style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className="btn btn-ghost"
                onClick={() => setTab(t)}
                style={
                  tab === t
                    ? { background: 'var(--surface-2)', color: 'var(--text-primary)', fontWeight: 600 }
                    : undefined
                }
              >
                {t}
                <span className="t-meta num">{byTab[t].length}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: 16 }}>
            {byTab[tab].length === 0 ? (
              <EmptyState
                title={`No ${tab.toLowerCase()} yet`}
                hint={
                  tab === 'Conditions'
                    ? 'Sanction conditions are created when the file is sanctioned.'
                    : `Nothing recorded against this file at the ${loan.currentStage} stage.`
                }
              />
            ) : (
              <TabBody tab={tab} rows={byTab[tab]} can={can} onChange={reload} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBody({ tab, rows, can, onChange }) {
  if (tab === 'Conditions') {
    return (
      <div className="stack gap-8">
        {rows.map((c) => (
          <div key={c.id} className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="grow" style={{ fontSize: 13 }}>
              {c.conditionText}
              <span className="t-meta" style={{ display: 'block' }}>
                {c.category} · {c.conditionType} · due {date(c.dueDate)}
                {c.blocksDisbursement ? ' · blocks disbursement' : ''}
              </span>
            </span>
            <Pill
              tone={
                c.complianceStatus === 'Complied'
                  ? 'good'
                  : c.complianceStatus === 'Breached'
                    ? 'critical'
                    : c.complianceStatus === 'Waived'
                      ? 'neutral'
                      : 'warning'
              }
            >
              {c.complianceStatus}
            </Pill>
            {can('sanction_condition.verify') && c.complianceStatus === 'Open' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => api.verifyCondition(c.id, { status: 'Complied' }).then(onChange)}
              >
                Mark complied
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'Tranches') {
    return (
      <div className="stack gap-8">
        {rows.map((t) => (
          <div key={t.id} className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="num t-meta" style={{ width: 28 }}>
              #{t.trancheNo}
            </span>
            <span className="grow">
              <Money cr={t.amountCr} bold />
              <span className="t-meta" style={{ display: 'block' }}>
                scheduled {date(t.scheduledDate)}
                {t.blockedReason ? ` · ${t.blockedReason}` : ''}
              </span>
            </span>
            <Pill
              tone={
                t.trancheStatus === 'Released'
                  ? 'good'
                  : t.trancheStatus === 'Blocked'
                    ? 'critical'
                    : 'warning'
              }
            >
              {t.trancheStatus}
            </Pill>
            {can('disbursement_tranche') && t.trancheStatus !== 'Released' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => api.releaseTranche(t.id).then(onChange).catch(onChange)}
              >
                Release
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'Risk') {
    return (
      <div className="stack gap-16">
        {rows.map((r) => (
          <div key={r.id} className="stack gap-4">
            <div className="row gap-12">
              <span style={{ fontWeight: 600 }}>{r.internalRatingGrade}</span>
              <span className="t-meta num">score {r.compositeScore}</span>
              <span className="t-meta grow">{date(r.assessmentDate)}</span>
              <Pill tone={r.recommendation === 'Decline' ? 'critical' : 'good'}>{r.recommendation}</Pill>
            </div>
            <div className="row gap-16 t-meta num">
              <span>DSCR {ratio(r.dscr)}</span>
              <span>Debt/EBITDA {ratio(r.debtToEbitda)}</span>
              <span>PD {pct(r.probabilityOfDefaultPct)}</span>
            </div>
            {r.keyRisks && <span className="t-meta">{r.keyRisks}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Facilities, Collateral, Audit trail — generic key/value rendering.
  return (
    <div className="stack gap-8">
      {rows.map((r, i) => (
        <div key={r.id || i} className="stack gap-4" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.title || r.name || r.label || '—'}</span>
          <span className="t-meta">{r.summary || r.description || ''}</span>
        </div>
      ))}
    </div>
  );
}

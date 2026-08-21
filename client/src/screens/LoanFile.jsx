import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Avatar, EmptyState, ErrorState, Money, Pill, Skeleton } from '../components/ui';
import { SLA_LABEL, date, days, pct, ratio, slaState } from '../lib/format';
import { useAuth } from '../lib/providers';
import { toneFor } from '../lib/modules';
import AddBorrowerModal from '../components/AddBorrowerModal';
import AddFacilityModal from '../components/AddFacilityModal';

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

const TABS = ['Borrowers', 'Facilities', 'Collateral', 'Risk', 'Conditions', 'Tranches', 'Audit trail'];

export default function LoanFile() {
  const { ref } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState('Facilities');
  const [advancing, setAdvancing] = useState(false);
  const [addingBorrower, setAddingBorrower] = useState(false);
  const [addingFacility, setAddingFacility] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.loanFile(ref), [ref]);

  const advanceStage = async () => {
    setAdvancing(true);
    try {
      await api.advanceStage(ref);
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <div className="stack gap-4 p-6">
        <Skeleton height={16} width={140} />
        <Skeleton height={28} width={320} />
        <Skeleton height={64} radius={16} />
        <Skeleton height={280} radius={16} />
      </div>
    );
  }

  if (error) {
    // A wrong or stale reference isn't a load failure — "Failed to load" + Retry
    // just repeats the same 404, so it never actually helps.
    if (error.status === 404) {
      return (
        <div className="p-6">
          <EmptyState
            title="No loan file matches that reference"
            hint={`"${ref}" isn't in the book. Check the reference and try again.`}
            action={
              <Link to="/pipeline" className="btn btn-secondary">
                Back to Pipeline
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="p-6">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  const {
    loan,
    borrowers = [],
    facilities = [],
    collateral = [],
    risk = [],
    conditions = [],
    tranches = [],
    audit = [],
  } = data;
  const tone = slaState(loan.daysInStage, loan.slaDays);

  const byTab = {
    Borrowers: borrowers,
    Facilities: facilities,
    Collateral: collateral,
    Risk: risk,
    Conditions: conditions,
    Tranches: tranches,
    'Audit trail': audit,
  };

  const canAddBorrower = tab === 'Borrowers' && can('borrower');
  const canAddFacility = tab === 'Facilities' && can('facility');

  return (
    <div className="stack gap-6 p-6">
      <Link to="/pipeline" className="t-meta row w-fit gap-1 no-underline hover:text-[var(--text-primary)]">
        <ArrowLeft size={13} />
        Pipeline
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

      <div className="card p-5 stack gap-12">
        <StageRail currentStage={loan.currentStage} stageTat={loan.stageTat} />
        {loan.currentStage !== STAGES[STAGES.length - 1] && (
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={advancing}
              onClick={advanceStage}
            >
              {advancing ? 'Advancing…' : 'Advance to next stage'}
            </button>
          </div>
        )}
      </div>

      {/* Summary + tabs */}
      <div className="row gap-4" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card stack p-5" style={{ minWidth: 300, flex: '1 1 320px' }}>
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

          <div className="p-5">
            {(canAddBorrower || canAddFacility) && (
              <div className="row" style={{ justifyContent: 'flex-end', marginBottom: byTab[tab].length ? 12 : 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary gap-1.5"
                  onClick={() => (canAddBorrower ? setAddingBorrower(true) : setAddingFacility(true))}
                >
                  <Plus size={14} />
                  {canAddBorrower ? 'Add borrower' : 'Add facility'}
                </button>
              </div>
            )}

            {byTab[tab].length === 0 ? (
              <EmptyState
                title={`No ${tab.toLowerCase()} yet`}
                hint={
                  tab === 'Conditions'
                    ? 'Sanction conditions are created when the file is sanctioned.'
                    : canAddBorrower || canAddFacility
                      ? `Add the first one above to get this file's ${tab.toLowerCase()} on record.`
                      : `Nothing recorded against this file at the ${loan.currentStage} stage.`
                }
              />
            ) : (
              <TabBody tab={tab} rows={byTab[tab]} can={can} onChange={reload} loanRef={loan.loanReference} />
            )}
          </div>
        </div>
      </div>

      <AddBorrowerModal
        open={addingBorrower}
        onClose={() => setAddingBorrower(false)}
        loanRef={loan.loanReference}
        onAdded={reload}
      />
      <AddFacilityModal
        open={addingFacility}
        onClose={() => setAddingFacility(false)}
        loanRef={loan.loanReference}
        onAdded={reload}
      />
    </div>
  );
}

function TabBody({ tab, rows, can, onChange, loanRef }) {
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
                onClick={() => api.verifyCondition(c.id, loanRef, { status: 'Complied' }).then(onChange)}
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
                onClick={() =>
                  api
                    .releaseTranche(t.id, loanRef)
                    .then(onChange)
                    .catch((e) => {
                      // A blocked release is a business outcome, not a bug — say why
                      // rather than silently reloading as if nothing happened.
                      alert(e.message || 'Could not release this tranche');
                      onChange();
                    })
                }
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

  if (tab === 'Borrowers') {
    return (
      <div className="stack gap-8">
        {rows.map((b, i) => (
          <div key={b.id || i} className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="grow">
              <span style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</span>
              <span className="t-meta" style={{ display: 'block' }}>
                {b['Entity Role']}
                {b['Industry Sector'] ? ` · ${b['Industry Sector']}` : ''}
                {b['Group Name'] && b['Group Name'] !== b.name ? ` · ${b['Group Name']} group` : ''}
              </span>
            </span>
            {b['Annual Turnover Cr'] != null && <Money cr={b['Annual Turnover Cr']} bold />}
            {b['Internal Rating'] && <span className="t-meta num">{b['Internal Rating']}</span>}
            <Pill tone={toneFor(b['KYC Status'])}>{b['KYC Status'] || 'Pending'}</Pill>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'Facilities') {
    return (
      <div className="stack gap-8">
        {rows.map((f, i) => (
          <div key={f.id || i} className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="grow">
              <span style={{ fontWeight: 600, fontSize: 13 }}>{f['Facility Type']}</span>
              <span className="t-meta" style={{ display: 'block' }}>
                {f['Borrower Name']}
                {f['Tenor Months'] ? ` · ${f['Tenor Months']} mo` : ''}
                {f['All In Rate Pct'] != null ? ` · ${pct(f['All In Rate Pct'])}` : ''}
              </span>
            </span>
            <span className="stack gap-4" style={{ textAlign: 'right' }}>
              <Money cr={f['Amount Sanctioned Cr'] ?? f['Amount Requested Cr']} bold />
              {f['Amount Sanctioned Cr'] != null && (
                <span className="t-meta">of <Money cr={f['Amount Requested Cr']} /> requested</span>
              )}
            </span>
            <Pill tone={toneFor(f['Facility Status'])}>{f['Facility Status']}</Pill>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'Collateral') {
    return (
      <div className="stack gap-8">
        {rows.map((c, i) => (
          <div key={c.id || i} className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="grow">
              <span style={{ fontWeight: 600, fontSize: 13 }}>{c['Collateral Type']}</span>
              <span className="t-meta" style={{ display: 'block' }}>
                Charge: {c['Charge Type']}
                {c['Charge Registered'] ? ' · registered' : ' · not yet registered'}
              </span>
            </span>
            <span className="stack gap-4" style={{ textAlign: 'right' }}>
              <Money cr={c['Realizable Value Cr']} bold />
              {c['LTV Pct'] != null && <span className="t-meta">LTV {pct(c['LTV Pct'])}</span>}
            </span>
            <Pill tone={toneFor(c['Legal Opinion'])}>{c['Legal Opinion']}</Pill>
          </div>
        ))}
      </div>
    );
  }

  // Audit trail — generic key/value rendering; nothing else falls through to this.
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

import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Money, Pill, Skeleton, Avatar } from '../components/ui';
import AttentionFeed from '../components/AttentionFeed';
import { SLA_LABEL, date, days, money, slaState } from '../lib/format';
import { SHORT, STAGES, STAGE_COLOR } from '../lib/stages';
import { applyPipelineFilters, parsePipelineFilters, pipelineFilterCount } from '../lib/pipelineFilters';

function LoanCard({ loan, index }) {
  const tone = slaState(loan.daysInStage, loan.slaDays);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.03 }}
      whileHover={{ y: -3 }}
    >
      <Link
        to={`/loans/${encodeURIComponent(loan.loanReference)}`}
        className="card group stack gap-2.5 block p-3.5 no-underline transition-shadow duration-150 hover:shadow-lift"
        style={{ color: 'inherit' }}
      >
        <div className="row gap-2">
          <span className="t-meta num grow">{loan.loanReference}</span>
          {loan.internalRating && (
            <span className="t-meta num font-semibold" title={`Internal rating ${loan.internalRating}`}>
              {loan.internalRating}
            </span>
          )}
          <GripVertical
            size={14}
            className="flex-none text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ cursor: 'grab' }}
            title="Reordering coming soon"
          />
        </div>

        <div className="text-[14px] font-semibold leading-snug">{loan.borrowerName}</div>

        <div className="row gap-2">
          <Money cr={loan.totalRequestedCr} bold />
          <span className="grow" />
          <Pill tone={tone}>{SLA_LABEL[tone]}</Pill>
        </div>

        <div className="row gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="t-meta grow">{days(loan.daysInStage)} in stage</span>
          {loan.owner && <Avatar name={loan.owner} size={20} />}
        </div>
      </Link>
    </motion.div>
  );
}

function Column({ stage, loans, maxTotal, index }) {
  const total = loans.reduce((s, l) => s + (l.totalRequestedCr || 0), 0);
  const pct = maxTotal > 0 ? Math.max((total / maxTotal) * 100, loans.length ? 3 : 0) : 0;
  const color = STAGE_COLOR[stage];

  return (
    <div className="stack min-w-[288px] w-[288px] flex-none gap-3">
      <div className="stack gap-2 rounded-card px-1">
        <div className="row gap-2">
          <span
            className="center h-5 w-5 flex-none rounded-full text-[10.5px] font-bold text-white"
            style={{ background: color }}
          >
            {index + 1}
          </span>
          <span className="t-section grow">{SHORT[stage] || stage}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold num"
            style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
          >
            {loans.length}
          </span>
        </div>
        <div className="row gap-2">
          <span className="t-meta num font-semibold">{money(total)}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      <div className="stack gap-2.5">
        {loans.length === 0 ? (
          <div
            className="t-meta center rounded-card border border-dashed py-6"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            No files
          </div>
        ) : (
          loans.map((l, i) => <LoanCard key={l.loanReference} loan={l} index={i} />)
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="row gap-2">
      <span className="t-meta grow">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}

function AnalyticsPanel({ loans, dashboard }) {
  const distribution = STAGES.map((stage) => ({
    name: SHORT[stage],
    value: loans.filter((l) => l.currentStage === stage).length,
    color: STAGE_COLOR[stage],
  })).filter((d) => d.value > 0);

  const totalExposureCr = loans.reduce((s, l) => s + (l.totalRequestedCr || 0), 0);
  const avgDaysInStage = loans.length
    ? Math.round(loans.reduce((s, l) => s + (l.daysInStage || 0), 0) / loans.length)
    : 0;
  const healthy = loans.filter((l) => ['good', 'warning'].includes(slaState(l.daysInStage, l.slaDays))).length;
  const slaHealthPct = loans.length ? Math.round((healthy / loans.length) * 100) : 100;
  const approvalPct = dashboard?.kpi
    ? Math.round((dashboard.kpi.sanctionedFiles / Math.max(dashboard.kpi.liveFiles, 1)) * 100)
    : null;

  return (
    <aside className="stack w-[300px] flex-none gap-[16px]" style={{ position: 'sticky', top: 88 }}>
      <div className="card stack gap-[16px] p-5">
        <span className="t-section">Pipeline distribution</span>
        {distribution.length === 0 ? (
          <span className="t-meta">No live files yet.</span>
        ) : (
          <>
            <div style={{ height: 168 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {distribution.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} file${v === 1 ? '' : 's'}`, n]}
                    contentStyle={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12.5,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="stack gap-1.5">
              {distribution.map((d) => (
                <div key={d.name} className="row gap-2">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: d.color }} />
                  <span className="t-meta grow truncate">{d.name}</span>
                  <span className="num t-meta">{d.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card stack gap-3 p-5">
        <span className="t-section">Portfolio health</span>
        <StatRow label="Exposure in pipeline" value={money(totalExposureCr)} />
        <StatRow label="Avg. time in stage" value={days(avgDaysInStage)} />
        <StatRow label="SLA health" value={`${slaHealthPct}%`} />
        {approvalPct != null && <StatRow label="Approval rate" value={`${approvalPct}%`} />}
      </div>
    </aside>
  );
}

export default function Pipeline() {
  const { data, error, loading, reload } = useAsync(() => api.pipeline(), []);
  const { data: dashboard } = useAsync(() => api.dashboard(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parsePipelineFilters(searchParams);
  const activeFilterCount = pipelineFilterCount(filters) + (filters.quarter !== 'all' ? 1 : 0);

  const loans = data ? applyPipelineFilters(data.loans, filters) : [];
  const maxTotal = data
    ? Math.max(
        ...STAGES.map((stage) =>
          loans.filter((l) => l.currentStage === stage).reduce((s, l) => s + (l.totalRequestedCr || 0), 0),
        ),
        1,
      )
    : 1;

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('sla');
    next.delete('sector');
    next.delete('quarter');
    setSearchParams(next);
  };

  return (
    <div className="p-6">
      <div className="stack gap-6">
        <div className="stack gap-1">
          <h1 className="t-page-title">Pipeline</h1>
          <span className="row gap-2 t-meta">
            {loading
              ? 'Loading loan files…'
              : data
                ? activeFilterCount > 0
                  ? `${loans.length} of ${data.loans.length} live files · ${date(new Date())}`
                  : `${data.loans.length} live files · ${date(new Date())}`
                : ''}
            {activeFilterCount > 0 && (
              <button type="button" className="t-meta" style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </span>
        </div>

        <div className="row items-start gap-[16px]">
          <div className="stack flex-1 gap-6" style={{ minWidth: 0 }}>
            <AttentionFeed loans={data?.loans || []} />

          {loading && (
            <div className="row scroll-x gap-[16px]" style={{ alignItems: 'flex-start' }}>
              {STAGES.slice(0, 5).map((s) => (
                <div key={s} className="stack w-[288px] flex-none gap-2.5">
                  <Skeleton height={14} width={120} />
                  <Skeleton height={108} radius={16} />
                  <Skeleton height={108} radius={16} />
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

          {data && data.loans.length > 0 && loans.length === 0 && (
            <EmptyState title="No files match these filters" hint="Try clearing a filter — the board has files, just not in this slice." action={
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            } />
          )}

          {data && loans.length > 0 && (
            <div className="row scroll-x gap-[16px] pb-2" style={{ alignItems: 'flex-start' }}>
              {STAGES.map((stage, i) => (
                <Column
                  key={stage}
                  stage={stage}
                  index={i}
                  loans={loans.filter((l) => l.currentStage === stage)}
                  maxTotal={maxTotal}
                />
              ))}
            </div>
          )}
        </div>

          {data && loans.length > 0 && (
            <div className="hidden xl:block">
              <AnalyticsPanel loans={loans} dashboard={dashboard} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

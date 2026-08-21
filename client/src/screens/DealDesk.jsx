import { AlertTriangle, Banknote, CheckCircle2, Layers, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, KpiCard, Money, Pill, Skeleton } from '../components/ui';
import Concentration from '../components/Concentration';
import { days, money } from '../lib/format';
import { SHORT, STAGES, STAGE_COLOR } from '../lib/stages';

/* The turnaround-by-stage bars stay hand-rolled SVG: each row needs a reference mark
 * at THAT stage's own SLA, which a shared-axis Recharts bar can't express cleanly.
 * Applications-by-stage, exposure-by-sector and sanctioned-vs-disbursed move to
 * Recharts per the brief — plain categorical bars, no per-row reference needed. */
function TurnaroundBars({ rows }) {
  const ceiling = Math.max(...rows.map((r) => Math.max(r.actualDays, r.slaDays)), 1);
  return (
    <div className="stack gap-3">
      {rows.map((r) => {
        const w = Math.max((r.actualDays / ceiling) * 100, r.actualDays > 0 ? 1.5 : 0);
        const over = r.actualDays > r.slaDays;
        return (
          <div key={r.stage} className="row gap-3">
            <span className="t-meta w-[104px] flex-none truncate">{SHORT[r.stage] || r.stage}</span>
            <div
              className="relative flex-1 rounded-md"
              style={{ height: 20, background: 'var(--surface-2)' }}
              title={`${r.stage}: ${days(r.actualDays)} actual vs ${days(r.slaDays)} SLA`}
            >
              <div
                className="h-full rounded-md transition-[width] duration-300"
                style={{ width: `${w}%`, background: over ? 'var(--critical)' : 'var(--series-1)' }}
              />
              <span
                aria-hidden="true"
                title={`SLA ${days(r.slaDays)}`}
                className="absolute -top-0.5 -bottom-0.5 w-0.5"
                style={{ left: `${(r.slaDays / ceiling) * 100}%`, background: 'var(--axis)' }}
              />
            </div>
            <span className="t-meta num w-16 flex-none text-right">{days(r.actualDays)}</span>
          </div>
        );
      })}
    </div>
  );
}

const chartTooltipStyle = {
  background: 'var(--surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12.5,
};

function ApplicationsByStageChart({ loans }) {
  const data = STAGES.map((stage) => ({
    stage: SHORT[stage],
    count: loans.filter((l) => l.currentStage === stage).length,
    color: STAGE_COLOR[stage],
  }));
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={chartTooltipStyle} formatter={(v) => [`${v} application${v === 1 ? '' : 's'}`, '']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {data.map((d) => (
              <Cell key={d.stage} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExposureBySectorChart({ rows }) {
  const data = rows.map((r) => ({ sector: r.sector, amountCr: r.amountCr }));
  return (
    <div style={{ height: Math.max(data.length * 34, 120) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid horizontal={false} stroke="var(--gridline)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} tickFormatter={(v) => money(v)} />
          <YAxis type="category" dataKey="sector" width={128} tick={{ fontSize: 11.5, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={chartTooltipStyle} formatter={(v) => [money(v), 'Sanctioned']} />
          <Bar dataKey="amountCr" radius={[0, 6, 6, 0]} maxBarSize={18} fill="var(--series-1)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SanctionedVsDisbursedChart({ rows }) {
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: -20, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis dataKey="facilityType" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} width={56} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={chartTooltipStyle} formatter={(v) => money(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sanctionedCr" name="Sanctioned" fill="var(--series-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="disbursedCr" name="Disbursed" fill="var(--series-2)" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <div className="card stack gap-4 p-5" style={{ flex: '1 1 380px', minWidth: 320 }}>
      <div className="stack gap-1">
        <span className="t-section">{title}</span>
        {note && <span className="t-meta">{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function DealDesk() {
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), []);
  const { data: pipelineData } = useAsync(() => api.pipeline(), []);
  const { data: attentionData } = useAsync(() => api.attention(), []);

  if (loading) {
    return (
      <div className="stack gap-6 p-6">
        <Skeleton height={28} width={200} />
        <div className="row gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grow">
              <Skeleton height={124} radius={16} />
            </div>
          ))}
        </div>
        <div className="row gap-4">
          <div className="grow">
            <Skeleton height={280} radius={16} />
          </div>
          <div className="grow">
            <Skeleton height={280} radius={16} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  const d = data;

  return (
    <div className="stack gap-6 p-6">
      <div className="stack gap-1">
        <h1 className="t-page-title">Deal Desk</h1>
        <span className="t-meta">Portfolio position across {d.kpi.liveFiles} live files</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={Layers}
          label="Live files"
          value={d.kpi.liveFiles}
          sub={`${d.kpi.sanctionedFiles} sanctioned`}
          tone="violet"
        />
        <KpiCard
          icon={Wallet}
          label="Pipeline exposure"
          value={d.kpi.pipelineCr}
          format={money}
          sub="requested"
          tone="warning"
          delay={0.04}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Sanctioned"
          value={d.kpi.sanctionedCr}
          format={money}
          sub="approved to date"
          tone="success"
          delay={0.08}
        />
        <KpiCard
          icon={Banknote}
          label="Disbursed"
          value={d.kpi.disbursedCr}
          format={money}
          sub="money out the door"
          tone="info"
          delay={0.12}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Overdue tasks"
          value={attentionData ? attentionData.counts.total : d.kpi.slaBreaches}
          sub={
            attentionData
              ? `${attentionData.counts.critical} critical`
              : d.kpi.slaBreaches > 0
                ? 'Needs escalation'
                : 'All on track'
          }
          tone="danger"
          delay={0.16}
        />
      </div>

      <div className="row flex-wrap items-start gap-4">
        <Panel title="Applications by stage" note="Live files currently sitting in each stage.">
          {pipelineData ? (
            <ApplicationsByStageChart loans={pipelineData.loans} />
          ) : (
            <Skeleton height={220} radius={12} />
          )}
        </Panel>

        <Panel
          title="Turnaround by stage"
          note="Average actual days from time logs. The line marks the stage SLA; bars past it are breaching."
        >
          <TurnaroundBars rows={d.tatByStage} />
        </Panel>
      </div>

      <div className="row flex-wrap items-start gap-4">
        <Panel title="Exposure by sector" note="Sanctioned amount, largest first.">
          <ExposureBySectorChart rows={d.exposureBySector} />
        </Panel>

        <Panel title="Sanctioned vs disbursed" note="By facility type.">
          <SanctionedVsDisbursedChart rows={d.sanctionedVsDisbursed} />
        </Panel>
      </div>

      <Panel title="Files breaching SLA" note="Oldest breach first — these need escalation today.">
        {d.breaches.length === 0 ? (
          <span className="t-meta">Nothing breaching. Every file is inside its stage SLA.</span>
        ) : (
          <div className="stack gap-0.5">
            {d.breaches.map((b, i) => (
              <div
                key={b.loanReference}
                className={`row gap-3 rounded-xl px-3 py-2.5 ${i % 2 === 1 ? 'bg-[var(--surface-2)]/50' : ''}`}
              >
                <span className="t-meta num w-[100px] flex-none">{b.loanReference}</span>
                <span className="grow text-[13px]">
                  {b.borrowerName}
                  <span className="t-meta block">
                    {b.currentStage} · {days(b.daysInStage)} of {days(b.slaDays)}
                  </span>
                </span>
                <Money cr={b.totalRequestedCr} />
                <Pill tone="critical">+{b.daysOver}d</Pill>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <hr className="hairline" />

      <Concentration />
    </div>
  );
}

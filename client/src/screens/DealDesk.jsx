import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, Money, Pill, Skeleton, StatTile } from '../components/ui';
import Concentration from '../components/Concentration';
import { days, money } from '../lib/format';

/* Charts are hand-rolled SVG rather than a charting library: it keeps the bundle
 * small, and more importantly it keeps the marks under our control so they use the
 * validated series colours and the spacer rules from docs/DESIGN.md §3.
 *
 * Rules honoured here: single hue for single-series magnitude, two validated hues
 * for the one two-series chart, 4px rounded data-ends anchored to the baseline,
 * recessive gridlines, one axis (never dual), hover tooltip on every mark, and a
 * legend whenever there are two series. */

function HBars({ rows, max, unit = 'cr', reference, height = 22 }) {
  const ceiling = max || Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="stack gap-8">
      {rows.map((r) => {
        const w = Math.max((r.value / ceiling) * 100, r.value > 0 ? 1.5 : 0);
        const over = reference != null && r.value > reference;
        return (
          <div key={r.label} className="row gap-12">
            <span className="t-meta" style={{ width: 132, flex: 'none' }}>
              {r.label}
            </span>
            <div
              style={{ flex: 1, height, background: 'var(--surface-2)', borderRadius: 4, position: 'relative' }}
              title={`${r.label}: ${unit === 'cr' ? money(r.value) : days(r.value)}`}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: over ? 'var(--critical)' : 'var(--series-1)',
                  transition: 'width 200ms ease-out',
                }}
              />
              {reference != null && (
                <span
                  aria-hidden="true"
                  title={`SLA ${days(reference)}`}
                  style={{
                    position: 'absolute',
                    left: `${(reference / ceiling) * 100}%`,
                    top: -2,
                    bottom: -2,
                    width: 2,
                    background: 'var(--axis)',
                  }}
                />
              )}
            </div>
            <span className="t-meta num" style={{ width: 76, flex: 'none', textAlign: 'right' }}>
              {unit === 'cr' ? money(r.value) : days(r.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GroupedBars({ rows }) {
  const ceiling = Math.max(...rows.flatMap((r) => [r.a, r.b]), 1);
  return (
    <div className="stack gap-12">
      <div className="row gap-16">
        {[
          ['Sanctioned', 'var(--series-1)'],
          ['Disbursed', 'var(--series-2)'],
        ].map(([label, colour]) => (
          <span key={label} className="row gap-4 t-meta">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colour }} />
            {label}
          </span>
        ))}
      </div>

      <div className="row gap-16" style={{ alignItems: 'flex-end', height: 168 }}>
        {rows.map((r) => (
          <div key={r.label} className="stack gap-8 grow" style={{ alignItems: 'center' }}>
            {/* 2px gap between adjacent fills so the marks never touch. */}
            <div className="row" style={{ gap: 2, alignItems: 'flex-end', height: 136 }}>
              <div
                title={`${r.label} sanctioned: ${money(r.a)}`}
                style={{
                  width: 18,
                  height: `${Math.max((r.a / ceiling) * 100, 1)}%`,
                  background: 'var(--series-1)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
              <div
                title={`${r.label} disbursed: ${money(r.b)}`}
                style={{
                  width: 18,
                  height: `${Math.max((r.b / ceiling) * 100, 1)}%`,
                  background: 'var(--series-2)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
            <span className="t-meta" style={{ textAlign: 'center' }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <div className="card stack gap-16" style={{ padding: 16, flex: '1 1 380px', minWidth: 320 }}>
      <div className="stack gap-4">
        <span className="t-section">{title}</span>
        {note && <span className="t-meta">{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function DealDesk() {
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), []);

  if (loading) {
    return (
      <div className="stack gap-16" style={{ padding: 24 }}>
        <Skeleton height={28} width={200} />
        <div className="row gap-16">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grow">
              <Skeleton height={96} radius={10} />
            </div>
          ))}
        </div>
        <div className="row gap-16">
          <div className="grow">
            <Skeleton height={280} radius={10} />
          </div>
          <div className="grow">
            <Skeleton height={280} radius={10} />
          </div>
        </div>
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

  const d = data;

  return (
    <div className="stack gap-16" style={{ padding: 24 }}>
      <div className="stack gap-4">
        <h1 className="t-page-title">Deal Desk</h1>
        <span className="t-meta">Portfolio position across {d.kpi.liveFiles} live files</span>
      </div>

      <div className="row gap-16" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <StatTile label="Live files" value={d.kpi.liveFiles} sub={`${d.kpi.sanctionedFiles} sanctioned`} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <StatTile label="Pipeline exposure" value={money(d.kpi.pipelineCr)} sub="requested" />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <StatTile label="Sanctioned" value={money(d.kpi.sanctionedCr)} sub={`${money(d.kpi.disbursedCr)} disbursed`} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <StatTile
            label="SLA breaches"
            value={d.kpi.slaBreaches}
            sub={d.kpi.slaBreaches > 0 ? 'Needs escalation' : 'All on track'}
            tone={d.kpi.slaBreaches > 0 ? 'critical' : 'good'}
          />
        </div>
      </div>

      <div className="row gap-16" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Panel
          title="Turnaround by stage"
          note="Average actual days from time logs. The line marks the stage SLA; bars past it are breaching."
        >
          {d.tatByStage.map((s) => (
            <HBars
              key={s.stage}
              rows={[{ label: s.stage, value: s.actualDays }]}
              max={Math.max(...d.tatByStage.map((x) => Math.max(x.actualDays, x.slaDays)))}
              unit="days"
              reference={s.slaDays}
            />
          ))}
        </Panel>

        <Panel title="Exposure by sector" note="Sanctioned amount, largest first.">
          <HBars rows={d.exposureBySector.map((s) => ({ label: s.sector, value: s.amountCr }))} />
        </Panel>
      </div>

      <div className="row gap-16" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Panel title="Sanctioned vs disbursed" note="By facility type.">
          <GroupedBars
            rows={d.sanctionedVsDisbursed.map((r) => ({
              label: r.facilityType,
              a: r.sanctionedCr,
              b: r.disbursedCr,
            }))}
          />
        </Panel>

        <Panel title="Files breaching SLA" note="Oldest breach first — these need escalation today.">
          {d.breaches.length === 0 ? (
            <span className="t-meta">Nothing breaching. Every file is inside its stage SLA.</span>
          ) : (
            <div className="stack gap-8">
              {d.breaches.map((b) => (
                <div key={b.loanReference} className="row gap-12" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="t-meta num" style={{ width: 104, flex: 'none' }}>
                    {b.loanReference}
                  </span>
                  <span className="grow" style={{ fontSize: 13 }}>
                    {b.borrowerName}
                    <span className="t-meta" style={{ display: 'block' }}>
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
      </div>

      <hr className="hairline" style={{ margin: '8px 0' }} />

      <Concentration />
    </div>
  );
}

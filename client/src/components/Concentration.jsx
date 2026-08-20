import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Money, Pill, Skeleton } from './ui';
import { money, pct } from '../lib/format';

/* Where risk is clustering, measured against the policy caps in
 * functions/sanctio_api/policy.js.
 *
 * Chart decisions, per docs/DESIGN.md §3:
 *  - Every chart here is single-series magnitude, so every chart is ONE hue. The cap
 *    is a reference line, not a second series; bars past it turn critical.
 *  - Rating grade is NOT colour-encoded. The grade is already on the axis, so
 *    colouring it too is redundant encoding. It gets one hue and an annotated
 *    investment-grade divider instead.
 *  - No dual axis anywhere: rupees and percentages never share a plot. */

function CapBar({ name, amountCr, pct: sharePct, capPct, breach, nearLimit }) {
  // Scale to the cap, not to the largest value — the question is "how much of the
  // limit is used", so the limit has to be the visual reference. Headroom above the
  // cap is kept visible so a breach reads as overflow rather than a full bar.
  const scaleMax = Math.max(capPct * 1.4, sharePct * 1.1);
  const width = Math.min((sharePct / scaleMax) * 100, 100);
  const capAt = (capPct / scaleMax) * 100;
  const tone = breach ? 'critical' : nearLimit ? 'warning' : null;

  return (
    <div className="row gap-12">
      <span
        className="t-meta"
        style={{ width: 148, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={name}
      >
        {name}
      </span>

      <div
        style={{ flex: 1, height: 22, background: 'var(--surface-2)', borderRadius: 4, position: 'relative' }}
        title={`${name}: ${money(amountCr)} — ${pct(sharePct)} of book, cap ${capPct}%`}
      >
        <div
          style={{
            width: `${Math.max(width, 1.5)}%`,
            height: '100%',
            borderRadius: 4,
            background: breach ? 'var(--critical)' : 'var(--series-1)',
            transition: 'width 200ms ease-out',
          }}
        />
        {/* Policy cap — a reference line, deliberately recessive. */}
        <span
          aria-hidden="true"
          title={`Policy cap ${capPct}%`}
          style={{
            position: 'absolute',
            left: `${capAt}%`,
            top: -3,
            bottom: -3,
            width: 2,
            background: 'var(--axis)',
          }}
        />
      </div>

      <span className="t-meta num" style={{ width: 52, flex: 'none', textAlign: 'right' }}>
        {pct(sharePct, 1)}
      </span>
      <span style={{ width: 84, flex: 'none', textAlign: 'right' }}>
        <Money cr={amountCr} />
      </span>
      <span style={{ width: 74, flex: 'none' }}>
        {tone ? <Pill tone={tone}>{breach ? 'Breach' : 'Near cap'}</Pill> : null}
      </span>
    </div>
  );
}

function GradeBars({ byGrade, total }) {
  const ceiling = Math.max(...byGrade.map((g) => g.amountCr), 1);
  const firstSubIg = byGrade.findIndex((g) => !g.investmentGrade);

  return (
    <div className="stack gap-8">
      <div className="row gap-4" style={{ alignItems: 'flex-end', height: 132 }}>
        {byGrade.map((g, i) => (
          <div key={g.grade} className="stack gap-4 grow" style={{ alignItems: 'center', position: 'relative' }}>
            {/* Investment vs sub-investment divider, annotated rather than colour-coded. */}
            {i === firstSubIg && firstSubIg > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: -2,
                  top: -8,
                  bottom: -20,
                  width: 1,
                  borderLeft: '1px dashed var(--axis)',
                }}
              />
            )}
            <div
              title={`${g.grade}: ${money(g.amountCr)}${total > 0 ? ` — ${pct((g.amountCr / total) * 100, 1)}` : ''}`}
              style={{
                width: '100%',
                maxWidth: 30,
                height: `${Math.max((g.amountCr / ceiling) * 100, g.amountCr > 0 ? 2 : 0)}%`,
                minHeight: g.amountCr > 0 ? 3 : 0,
                background: 'var(--series-1)',
                borderRadius: '4px 4px 0 0',
              }}
            />
            <span className="t-meta num">{g.grade}</span>
          </div>
        ))}
      </div>

      <div className="row gap-16 t-meta" style={{ justifyContent: 'space-between' }}>
        <span>← investment grade</span>
        <span>sub-investment grade →</span>
      </div>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <div className="card stack gap-4 p-5" style={{ flex: '1 1 420px', minWidth: 340 }}>
      <div className="stack gap-1">
        <span className="t-section">{title}</span>
        {note && <span className="t-meta">{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Concentration() {
  const { data, error, loading } = useAsync(() => api.concentration(), []);

  if (loading) {
    return (
      <div className="row gap-16" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px' }}>
          <Skeleton height={260} radius={10} />
        </div>
        <div style={{ flex: '1 1 420px' }}>
          <Skeleton height={260} radius={10} />
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const { bySector, byGroup, byGrade, subInvestmentGrade, policy, totalSanctionedCr, breaches } = data;

  return (
    <div className="stack gap-16">
      <div className="row gap-12" style={{ flexWrap: 'wrap' }}>
        <span className="t-page-title grow" style={{ fontSize: 15 }}>
          Portfolio concentration
        </span>
        {breaches > 0 ? (
          <Pill tone="critical">
            {breaches} limit {breaches === 1 ? 'breach' : 'breaches'}
          </Pill>
        ) : (
          <Pill tone="good">Within all policy limits</Pill>
        )}
        <span className="t-meta num">
          on <Money cr={totalSanctionedCr} /> sanctioned
        </span>
      </div>

      <div className="row gap-16" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Panel
          title="By sector"
          note={`Share of sanctioned exposure. The line marks the ${policy.sectorCapPct}% single-sector cap.`}
        >
          {bySector.length === 0 ? (
            <span className="t-meta">No sanctioned exposure yet.</span>
          ) : (
            <div className="stack gap-8">
              {bySector.map((s) => (
                <CapBar key={s.name} {...s} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Top group exposures"
          note={`All facilities under one parent. Cap is ${policy.groupCapPct}% — this is the limit that actually bites, because a group can look like six unrelated borrowers until the parent defaults.`}
        >
          {byGroup.length === 0 ? (
            <span className="t-meta">No sanctioned exposure yet.</span>
          ) : (
            <div className="stack gap-8">
              {byGroup.map((g) => (
                <CapBar key={g.name} {...g} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="row gap-16" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Panel title="By rating grade" note="Sanctioned exposure across the internal rating scale.">
          <GradeBars byGrade={byGrade} total={totalSanctionedCr} />
        </Panel>

        <Panel
          title="Sub-investment grade"
          note={`BB and below. Cap is ${policy.subInvestmentGradeCapPct}% of the book.`}
        >
          <div className="stack gap-12">
            <div className="row gap-12">
              <span
                className="num"
                style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}
              >
                {pct(subInvestmentGrade.pct, 1)}
              </span>
              <span className="stack gap-4 grow">
                <span className="t-meta">
                  <Money cr={subInvestmentGrade.amountCr} /> of{' '}
                  <Money cr={totalSanctionedCr} />
                </span>
                <span className="t-meta num">
                  {subInvestmentGrade.utilisation}% of the {policy.subInvestmentGradeCapPct}% cap used
                </span>
              </span>
              {subInvestmentGrade.breach ? (
                <Pill tone="critical">Breach</Pill>
              ) : subInvestmentGrade.nearLimit ? (
                <Pill tone="warning">Near cap</Pill>
              ) : (
                <Pill tone="good">Within cap</Pill>
              )}
            </div>

            <CapBar
              name="Sub-investment grade"
              amountCr={subInvestmentGrade.amountCr}
              pct={subInvestmentGrade.pct}
              capPct={subInvestmentGrade.capPct}
              breach={subInvestmentGrade.breach}
              nearLimit={subInvestmentGrade.nearLimit}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

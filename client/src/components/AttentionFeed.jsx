import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Money, Pill, Skeleton } from './ui';

/* "What do I do today", as one ranked list.
 *
 * Deliberately cross-cutting — aging files, waiting deviations, due covenants and
 * blocked money in a single feed, worst first. Four separate panels would make the
 * reader do the prioritising, which is exactly the work this is meant to remove. */

const KIND_LABEL = {
  sla: 'SLA',
  deviation: 'Deviation',
  covenant: 'Covenant',
  tranche: 'Disbursement',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sla', label: 'SLA' },
  { key: 'deviation', label: 'Deviations' },
  { key: 'covenant', label: 'Covenants' },
  { key: 'tranche', label: 'Disbursement' },
];

function Item({ item }) {
  return (
    <div
      className="row gap-12"
      style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}
    >
      <span style={{ flex: 'none', paddingTop: 1 }}>
        <Pill tone={item.severity}>{KIND_LABEL[item.kind] || item.kind}</Pill>
      </span>

      <span className="stack gap-4 grow" style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
        {item.detail && (
          <span
            className="t-meta"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.detail}
          </span>
        )}
      </span>

      {item.amountCr != null && (
        <span style={{ flex: 'none' }}>
          <Money cr={item.amountCr} />
        </span>
      )}

      {item.loanReference && (
        <Link
          to={`/loans/${encodeURIComponent(item.loanReference)}`}
          className="btn btn-secondary"
          style={{ flex: 'none', textDecoration: 'none' }}
        >
          {item.action || 'Open'}
        </Link>
      )}
    </div>
  );
}

export default function AttentionFeed() {
  const [filter, setFilter] = useState('all');
  const { data, error, loading } = useAsync(() => api.attention(), []);

  // On the pipeline board this is secondary to the columns — if it can't load, stay
  // quiet rather than pushing an error banner above the primary content.
  if (error) return null;

  if (loading) {
    return (
      <div className="card stack gap-12" style={{ padding: 16 }}>
        <Skeleton height={14} width={140} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="card row gap-12" style={{ padding: '12px 16px' }}>
        <Pill tone="good">Clear</Pill>
        <span className="t-meta">
          Nothing needs attention — no SLA breaches, no waiting deviations, no covenants due
          this week, no blocked tranches.
        </span>
      </div>
    );
  }

  const shown = filter === 'all' ? data.items : data.items.filter((i) => i.kind === filter);
  const { counts } = data;

  return (
    <div className="card stack" style={{ padding: 16 }}>
      <div className="row gap-12" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
        <span className="t-section grow">Needs attention</span>
        {counts.critical > 0 && <Pill tone="critical">{counts.critical} critical</Pill>}
        <span className="t-meta num">{counts.total} items</span>
      </div>

      {/* Filters in one row above the content. */}
      <div className="row gap-4 scroll-x" style={{ marginBottom: 8 }}>
        {FILTERS.map((f) => {
          const n = f.key === 'all' ? counts.total : counts[`${f.key}s`] ?? counts[f.key] ?? 0;
          if (f.key !== 'all' && n === 0) return null;
          return (
            <button
              key={f.key}
              type="button"
              className="btn btn-ghost"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              style={
                filter === f.key
                  ? { background: 'var(--surface-2)', color: 'var(--text-primary)', fontWeight: 600 }
                  : undefined
              }
            >
              {f.label}
              <span className="t-meta num">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="stack">
        {shown.map((item, i) => (
          <Item key={`${item.kind}-${item.loanReference}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}

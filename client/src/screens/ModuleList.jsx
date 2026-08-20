import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Money, Pill, Skeleton } from '../components/ui';
import { moduleByApi, toneFor } from '../lib/modules';
import { date, pct, ratio } from '../lib/format';

/* One generic browser for all six custom modules, driven by the column config in
 * lib/modules.js. Six near-identical hand-written tables would drift apart within a
 * week; one table that reads its shape from config cannot. */

function Cell({ col, row }) {
  const v = row[col.key];

  if (v == null || v === '') return <span className="t-meta">—</span>;

  switch (col.type) {
    case 'money':
      return <Money cr={v} />;
    case 'pct':
      return <span className="num">{pct(v)}</span>;
    case 'ratio':
      return <span className="num">{ratio(v)}</span>;
    case 'date':
      return <span className="num">{date(v)}</span>;
    case 'num':
      return <span className="num">{v}</span>;
    case 'months':
      return <span className="num">{v} mo</span>;
    case 'bool':
      // Never a bare checkmark — a tick with no label is ambiguous about what it
      // asserts, and colour alone can't carry it either.
      return <Pill tone={v ? 'good' : 'neutral'}>{v ? 'Yes' : 'No'}</Pill>;
    case 'pill':
      return <Pill tone={toneFor(v)}>{v}</Pill>;
    case 'ref':
      return (
        <Link to={`/loans/${encodeURIComponent(v)}`} className="num" style={{ color: 'var(--accent)' }}>
          {v}
        </Link>
      );
    default:
      return <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(v)}</span>;
  }
}

export default function ModuleList() {
  const { module } = useParams();
  const mod = moduleByApi(module);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const { data, error, loading, reload } = useAsync(() => api.moduleRecords(module), [module]);

  const rows = useMemo(() => {
    let out = data?.rows || [];
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) =>
        Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const x = a[key];
        const y = b[key];
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y));
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [data, q, sort]);

  // A page size change, a new search, a re-sort, or switching modules can all strand
  // the current page past the new end — snap back to page 1 whenever any of them fire.
  useEffect(() => {
    setPage(1);
  }, [q, sort, pageSize, module]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!mod) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState title="Unknown module" hint={`"${module}" is not one of the six Sanctio modules.`} />
      </div>
    );
  }

  const toggleSort = (key) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="stack gap-6 p-6">
      <div className="row flex-wrap gap-4">
        <div className="stack grow gap-1">
          <h1 className="t-page-title">{mod.label}</h1>
          <span className="t-meta">{mod.blurb}</span>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            className="input pl-8"
            style={{ width: 260 }}
            type="search"
            placeholder={`Search ${mod.label.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Search ${mod.label}`}
          />
        </div>
      </div>

      {loading && (
        <div className="card stack gap-2 p-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={32} />
          ))}
        </div>
      )}

      {error &&
        (error.payload?.code === 'MODULE_UNREADABLE' ? (
          /* Distinct from a generic failure on purpose. "Failed to load" invites the
           * reader to retry forever; this says what is actually true and what would
           * change it. */
          <div className="card stack gap-12" style={{ padding: 24, maxWidth: 620 }}>
            <div className="row gap-12">
              <Pill tone="warning">Not readable</Pill>
              <span style={{ fontWeight: 600 }}>{mod.label} records are not accessible</span>
            </div>
            <p className="t-meta" style={{ lineHeight: 1.6 }}>
              {error.payload.hint}
            </p>
            <p className="t-meta" style={{ lineHeight: 1.6 }}>
              Loan files, stages and the portfolio views read from the Projects module,
              which <em>is</em> accessible — so the Pipeline and Deal Desk are unaffected.
            </p>
            <div className="row gap-8">
              <button type="button" className="btn btn-secondary" onClick={reload}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <ErrorState message={error.message} onRetry={reload} />
        ))}

      {data && data.rows.length === 0 && (
        <EmptyState
          title={`No ${mod.label.toLowerCase()} yet`}
          hint="Seed the demo data with scripts/seed.mjs, or create a record from a loan file."
        />
      )}

      {data && data.rows.length > 0 && (
        <>
          <div className="card scroll-x">
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  {mod.columns.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        position: 'sticky',
                        top: 0,
                        background: 'var(--surface-2)',
                        textAlign: 'left',
                        padding: '9px 12px',
                        borderBottom: '1px solid var(--border)',
                        width: col.width,
                        whiteSpace: 'nowrap',
                        zIndex: 1,
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost gap-1"
                        onClick={() => toggleSort(col.key)}
                        style={{ height: 22, padding: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                        aria-label={`Sort by ${col.label}`}
                      >
                        {col.label}
                        {sort?.key === col.key ? (
                          sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown size={12} aria-hidden="true" className="opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr
                    key={row.id || i}
                    className="transition-colors duration-150 hover:bg-[var(--surface-2)]"
                    style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}
                  >
                    {mod.columns.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          padding: '11px 12px',
                          fontSize: 14,
                          maxWidth: col.width,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={row[col.key] != null ? String(row[col.key]) : undefined}
                      >
                        <Cell col={col} row={row} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row flex-wrap gap-3">
            <span className="t-meta num grow">
              {rows.length === 0
                ? '0 records'
                : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} of ${rows.length}${
                    rows.length === data.rows.length ? '' : ` (of ${data.rows.length} total)`
                  } records`}
            </span>

            <div className="row gap-2">
              <span className="t-meta">Show</span>
              <select
                className="input h-8 w-auto px-2 py-0 text-[13px]"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Records per page"
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="row gap-1">
              <button
                type="button"
                className="btn btn-secondary h-8 px-2.5"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="t-meta num px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary h-8 px-2.5"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

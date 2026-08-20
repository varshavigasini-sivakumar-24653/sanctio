import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Money, Pill, Skeleton } from './ui';
import { SHORT, STAGE_COLOR } from '../lib/stages';
import { cn } from '../lib/cn';

/* "What do I do today", as one ranked table.
 *
 * Deliberately cross-cutting — aging files, waiting deviations, due covenants and
 * blocked money in a single feed, worst first. Four separate panels would make the
 * reader do the prioritising, which is exactly the work this is meant to remove.
 *
 * Borrower and Stage are joined in from the pipeline's own loan list (real fields,
 * not fabricated) — the attention API only carries loanReference, so the caller
 * passes down whatever loans it already has on hand for the lookup. */

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

function Th({ children }) {
  return (
    <th className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </th>
  );
}

function Row({ item, index, loanByRef }) {
  const loan = loanByRef.get(item.loanReference);
  const stageLabel = loan ? SHORT[loan.currentStage] || loan.currentStage : null;
  const stageColor = loan ? STAGE_COLOR[loan.currentStage] : null;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.02 }}
      className={cn('transition-colors duration-150 hover:bg-[var(--surface-2)]', index % 2 === 1 && 'bg-[var(--surface-2)]/50')}
    >
      <td className="whitespace-nowrap rounded-l-xl px-4 py-3 align-top">
        <Pill tone={item.severity}>{KIND_LABEL[item.kind] || item.kind}</Pill>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top">
        {item.loanReference ? (
          <Link to={`/loans/${encodeURIComponent(item.loanReference)}`} className="t-meta num hover:text-primary">
            {item.loanReference}
          </Link>
        ) : (
          <span className="t-meta">—</span>
        )}
      </td>
      <td className="min-w-[160px] px-4 py-3 align-top text-[13px] font-medium">
        {loan?.borrowerName || <span className="t-meta font-normal">—</span>}
      </td>
      <td className="min-w-[260px] px-4 py-3 align-top">
        <span className="stack gap-0.5">
          <span className="text-[13px]">{item.title}</span>
          {item.detail && <span className="t-meta truncate">{item.detail}</span>}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top">
        {stageLabel ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            style={{ background: `color-mix(in srgb, ${stageColor} 14%, transparent)`, color: stageColor }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stageColor }} />
            {stageLabel}
          </span>
        ) : (
          <span className="t-meta">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top">
        {item.amountCr != null ? <Money cr={item.amountCr} bold /> : <span className="t-meta">—</span>}
      </td>
      <td className="whitespace-nowrap rounded-r-xl px-4 py-3 align-top">
        {item.loanReference ? (
          <Link to={`/loans/${encodeURIComponent(item.loanReference)}`} className="btn btn-secondary h-8 px-3 text-[12.5px]">
            {item.action || 'Open'}
          </Link>
        ) : (
          <span className="t-meta">—</span>
        )}
      </td>
    </motion.tr>
  );
}

const PAGE_SIZE = 3;

export default function AttentionFeed({ loans = [] }) {
  const [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(() => api.attention(), []);
  const loanByRef = useMemo(() => new Map(loans.map((l) => [l.loanReference, l])), [loans]);

  // Switching filters can strand the current page past the new, shorter list —
  // snap back to page 1 whenever the filter changes.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  // On the pipeline board this is secondary to the columns — if it can't load, stay
  // quiet rather than pushing an error banner above the primary content.
  if (error) return null;

  if (loading) {
    return (
      <div className="card stack gap-3 p-5">
        <Skeleton height={14} width={140} />
        <Skeleton height={48} radius={12} />
        <Skeleton height={48} radius={12} />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="card row gap-3 p-4">
        <span className="center h-8 w-8 flex-none rounded-full bg-success-wash text-success">
          <CheckCircle2 size={16} />
        </span>
        <span className="t-meta">
          Nothing needs attention — no SLA breaches, no waiting deviations, no covenants due
          this week, no blocked tranches.
        </span>
      </div>
    );
  }

  const shown = filter === 'all' ? data.items : data.items.filter((i) => i.kind === filter);
  const { counts } = data;
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="card stack p-5">
      <button
        type="button"
        className="row flex-wrap gap-3 text-left"
        aria-expanded={!collapsed}
        aria-controls="needs-attention-body"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="t-section grow">Needs attention</span>
        {counts.critical > 0 && <Pill tone="critical">{counts.critical} critical</Pill>}
        <span className="t-meta num">{counts.total} items</span>
        <ChevronDown
          size={16}
          className="flex-none text-[var(--text-muted)] transition-transform duration-200"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            id="needs-attention-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="row scroll-x mt-3 mb-1 gap-[20px] border-b"
              role="tablist"
              style={{ borderColor: 'var(--border)' }}
            >
              {FILTERS.map((f) => {
                const n = f.key === 'all' ? counts.total : counts[`${f.key}s`] ?? counts[f.key] ?? 0;
                if (f.key !== 'all' && n === 0) return null;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'row h-10 flex-none gap-1.5 whitespace-nowrap px-0.5 text-[13px] font-medium transition-colors duration-150 border-b-2 -mb-px',
                      active
                        ? 'border-primary text-[var(--text-primary)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        'num rounded-full px-1.5 py-0.5 text-[11px]',
                        active ? 'bg-primary/10 text-primary' : 'bg-[var(--surface-2)] text-[var(--text-muted)]',
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="scroll-x -mx-1">
              <table className="w-full min-w-[840px] border-separate" style={{ borderSpacing: '0 2px' }}>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Reference</Th>
                    <Th>Borrower</Th>
                    <Th>Issue</Th>
                    <Th>Stage</Th>
                    <Th>Amount</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, i) => (
                    <Row key={`${item.kind}-${item.loanReference}-${i}`} item={item} index={i} loanByRef={loanByRef} />
                  ))}
                </tbody>
              </table>
            </div>

            {shown.length > PAGE_SIZE && (
              <div className="row flex-wrap gap-3 pt-3">
                <span className="t-meta num grow">
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, shown.length)} of {shown.length}
                </span>
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

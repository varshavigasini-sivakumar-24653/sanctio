import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Calendar, Check, Filter, Plus, Search } from 'lucide-react';
import { AccountMenu } from './components/Sidebar';
import { Pill, Skeleton, ThemeToggle } from './components/ui';
import Sidebar from './components/Sidebar';
import NewApplicationModal from './components/NewApplicationModal';
import { useAuth } from './lib/providers';
import { api } from './lib/api';
import { useAsync } from './lib/useAsync';
import { cn } from './lib/cn';
import {
  SLA_STATES,
  SLA_STATE_LABEL,
  parsePipelineFilters,
  pipelineFilterCount,
  quarterKey,
  quarterLabel,
  toggleParamValue,
} from './lib/pipelineFilters';
import Login from './screens/Login';
import Pipeline from './screens/Pipeline';
import LoanFile from './screens/LoanFile';
import CreditDesk from './screens/CreditDesk';
import DealDesk from './screens/DealDesk';
import ModuleList from './screens/ModuleList';

const KIND_LABEL = { sla: 'SLA', deviation: 'Deviation', covenant: 'Covenant', tranche: 'Disbursement' };

function GlobalSearch() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^ln-\d{4}-\d+$/i.test(v)) {
      navigate(`/loans/${encodeURIComponent(v.toUpperCase())}`);
    } else if (/pipeline/i.test(v)) navigate('/pipeline');
    else if (/credit/i.test(v)) navigate('/credit-desk');
    else if (/deal/i.test(v)) navigate('/deal-desk');
    setQ('');
  };

  return (
    <form onSubmit={submit} className="row relative w-full max-w-[380px]">
      <Search size={15} className="pointer-events-none absolute left-3 text-ink-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder="Search a loan — try LN-2026-0007"
        aria-label="Search"
        className="h-9 w-full rounded-control border pl-9 pr-3 text-[13px] transition-colors focus:outline-none"
        style={{ background: 'var(--surface-2)', borderColor: 'transparent' }}
      />
    </form>
  );
}

/** Shared open/close-on-outside-click plumbing for every topbar popover. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return { open, setOpen, ref };
}

/** Honest placeholder for a control that has nothing to act on outside its one
 * supported screen — used by Filter/quarter when the visitor isn't on Pipeline. */
function NotHerePopover({ icon: Icon, label, note }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-secondary gap-1.5" onClick={() => setOpen((o) => !o)}>
        <Icon size={14} />
        {label}
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-64 p-3">
          <p className="t-meta leading-relaxed">{note}</p>
        </div>
      )}
    </div>
  );
}

/** Filters the Pipeline board's own cards by SLA state and sector — writes into the
 * URL so it's the same state the board reads, shareable, and survives a refresh. */
function FilterPopover({ loans }) {
  const { open, setOpen, ref } = usePopover();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parsePipelineFilters(searchParams);
  const activeCount = pipelineFilterCount(filters);

  const sectors = useMemo(
    () => [...new Set(loans.map((l) => l.sector).filter(Boolean))].sort(),
    [loans],
  );

  if (!loans.length && !activeCount) {
    return <NotHerePopover icon={Filter} label="Filter" note="Filters apply once the Pipeline board has files to filter." />;
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-secondary gap-1.5" onClick={() => setOpen((o) => !o)}>
        <Filter size={14} />
        Filter
        {activeCount > 0 && (
          <span className="num rounded-full bg-primary px-1.5 py-0.5 text-[11px] text-white">{activeCount}</span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-64 stack gap-3 p-3.5">
          <div className="stack gap-1.5">
            <span className="t-section">SLA state</span>
            {SLA_STATES.map((s) => (
              <label key={s} className="row gap-2 text-[13px]" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.sla.includes(s)}
                  onChange={() => setSearchParams(toggleParamValue(searchParams, 'sla', s))}
                />
                {SLA_STATE_LABEL[s]}
              </label>
            ))}
          </div>
          {sectors.length > 0 && (
            <div className="stack gap-1.5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <span className="t-section">Sector</span>
              <div className="stack gap-1.5" style={{ maxHeight: 160, overflowY: 'auto' }}>
                {sectors.map((s) => (
                  <label key={s} className="row gap-2 text-[13px]" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={filters.sector.includes(s)}
                      onChange={() => setSearchParams(toggleParamValue(searchParams, 'sector', s))}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost h-8 justify-start px-1 text-[12.5px]"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('sla');
                next.delete('sector');
                setSearchParams(next);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Real quarters, computed from each file's actual Zoho `created_time` — not a
 * simulated range. A portfolio seeded in one sitting will mostly show one quarter,
 * which is the honest answer, not a bug. */
function QuarterPopover({ loans }) {
  const { open, setOpen, ref } = usePopover();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('quarter') || 'all';

  const quarters = useMemo(
    () => [...new Set(loans.map((l) => quarterKey(l.originatedOn)).filter(Boolean))].sort().reverse(),
    [loans],
  );

  if (!quarters.length) {
    return (
      <NotHerePopover
        icon={Calendar}
        label="All time"
        note="Quarter filtering applies once the Pipeline board has files with an origination date."
      />
    );
  }

  const label = selected === 'all' ? 'All time' : quarterLabel(selected);
  const pick = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('quarter');
    else next.set('quarter', value);
    setSearchParams(next);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-secondary gap-1.5" onClick={() => setOpen((o) => !o)}>
        <Calendar size={14} />
        {label}
      </button>
      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-52 stack gap-0.5 p-1.5">
          <button type="button" className="btn btn-ghost h-9 justify-between px-2.5 text-[13px]" onClick={() => pick('all')}>
            All time
            {selected === 'all' && <Check size={14} />}
          </button>
          {quarters.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-ghost h-9 justify-between px-2.5 text-[13px]"
              onClick={() => pick(q)}
            >
              {quarterLabel(q)}
              {selected === q && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data } = useAsync(() => api.attention(), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = data?.items?.slice(0, 6) || [];
  const critical = data?.counts?.critical || 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost relative"
        style={{ width: 36, padding: 0 }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Bell size={16} strokeWidth={1.8} />
        {critical > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full" style={{ background: 'var(--critical)' }} />
        )}
      </button>

      {open && (
        <div className="card absolute right-0 top-[calc(100%+8px)] z-50 w-80 stack p-1.5">
          <div className="row gap-2 px-2.5 py-2">
            <span className="t-section grow">Needs attention</span>
            {data && <span className="t-meta num">{data.counts.total} items</span>}
          </div>
          <hr className="hairline" />
          {!data && <div className="stack gap-2 p-2.5"><Skeleton height={36} /><Skeleton height={36} /></div>}
          {data && items.length === 0 && <p className="t-meta px-2.5 py-4 text-center">Nothing needs attention.</p>}
          <div className="stack max-h-80 gap-0.5 overflow-y-auto p-1">
            {items.map((item, i) => (
              <div key={i} className="row items-start gap-2.5 rounded-lg p-2 hover:bg-[var(--surface-2)]">
                <Pill tone={item.severity} className="mt-0.5 flex-none">
                  {KIND_LABEL[item.kind] || item.kind}
                </Pill>
                <span className="min-w-0 grow text-[12.5px] leading-snug">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NewApplicationButton() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  // Only a Relationship Manager originates new files — same server-side rule as
  // loanfile.create (auth.js), so a role that can't act on this just doesn't see it,
  // rather than seeing a disabled control with an explanation.
  if (!can('loanfile.create')) return null;

  return (
    <>
      <button type="button" className="btn btn-primary gap-1.5" onClick={() => setOpen(true)}>
        <Plus size={15} />
        New Application
      </button>
      <NewApplicationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TopBar() {
  const location = useLocation();
  const onPipeline = location.pathname === '/pipeline';
  // Pipeline is fetched again here (independent of the Pipeline screen's own
  // useAsync) so the Filter/quarter popovers know the real sectors and origination
  // quarters — the same lightweight duplicate-fetch pattern NotificationsMenu
  // already uses for its own attention summary.
  const { data: pipelineData } = useAsync(() => api.pipeline(), []);
  const loans = pipelineData?.loans || [];

  return (
    <header
      className="row flex-none gap-4 border-b px-6"
      style={{
        height: 'var(--topbar)',
        background: 'color-mix(in srgb, var(--surface-1) 92%, transparent)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <GlobalSearch />
      <div className="grow" />

      <div className="row gap-2">
        {onPipeline && (
          <>
            <FilterPopover loans={loans} />
            <QuarterPopover loans={loans} />
          </>
        )}
        <NewApplicationButton />
      </div>

      <div className="row gap-1 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
        <ThemeToggle />
        <NotificationsMenu />
        <AccountMenu compact />
      </div>
    </header>
  );
}

function Shell({ children }) {
  return (
    // height (not minHeight) is what keeps the sidebar pinned — with only a floor,
    // a tall screen grows the whole page and the rail scrolls away with it instead of
    // staying put while <main> scrolls internally.
    <div className="row items-stretch" style={{ height: '100%' }}>
      <Sidebar />
      {/* minWidth:0 is what stops a wide table from pushing the rail off-screen —
        * without it a flex child refuses to shrink below its content width. */}
      <div className="stack grow" style={{ minWidth: 0, height: '100%' }}>
        <TopBar />
        <main
          className="grow"
          style={{
            minWidth: 0,
            minHeight: 0,
            overflowX: 'hidden',
            overflowY: 'auto',
            background:
              'radial-gradient(1100px 520px at 100% -8%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%), radial-gradient(900px 480px at -6% 10%, color-mix(in srgb, #10B981 12%, transparent), transparent 60%), radial-gradient(800px 460px at 60% 105%, color-mix(in srgb, #F59E0B 9%, transparent), transparent 60%), var(--page)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function BootSkeleton() {
  return (
    <div className="stack gap-4 p-6" style={{ maxWidth: 960, margin: '0 auto' }}>
      <Skeleton height={28} width={220} />
      <div className="row gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grow">
            <Skeleton height={110} radius={16} />
          </div>
        ))}
      </div>
      <Skeleton height={320} radius={16} />
    </div>
  );
}

export default function App() {
  const { status } = useAuth();

  // Restoring an existing token — show the app's skeleton, not the login screen.
  // Flashing login on every refresh is the kind of detail that reads as unfinished.
  if (status === 'checking') return <BootSkeleton />;

  if (status !== 'signed-in') {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/loans/:ref" element={<LoanFile />} />
        <Route path="/credit-desk" element={<CreditDesk />} />
        <Route path="/deal-desk" element={<DealDesk />} />
        <Route path="/modules/:module" element={<ModuleList />} />
        <Route path="*" element={<Navigate to="/pipeline" replace />} />
      </Routes>
    </Shell>
  );
}

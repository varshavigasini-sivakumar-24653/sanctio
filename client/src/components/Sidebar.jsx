import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsUpDown, Handshake, KanbanSquare, LogOut, ScrollText } from 'lucide-react';
import { MODULES } from '../lib/modules';
import { useAuth } from '../lib/providers';
import { Avatar, ModuleIcon, Wordmark } from './ui';
import { cn } from '../lib/cn';

/* Left rail. Two groups, deliberately separated:
 *
 *   Work    — the task-shaped screens a person opens to get something done
 *   Modules — the raw record browsers, one per custom module
 *
 * Mixing them would bury the pipeline among six lookup tables. The work comes first
 * because that is what someone signs in to do; the modules are reference data. */

const WORK = [
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/credit-desk', label: 'Credit Desk', icon: ScrollText },
  { to: '/deal-desk', label: 'Deal Desk', icon: Handshake },
];

// Documents and Reports round out the spec but have no module or endpoint behind them
// yet — shown so the information architecture reads complete, disabled rather than
// wired to a fake page.
const SOON = ['Documents', 'Reports'];

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'row gap-2.5 h-9 rounded-lg px-2.5 text-[13px] transition-colors duration-150',
          isActive
            ? 'bg-white/10 font-semibold text-white'
            : 'font-normal text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
        )
      }
    >
      <Icon size={16} strokeWidth={1.8} className="flex-none" />
      <span className="grow truncate">{label}</span>
    </NavLink>
  );
}

function ModuleItem({ mod }) {
  return (
    <NavLink
      to={`/modules/${mod.api}`}
      title={mod.blurb}
      className={({ isActive }) =>
        cn(
          'row gap-2.5 h-9 rounded-lg px-2.5 text-[13px] transition-colors duration-150',
          isActive
            ? 'bg-white/10 font-semibold text-white'
            : 'font-normal text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
        )
      }
    >
      <ModuleIcon name={mod.icon} className="flex-none" />
      <span className="grow truncate">{mod.label}</span>
    </NavLink>
  );
}

/** Account switcher — used both as the full sidebar footer card and (compact) in the
 * topbar. Same close-on-outside-click / Escape handling either way. */
export function AccountMenu({ compact = false }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const doSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'row w-full gap-2.5 rounded-lg text-left transition-colors duration-150',
          compact ? 'h-9 px-1.5 hover:bg-black/5' : 'p-2 hover:bg-white/[0.06]',
        )}
      >
        <Avatar name={user.name} size={compact ? 28 : 30} />
        {!compact && (
          <span className="stack min-w-0 grow gap-0">
            <span className="truncate text-[13px] font-semibold text-slate-100">{user.name}</span>
            <span className="truncate text-[11.5px] text-slate-400">{user.title}</span>
          </span>
        )}
        <ChevronsUpDown size={14} className={compact ? 'text-ink-muted' : 'flex-none text-slate-500'} />
      </button>

      {open && (
        <div
          role="menu"
          className="card stack absolute z-50 w-60 p-1.5"
          style={{
            [compact ? 'right' : 'left']: 0,
            [compact ? 'top' : 'bottom']: compact ? 'calc(100% + 8px)' : 'calc(100% + 8px)',
          }}
        >
          <div className="stack gap-0.5 px-2.5 py-2">
            <span className="text-[13px] font-semibold">{user.name}</span>
            <span className="t-meta">{user.title}</span>
            <span className="t-meta">{user.username}</span>
          </div>
          <hr className="hairline my-1" />

          {confirming ? (
            <div className="stack gap-2 px-1 py-1">
              <span className="t-meta px-1.5">Sign out of Sanctio?</span>
              <div className="row gap-2">
                <button type="button" className="btn btn-danger grow" onClick={doSignOut}>
                  Sign out
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost justify-start gap-2"
              onClick={() => setConfirming(true)}
            >
              <LogOut size={14} />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="stack flex-none gap-6 overflow-y-auto p-3"
      style={{ width: 'var(--rail)', background: 'var(--navy)', borderRight: '1px solid var(--navy-border)' }}
    >
      <div className="row h-11 gap-2 px-1.5">
        <Wordmark className="text-slate-50" />
      </div>

      <div className="stack gap-1">
        <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Work
        </span>
        {WORK.map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
          >
            <NavItem {...item} />
          </motion.div>
        ))}
      </div>

      <div className="stack gap-1">
        <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Modules
        </span>
        {MODULES.map((m) => (
          <ModuleItem key={m.api} mod={m} />
        ))}
        {SOON.map((label) => (
          <div
            key={label}
            className="row h-9 gap-2.5 rounded-lg px-2.5 text-[13px] text-slate-600"
            title={`${label} — coming soon`}
          >
            <span className="h-4 w-4 flex-none rounded-sm border border-dashed border-slate-700" />
            <span className="grow truncate">{label}</span>
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">
              Soon
            </span>
          </div>
        ))}
      </div>

      <div className="grow" />

      <div className="stack gap-2 border-t border-white/10 pt-3">
        <AccountMenu />
      </div>
    </nav>
  );
}

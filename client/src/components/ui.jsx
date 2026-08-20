import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { AlertTriangle, Inbox, Moon, Sun, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useTheme } from '../lib/providers';
import { initials, money, moneyFull } from '../lib/format';
import { cn } from '../lib/cn';

/* Product mark — three ascending bars: a file moving through stages. */
export function Mark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sanctio-mark-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="55%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#sanctio-mark-grad)" />
      <rect x="6" y="14" width="3.5" height="5" rx="1.75" fill="#fff" opacity="0.55" />
      <rect x="11.5" y="10" width="3.5" height="9" rx="1.75" fill="#fff" opacity="0.8" />
      <rect x="17" y="5" width="3.5" height="14" rx="1.75" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 24, className }) {
  return (
    <span className={cn('row gap-2 font-semibold text-[16.5px] tracking-tight', className)}>
      <Mark size={size} />
      Sanctio
    </span>
  );
}

/* One stroke icon per module. Distinct silhouettes, not six variations of a table —
 * in a sidebar the shape is what the eye picks up before the label, so if they all look
 * the same the icons are decoration rather than navigation. */
const ICONS = {
  building: (
    <>
      <path d="M4 20V6.5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13 6.5V20" />
      <path d="M13 20V11h5.5A1.5 1.5 0 0 1 20 12.5V20" />
      <path d="M2.5 20h19" strokeLinecap="round" />
      <path d="M7 9h2M7 13h2M16 15h1.5" strokeLinecap="round" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5z" />
      <path d="M3.5 12.5 12 17l8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4-2.9 7.4-7 9-4.1-1.6-7-5-7-9V6l7-2.5z" />
      <path d="M9.2 12.2l2 2 3.6-3.8" strokeLinecap="round" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4.2-4.4" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.4" />
      <path d="M3.6 19.5h16.8" strokeLinecap="round" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3.2" rx="1" />
      <path d="M9.2 11.5l1.4 1.4 2.6-2.8M9.2 16.2l1.4 1.4 2.6-2.8" strokeLinecap="round" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 10v4M18 10v4" strokeLinecap="round" />
    </>
  ),
};

export function ModuleIcon({ name, size = 17, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('flex-none', className)}
    >
      {ICONS[name] || ICONS.layers}
    </svg>
  );
}

/* Status is never colour alone — the dot carries the hue, the text carries meaning. */
export function Pill({ tone = 'neutral', children, className }) {
  return <span className={cn(`pill pill-${tone}`, className)}>{children}</span>;
}

/** Counts up from 0 on mount/change — the "money moving" feel Mercury/Ramp use for
 * headline metrics. Formats every animation frame, so it accepts the same formatter
 * (money, plain integer, …) the resting value would use. */
export function AnimatedNumber({ value, format, duration = 0.9 }) {
  const target = Number(value) || 0;
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(format ? format(0) : '0');

  useEffect(() => {
    const controls = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format ? format(v) : Math.round(v).toLocaleString('en-IN')),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <span className="num tabular-nums">{display}</span>;
}

const KPI_ICON_WASH = {
  primary: 'bg-gradient-to-br from-primary-wash to-violet-wash text-primary',
  success: 'bg-gradient-to-br from-success-wash to-emerald-100 text-success',
  warning: 'bg-gradient-to-br from-warning-wash to-amber-100 text-[#92650c]',
  danger: 'bg-gradient-to-br from-danger-wash to-red-100 text-danger',
  violet: 'bg-gradient-to-br from-violet-wash to-fuchsia-100 text-violet',
  info: 'bg-gradient-to-br from-info-wash to-sky-100 text-info',
};

const KPI_BAR = {
  primary: 'from-primary to-violet',
  success: 'from-success to-emerald-400',
  warning: 'from-warning to-amber-400',
  danger: 'from-danger to-rose-400',
  violet: 'from-violet to-fuchsia-400',
  info: 'from-info to-sky-400',
};

// The hex twin of each tone — used to tint the card's own background (not just the
// icon well) via color-mix, so the card reads as colourful against the tone-neutral
// --surface-1 in BOTH themes, light or dark, without a separate light/dark map.
const KPI_TONE_HEX = {
  primary: '#4F46E5',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  violet: '#8B5CF6',
  info: '#0EA5E9',
};

/** Headline KPI tile — icon, animated metric, optional growth chip, small description.
 * Soft tinted icon well, hover lift, and a glow on the accent ring. Growth is only
 * ever shown when the caller actually has a comparable prior-period figure to hand —
 * a fabricated trend on a lending dashboard is worse than no trend at all. */
export function KpiCard({ icon: Icon, label, value, format, sub, growthPct, tone = 'primary', delay = 0 }) {
  const hasGrowth = growthPct != null && Number.isFinite(growthPct);
  const up = hasGrowth && growthPct >= 0;
  const hex = KPI_TONE_HEX[tone] || KPI_TONE_HEX.primary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="card group relative overflow-hidden p-6 transition-shadow duration-200 hover:shadow-lift"
      style={{
        background: `linear-gradient(165deg, color-mix(in srgb, ${hex} 16%, var(--surface-1)), var(--surface-1) 65%)`,
        borderColor: `color-mix(in srgb, ${hex} 20%, var(--border))`,
      }}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r', KPI_BAR[tone] || KPI_BAR.primary)} />
      <div
        className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.24]"
        style={{ background: hex }}
      />
      <div className="row items-start justify-between">
        <span className="t-section">{label}</span>
        {Icon && (
          <span className={cn('center h-9 w-9 rounded-xl', KPI_ICON_WASH[tone] || KPI_ICON_WASH.primary)}>
            <Icon size={17} strokeWidth={2} />
          </span>
        )}
      </div>

      <div className="mt-3 text-[32px] font-bold leading-none tracking-tight">
        {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
      </div>

      <div className="row mt-3 gap-2">
        {hasGrowth && (
          <span
            className={cn(
              'row gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
              up ? 'bg-success-wash text-success' : 'bg-danger-wash text-danger',
            )}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(growthPct).toFixed(1)}%
          </span>
        )}
        {sub && <span className="t-meta">{sub}</span>}
      </div>
    </motion.div>
  );
}

/** Money with the full rupee figure on hover — ₹40.00 Cr / ₹40,00,00,000. */
export function Money({ cr, bold }) {
  return (
    <span className="num" title={moneyFull(cr)} style={{ fontWeight: bold ? 600 : 400 }}>
      {money(cr)}
    </span>
  );
}

const AVATAR_HUES = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function Avatar({ name, size = 26, className }) {
  const hue = hueFor(name || '?');
  return (
    <span
      title={name}
      className={cn('center flex-none rounded-full font-semibold text-white', className)}
      style={{
        width: size,
        height: size,
        fontSize: size <= 24 ? 10.5 : 13,
        background: hue,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* Skeletons match the final layout so nothing shifts when data lands. A centred
 * spinner reflows the page and reads as slower than it is. */
export function Skeleton({ height = 16, width = '100%', radius = 8, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer', className)}
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%)',
        backgroundSize: '400% 100%',
      }}
    />
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="stack center gap-[10px] py-14 text-center">
      <div className="center h-11 w-11 rounded-2xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        <Inbox size={20} strokeWidth={1.8} />
      </div>
      <div className="font-semibold">{title}</div>
      {hint && (
        <div className="t-meta" style={{ maxWidth: 340 }}>
          {hint}
        </div>
      )}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="stack center gap-3 py-14 text-center">
      <div className="center h-11 w-11 rounded-2xl bg-danger-wash text-danger">
        <AlertTriangle size={20} strokeWidth={1.8} />
      </div>
      <Pill tone="critical">Failed to load</Pill>
      <div className="t-meta" style={{ maxWidth: 360 }}>
        {message || 'Something went wrong.'}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

/** Portal-mounted so it escapes any `overflow` ancestor (the scrollable <main>,
 * a sticky sidebar) — without the portal a modal opened from deep in the tree can
 * end up clipped or scrolled with its trigger instead of centered on the viewport. */
export function Modal({ open, onClose, title, children, width = 480 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'var(--overlay)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card stack w-full gap-4 p-6"
            style={{ maxWidth: width, maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)' }}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="row gap-2">
              <span className="t-page-title grow" style={{ fontSize: 19 }}>
                {title}
              </span>
              <button type="button" className="btn btn-ghost" style={{ width: 32, padding: 0 }} onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      style={{ width: 36, padding: 0 }}
    >
      {dark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  );
}

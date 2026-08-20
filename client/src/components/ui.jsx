import { useTheme } from '../lib/providers';
import { initials, money, moneyFull } from '../lib/format';

/* Product mark — three ascending bars: a file moving through stages. Geometric and
 * flat on purpose; a gradient logo is the fastest way to look like a demo. */
export function Mark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <rect x="6" y="14" width="3.5" height="5" rx="1.75" fill="#fff" opacity="0.55" />
      <rect x="11.5" y="10" width="3.5" height="9" rx="1.75" fill="#fff" opacity="0.8" />
      <rect x="17" y="5" width="3.5" height="14" rx="1.75" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 22 }) {
  return (
    <span className="row gap-8" style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
      <Mark size={size} />
      Sanctio
    </span>
  );
}

/* Status is never colour alone — the dot carries the hue, the text carries meaning. */
export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function StatTile({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="t-meta" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub != null && (
        <div className="row gap-8" style={{ marginTop: 8 }}>
          {tone ? <Pill tone={tone}>{sub}</Pill> : <span className="t-meta">{sub}</span>}
        </div>
      )}
    </div>
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

export function Avatar({ name, size = 24 }) {
  return (
    <span
      title={name}
      className="center"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--surface-3)',
        color: 'var(--text-secondary)',
        fontSize: size <= 24 ? 10 : 12,
        fontWeight: 600,
        flex: 'none',
      }}
    >
      {initials(name)}
    </span>
  );
}

/* Skeletons match the final layout so nothing shifts when data lands. A centred
 * spinner reflows the page and reads as slower than it is. */
export function Skeleton({ height = 16, width = '100%', radius = 4 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%)',
        backgroundSize: '400% 100%',
        animation: 'sanctio-shimmer 1.4s ease-in-out infinite',
      }}
    />
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="stack center gap-8" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div
        className="center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'var(--surface-2)',
          color: 'var(--text-muted)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="t-meta" style={{ maxWidth: 320 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="stack center gap-12" style={{ padding: '48px 24px', textAlign: 'center' }}>
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
      style={{ width: 32, padding: 0 }}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

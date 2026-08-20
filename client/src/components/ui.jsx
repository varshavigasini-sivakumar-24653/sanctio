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

export function Wordmark({ size = 24 }) {
  return (
    <span className="row gap-8" style={{ fontWeight: 600, fontSize: 16.5, letterSpacing: '-0.015em' }}>
      <Mark size={size} />
      Sanctio
    </span>
  );
}

/* One stroke icon per module. Distinct silhouettes, not six variations of a table —
 * in a sidebar the shape is what the eye picks up before the label, so if they all look
 * the same the icons are decoration rather than navigation. */
const ICONS = {
  // Borrowers — a company building
  building: (
    <>
      <path d="M4 20V6.5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13 6.5V20" />
      <path d="M13 20V11h5.5A1.5 1.5 0 0 1 20 12.5V20" />
      <path d="M2.5 20h19" strokeLinecap="round" />
      <path d="M7 9h2M7 13h2M16 15h1.5" strokeLinecap="round" />
    </>
  ),
  // Facilities — stacked limits inside one sanction
  layers: (
    <>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5z" />
      <path d="M3.5 12.5 12 17l8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
  // Collateral — security held
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4-2.9 7.4-7 9-4.1-1.6-7-5-7-9V6l7-2.5z" />
      <path d="M9.2 12.2l2 2 3.6-3.8" strokeLinecap="round" />
    </>
  ),
  // Risk — a scored gauge
  gauge: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4.2-4.4" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.4" />
      <path d="M3.6 19.5h16.8" strokeLinecap="round" />
    </>
  ),
  // Conditions — a covenant checklist
  clipboard: (
    <>
      <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3.2" rx="1" />
      <path d="M9.2 11.5l1.4 1.4 2.6-2.8M9.2 16.2l1.4 1.4 2.6-2.8" strokeLinecap="round" />
    </>
  ),
  // Tranches — money moving out
  banknote: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 10v4M18 10v4" strokeLinecap="round" />
    </>
  ),
};

export function ModuleIcon({ name, size = 17 }) {
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
      style={{ flex: 'none' }}
    >
      {ICONS[name] || ICONS.layers}
    </svg>
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
      <div className="num" style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>
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

export function Avatar({ name, size = 26 }) {
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
        fontSize: size <= 24 ? 11 : 13,
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

import { NavLink } from 'react-router-dom';
import { MODULES } from '../lib/modules';

/* Left rail. Two groups, deliberately separated:
 *
 *   Work    — the task-shaped screens a person opens to get something done
 *   Modules — the raw record browsers, one per custom module
 *
 * Mixing them would bury the pipeline among six lookup tables. The work comes first
 * because that is what someone signs in to do; the modules are reference data. */

const WORK = [
  {
    to: '/pipeline',
    label: 'Pipeline',
    icon: (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="10" y="4" width="5" height="11" rx="1.5" />
        <rect x="17" y="4" width="4" height="7" rx="1.5" />
      </>
    ),
  },
  {
    to: '/credit-desk',
    label: 'Credit Desk',
    icon: (
      <>
        <path d="M4 6h16M4 12h16M4 18h9" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: '/deal-desk',
    label: 'Deal Desk',
    icon: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
      </>
    ),
  },
];

function Icon({ children }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      {children}
    </svg>
  );
}

const linkStyle = ({ isActive }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 10px',
  borderRadius: 'var(--r-md)',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: isActive ? 600 : 400,
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
  background: isActive ? 'var(--accent-wash)' : 'transparent',
  transition: 'background 150ms ease-out, color 150ms ease-out',
});

export default function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="stack gap-16"
      style={{
        width: 'var(--rail)',
        flex: 'none',
        padding: 12,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface-1)',
        overflowY: 'auto',
      }}
    >
      <div className="stack gap-4">
        <span className="t-section" style={{ fontSize: 11, padding: '0 10px 4px' }}>
          Work
        </span>
        {WORK.map((item) => (
          <NavLink key={item.to} to={item.to} style={linkStyle}>
            {({ isActive }) => (
              <>
                <Icon>{item.icon}</Icon>
                <span className="grow">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="stack gap-4">
        <span className="t-section" style={{ fontSize: 11, padding: '0 10px 4px' }}>
          Modules
        </span>
        {MODULES.map((m) => (
          <NavLink
            key={m.api}
            to={`/modules/${m.api}`}
            style={linkStyle}
            title={m.blurb}
          >
            <Icon>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M3.5 9.5h17M9 9.5v10" />
            </Icon>
            <span
              className="grow"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {m.label}
            </span>
          </NavLink>
        ))}
      </div>

      <div className="grow" />

      <div className="stack gap-4" style={{ padding: '0 10px' }}>
        <span className="t-meta">Records live in Zoho Projects</span>
        <span className="t-meta">Portal 60083699064</span>
      </div>
    </nav>
  );
}

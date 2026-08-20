import { useEffect, useRef, useState } from 'react';
import { Mark, ThemeToggle } from '../components/ui';
import { useAuth } from '../lib/providers';

/* The one-click role cards are the highest-leverage UI in the build: a reviewer
 * clicks all three in thirty seconds instead of typing passwords off a submission
 * form, and sees the role-based difference immediately.
 *
 * Passwords live here rather than coming from /auth/roster on purpose — the roster
 * endpoint deliberately never returns credentials, so it can't become a credential
 * dump if it is ever exposed. These three are published in the submission anyway. */
const DEMO_ROLES = [
  {
    username: 'rm@sanctio.demo',
    password: 'SanctioRM2026',
    name: 'Meera Raghavan',
    title: 'Relationship Manager',
    blurb: 'Originates loan files, maintains borrowers, submits for appraisal',
  },
  {
    username: 'credit@sanctio.demo',
    password: 'SanctioCR2026',
    name: 'Arjun Iyer',
    title: 'Credit & Risk Officer',
    blurb: 'Appraises, scores, approves deviations, sanctions',
  },
  {
    username: 'ops@sanctio.demo',
    password: 'SanctioOPS2026',
    name: 'Kavitha Nair',
    title: 'Operations',
    blurb: 'Verifies conditions, releases tranches, records utilization',
  },
];

export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'form' | <role username>
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  async function attempt(user, pass, source) {
    setError(null);
    setBusy(source);
    try {
      await signIn(user, pass);
      // On success the route guard swaps this screen out; no navigation needed.
    } catch (e) {
      setError(e.message || 'Sign in failed');
      setBusy(null);
    }
  }

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter both your email and password');
      return;
    }
    attempt(username, password, 'form');
  };

  const useRole = (role) => {
    setUsername(role.username);
    setPassword(role.password);
    attempt(role.username, role.password, role.username);
  };

  return (
    <div
      className="stack"
      style={{ minHeight: '100%', background: 'var(--page)', padding: 24 }}
    >
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <ThemeToggle />
      </div>

      <div className="grow center">
        <div className="stack gap-24" style={{ width: '100%', maxWidth: 440 }}>
          {/* Brand + positioning */}
          <div className="stack gap-12" style={{ alignItems: 'center', textAlign: 'center' }}>
            <Mark size={40} />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Sanctio</h1>
              <p className="t-meta" style={{ marginTop: 4, fontSize: 12 }}>
                Commercial loan origination &amp; disbursement
              </p>
            </div>
          </div>

          {/* Credentials */}
          <form className="card stack gap-16" style={{ padding: 24 }} onSubmit={submit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                ref={userRef}
                className="input"
                type="email"
                autoComplete="username"
                placeholder="you@sanctio.demo"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                disabled={busy !== null}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                disabled={busy !== null}
              />
            </div>

            {/* Inline, next to the fields — never a browser alert or a toast. */}
            {error && (
              <div className="field-error" id="login-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy !== null}
            >
              {busy === 'form' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* One-click demo roles */}
          <div className="stack gap-12">
            <div className="row gap-12">
              <hr className="hairline grow" />
              <span className="t-meta" style={{ whiteSpace: 'nowrap' }}>
                or sign in as
              </span>
              <hr className="hairline grow" />
            </div>

            <div className="stack gap-8">
              {DEMO_ROLES.map((role) => (
                <button
                  key={role.username}
                  type="button"
                  className="card row gap-12"
                  onClick={() => useRole(role)}
                  disabled={busy !== null}
                  /* Without this the accessible name is the concatenated child text —
                   * "Relationship ManagerOriginates loan files, maintains borrowers…".
                   * Screen readers announce the run-together string. */
                  aria-label={`Sign in as ${role.title}, ${role.name}`}
                  style={{
                    padding: 12,
                    textAlign: 'left',
                    cursor: busy !== null ? 'not-allowed' : 'pointer',
                    background: 'var(--surface-1)',
                    transition: 'border-color 150ms ease-out, background 150ms ease-out',
                  }}
                  onMouseEnter={(e) => {
                    if (busy === null) e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  <span className="stack grow gap-4">
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{role.title}</span>
                    <span className="t-meta">{role.blurb}</span>
                  </span>
                  <span className="t-meta" style={{ flex: 'none' }}>
                    {busy === role.username ? 'Signing in…' : '→'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="t-meta" style={{ textAlign: 'center' }}>
            Loan data lives in Zoho Projects · Hosted on Zoho Catalyst
          </p>
        </div>
      </div>
    </div>
  );
}

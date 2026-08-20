import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight } from 'lucide-react';
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
      style={{
        minHeight: '100%',
        padding: 24,
        background:
          'radial-gradient(900px 500px at 50% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%), radial-gradient(700px 420px at 100% 100%, color-mix(in srgb, #10B981 13%, transparent), transparent 60%), radial-gradient(650px 380px at 0% 90%, color-mix(in srgb, #F59E0B 10%, transparent), transparent 60%), var(--page)',
      }}
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
                <AlertCircle size={14} />
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

            <div className="stack gap-2">
              {DEMO_ROLES.map((role, i) => (
                <motion.button
                  key={role.username}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  whileHover={busy === null ? { y: -2 } : undefined}
                  className="card row gap-3 p-3.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-lift disabled:cursor-not-allowed"
                  onClick={() => useRole(role)}
                  disabled={busy !== null}
                  /* Without this the accessible name is the concatenated child text —
                   * "Relationship ManagerOriginates loan files, maintains borrowers…".
                   * Screen readers announce the run-together string. */
                  aria-label={`Sign in as ${role.title}, ${role.name}`}
                >
                  <span className="stack grow gap-1">
                    <span className="text-[13px] font-semibold">{role.title}</span>
                    <span className="t-meta">{role.blurb}</span>
                  </span>
                  <span className="t-meta row flex-none gap-1">
                    {busy === role.username ? 'Signing in…' : <ArrowRight size={14} />}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          <p className="t-meta text-center">
            Loan data lives in Zoho Projects · Hosted on Zoho Catalyst
          </p>
        </div>
      </div>
    </div>
  );
}

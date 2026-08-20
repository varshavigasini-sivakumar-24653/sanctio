import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';

/* ── Theme ─────────────────────────────────────────────────────────────────── */

const ThemeCtx = createContext(null);
const THEME_KEY = 'sanctio-theme';

export function ThemeProvider({ children }) {
  // index.html already stamped data-theme before first paint; read it back rather
  // than recomputing, so React never disagrees with what is already on screen.
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private browsing — the in-memory theme still works */
    }
  }, [theme]);

  const value = useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

/* ── Auth ──────────────────────────────────────────────────────────────────── */

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'checking' : 'anonymous');

  // Restore an existing session on load, so a refresh doesn't bounce the user to
  // the login screen mid-demo.
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    api
      .session()
      .then((r) => {
        if (alive) {
          setUser(r.user);
          setStatus('signed-in');
        }
      })
      .catch(() => {
        if (alive) {
          clearToken();
          setStatus('anonymous');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // The api layer fires this on any 401, so an expired token drops us to the
  // login screen from anywhere without each screen handling it.
  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener('sanctio:signed-out', onSignedOut);
    return () => window.removeEventListener('sanctio:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
    setStatus('signed-in');
    return res.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Signing out must always succeed locally, even if the call fails.
    }
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut, can: capability(user) }),
    [user, status, signIn, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/* Mirrors functions/sanctio_api/auth.js PERMISSIONS. The server is what actually
 * enforces this — these are only used to hide controls a role cannot use, so the
 * UI never offers an action that will 403. */
const ROLE_CAPS = {
  RELATIONSHIP_MANAGER: ['Submit', 'borrower', 'facility', 'loanfile.create', 'document.upload'],
  CREDIT_OFFICER: [
    'Pick Up',
    'Raise Deviation',
    'Approve Deviation',
    'Reject Deviation',
    'Return to RM',
    'Recommend',
    'Sanction',
    'Decline',
    'Hold',
    'risk_assessment',
    'collateral',
    'sanction_condition',
    'deviation',
  ],
  OPERATIONS: [
    'Documentation',
    'Disburse',
    'disbursement_tranche',
    'sanction_condition.verify',
  ],
};

function capability(user) {
  const caps = user ? ROLE_CAPS[user.role] || [] : [];
  return (what) => caps.includes(what);
}

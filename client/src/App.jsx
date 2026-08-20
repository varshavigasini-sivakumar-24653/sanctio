import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Avatar, Skeleton, ThemeToggle, Wordmark } from './components/ui';
import Sidebar from './components/Sidebar';
import { useAuth } from './lib/providers';
import Login from './screens/Login';
import Pipeline from './screens/Pipeline';
import LoanFile from './screens/LoanFile';
import CreditDesk from './screens/CreditDesk';
import DealDesk from './screens/DealDesk';
import ModuleList from './screens/ModuleList';

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Close on outside click and on Escape — a dropdown that traps the user is a
  // small thing that reads as broken.
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost row gap-8"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.name} />
        <span style={{ fontSize: 12 }}>{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="stack"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 232,
            background: 'var(--surface-1)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-pop)',
            padding: 6,
            zIndex: 50,
          }}
        >
          <div className="stack gap-4" style={{ padding: '8px 10px' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</span>
            <span className="t-meta">{user.title}</span>
            <span className="t-meta">{user.username}</span>
          </div>
          <hr className="hairline" style={{ margin: '6px 0' }} />

          {confirming ? (
            <div className="stack gap-8" style={{ padding: '4px 10px 8px' }}>
              <span className="t-meta">Sign out of Sanctio?</span>
              <div className="row gap-8">
                <button type="button" className="btn btn-danger grow" onClick={doSignOut}>
                  Sign out
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setConfirming(true)}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="stack" style={{ minHeight: '100%' }}>
      <header
        className="row gap-24"
        style={{
          height: 'var(--topbar)',
          padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <Wordmark />

        <div className="grow" />

        <div className="row gap-4">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <div className="row grow" style={{ alignItems: 'stretch', minHeight: 0 }}>
        <Sidebar />
        {/* minWidth:0 is what stops a wide table from pushing the rail off-screen —
          * without it a flex child refuses to shrink below its content width. */}
        <main className="grow" style={{ minWidth: 0, overflowX: 'hidden' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function BootSkeleton() {
  return (
    <div className="stack gap-16" style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Skeleton height={28} width={220} />
      <div className="row gap-16">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grow">
            <Skeleton height={96} radius={10} />
          </div>
        ))}
      </div>
      <Skeleton height={320} radius={10} />
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

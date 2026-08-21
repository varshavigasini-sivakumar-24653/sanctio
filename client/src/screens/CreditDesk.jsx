import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Money, Pill, Skeleton } from '../components/ui';
import { date } from '../lib/format';
import { useAuth } from '../lib/providers';

/* Deviation severity maps to the approval authority — docs/SPEC.md §5.
 * A Credit Manager cannot clear a Critical deviation; the server enforces it. */
const AUTHORITY = {
  Minor: 'Credit Manager',
  Major: 'Head of Credit',
  Critical: 'Credit Committee',
};

const TONE = { Minor: 'warning', Major: 'serious', Critical: 'critical' };

function DeviationCard({ dev, onDecide, busy }) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="card stack gap-3 p-5 transition-shadow duration-150 hover:shadow-lift">
      <div className="row gap-12">
        <Pill tone={TONE[dev.severity] || 'neutral'}>{dev.severity}</Pill>
        <span className="t-meta grow">
          {AUTHORITY[dev.severity]} · raised {date(dev.createdOn)}
        </span>
        <Link to={`/loans/${encodeURIComponent(dev.loanReference)}`} className="t-meta num">
          {dev.loanReference}
        </Link>
      </div>

      <div className="stack gap-4">
        <span style={{ fontWeight: 600 }}>{dev.title}</span>
        <span className="t-meta">{dev.description}</span>
      </div>

      <div className="row gap-16">
        <span className="t-meta">
          {dev.borrowerName} · <Money cr={dev.exposureCr} />
        </span>
      </div>

      {open ? (
        <div className="stack gap-8">
          <div className="field">
            <label className="field-label" htmlFor={`note-${dev.id}`}>
              Decision note <span className="t-meta">(required — this is the audit trail)</span>
            </label>
            <textarea
              id={`note-${dev.id}`}
              className="input"
              style={{ height: 68, padding: 8, resize: 'vertical' }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Basis for the decision, and any compensating condition imposed."
            />
          </div>
          <div className="row gap-8">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!note.trim() || busy}
              onClick={() => onDecide(dev, 'approve', note)}
            >
              Approve deviation
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!note.trim() || busy}
              onClick={() => onDecide(dev, 'reject', note)}
            >
              Reject
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row gap-8">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            Decide
          </button>
        </div>
      )}
    </div>
  );
}

/* The three demo roles are meant to be tried in one sitting (see Login.jsx) — a
 * reviewer who lands here as the RM shouldn't have to log out to see it populated. */
const CREDIT_OFFICER_DEMO = { username: 'credit@sanctio.demo', password: 'SanctioCR2026' };

export default function CreditDesk() {
  const { can, user, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.deviations(), []);

  const decide = async (dev, decision, note) => {
    setBusy(true);
    try {
      await api.decideDeviation(dev.id, decision, note, dev.loanReference);
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!can('deviation')) {
    return (
      <div className="p-6">
        <EmptyState
          title="Credit Desk is for credit and risk officers"
          hint={`You are signed in as ${user.title}. Switch to the Credit & Risk Officer to appraise files and decide deviations.`}
          action={
            <button
              type="button"
              className="btn btn-secondary"
              disabled={switching}
              onClick={async () => {
                setSwitching(true);
                try {
                  await signIn(CREDIT_OFFICER_DEMO.username, CREDIT_OFFICER_DEMO.password);
                } catch (e) {
                  alert(e.message);
                  setSwitching(false);
                }
              }}
            >
              {switching ? 'Switching…' : 'Continue as Credit & Risk Officer'}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack gap-6 p-6" style={{ maxWidth: 860 }}>
      <div className="stack gap-1">
        <h1 className="t-page-title">Credit Desk</h1>
        <span className="t-meta">
          Policy deviations awaiting your authority, newest first
        </span>
      </div>

      {loading && (
        <div className="stack gap-3">
          <Skeleton height={148} radius={16} />
          <Skeleton height={148} radius={16} />
        </div>
      )}

      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.deviations.length === 0 && (
        <EmptyState
          title="Nothing awaiting your decision"
          hint="Deviations appear here when a file breaches credit policy — LTV above norm, DSCR below floor, or exposure over the sectoral cap."
        />
      )}

      {data?.deviations?.length > 0 && (
        <div className="stack gap-3">
          {data.deviations.map((dev) => (
            <DeviationCard key={dev.id} dev={dev} onDecide={decide} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

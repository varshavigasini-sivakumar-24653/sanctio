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
    <div className="card stack gap-12" style={{ padding: 16 }}>
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

export default function CreditDesk() {
  const { can, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.deviations(), []);

  const decide = async (dev, decision, note) => {
    setBusy(true);
    try {
      await api.decideDeviation(dev.id, decision, note);
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!can('deviation')) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          title="Credit Desk is for credit and risk officers"
          hint={`You are signed in as ${user.title}. Sign in as the Credit & Risk Officer to appraise files and decide deviations.`}
        />
      </div>
    );
  }

  return (
    <div className="stack gap-16" style={{ padding: 24, maxWidth: 860 }}>
      <div className="stack gap-4">
        <h1 className="t-page-title">Credit Desk</h1>
        <span className="t-meta">
          Policy deviations awaiting your authority, newest first
        </span>
      </div>

      {loading && (
        <div className="stack gap-12">
          <Skeleton height={148} radius={10} />
          <Skeleton height={148} radius={10} />
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
        <div className="stack gap-12">
          {data.deviations.map((dev) => (
            <DeviationCard key={dev.id} dev={dev} onDecide={decide} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

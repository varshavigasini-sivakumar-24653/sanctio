import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Modal, Skeleton } from './ui';

const EMPTY = { borrowerName: '', loanProduct: '', sector: '', totalRequestedCr: '' };

export default function NewApplicationModal({ open, onClose }) {
  const navigate = useNavigate();
  const { data: options, loading: loadingOptions } = useAsync(() => api.loanOptions(), [open]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // The modal never unmounts (it lives in the persistent TopBar), only its
  // visibility toggles — reset on every open rather than only on the paths that
  // close it, so a stale "Creating…"/old values from the last run can't resurface.
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { loan } = await api.createLoan({
        ...form,
        totalRequestedCr: Number(form.totalRequestedCr),
      });
      onClose();
      navigate(`/loans/${encodeURIComponent(loan.loanReference)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="New application" width={440}>
      {loadingOptions || !options ? (
        <div className="stack gap-3">
          <Skeleton height={40} radius={10} />
          <Skeleton height={40} radius={10} />
          <Skeleton height={40} radius={10} />
        </div>
      ) : (
        <form className="stack gap-4" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="na-borrower">
              Borrower name
            </label>
            <input
              id="na-borrower"
              className="input"
              value={form.borrowerName}
              onChange={set('borrowerName')}
              placeholder="e.g. Meridian Softworks Pvt Ltd"
              required
              disabled={busy}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="na-product">
              Loan product
            </label>
            <select
              id="na-product"
              className="input"
              value={form.loanProduct}
              onChange={set('loanProduct')}
              required
              disabled={busy}
            >
              <option value="" disabled>
                Select a product
              </option>
              {options.products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="na-sector">
              Sector
            </label>
            <select
              id="na-sector"
              className="input"
              value={form.sector}
              onChange={set('sector')}
              required
              disabled={busy}
            >
              <option value="" disabled>
                Select a sector
              </option>
              {options.sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="na-amount">
              Total requested (₹ Cr)
            </label>
            <input
              id="na-amount"
              className="input num"
              type="number"
              min="0.01"
              step="0.01"
              value={form.totalRequestedCr}
              onChange={set('totalRequestedCr')}
              placeholder="e.g. 25"
              required
              disabled={busy}
            />
          </div>

          {error && (
            <div className="field-error" role="alert">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create loan file'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

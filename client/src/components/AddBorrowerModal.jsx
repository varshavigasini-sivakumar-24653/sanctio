import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Modal, Skeleton } from './ui';

const EMPTY = { entityName: '', entityRole: '', industrySector: '', annualTurnoverCr: '', internalRating: '' };

export default function AddBorrowerModal({ open, onClose, loanRef, onAdded }) {
  const { data: options, loading: loadingOptions } = useAsync(() => api.loanOptions(), [open]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
      await api.addBorrower(loanRef, {
        ...form,
        annualTurnoverCr: form.annualTurnoverCr ? Number(form.annualTurnoverCr) : null,
      });
      onClose();
      onAdded();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Add borrower" width={440}>
      {loadingOptions || !options ? (
        <div className="stack gap-3">
          <Skeleton height={40} radius={10} />
          <Skeleton height={40} radius={10} />
        </div>
      ) : (
        <form className="stack gap-4" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="ab-name">
              Entity name
            </label>
            <input
              id="ab-name"
              className="input"
              value={form.entityName}
              onChange={set('entityName')}
              placeholder="e.g. Meridian Softworks Pvt Ltd"
              required
              disabled={busy}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ab-role">
              Entity role
            </label>
            <select id="ab-role" className="input" value={form.entityRole} onChange={set('entityRole')} required disabled={busy}>
              <option value="" disabled>
                Select a role
              </option>
              {options.entityRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ab-sector">
              Industry sector
            </label>
            <select id="ab-sector" className="input" value={form.industrySector} onChange={set('industrySector')} disabled={busy}>
              <option value="">Not set</option>
              {options.sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="row gap-3">
            <div className="field grow">
              <label className="field-label" htmlFor="ab-turnover">
                Annual turnover (₹ Cr)
              </label>
              <input
                id="ab-turnover"
                className="input num"
                type="number"
                min="0"
                step="0.01"
                value={form.annualTurnoverCr}
                onChange={set('annualTurnoverCr')}
                placeholder="e.g. 45"
                disabled={busy}
              />
            </div>

            <div className="field grow">
              <label className="field-label" htmlFor="ab-rating">
                Internal rating
              </label>
              <select id="ab-rating" className="input" value={form.internalRating} onChange={set('internalRating')} disabled={busy}>
                <option value="">Not rated</option>
                {options.internalRatings.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
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
              {busy ? 'Adding…' : 'Add borrower'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

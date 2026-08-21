import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Modal, Skeleton } from './ui';

const EMPTY = { facilityType: '', amountRequestedCr: '', tenorMonths: '', allInRatePct: '' };

export default function AddFacilityModal({ open, onClose, loanRef, onAdded }) {
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
      await api.addFacility(loanRef, {
        ...form,
        amountRequestedCr: Number(form.amountRequestedCr),
        tenorMonths: form.tenorMonths ? Number(form.tenorMonths) : null,
        allInRatePct: form.allInRatePct ? Number(form.allInRatePct) : null,
      });
      onClose();
      onAdded();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Add facility" width={440}>
      {loadingOptions || !options ? (
        <div className="stack gap-3">
          <Skeleton height={40} radius={10} />
          <Skeleton height={40} radius={10} />
        </div>
      ) : (
        <form className="stack gap-4" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="af-type">
              Facility type
            </label>
            <select id="af-type" className="input" value={form.facilityType} onChange={set('facilityType')} required disabled={busy}>
              <option value="" disabled>
                Select a facility type
              </option>
              {options.facilityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="af-amount">
              Amount requested (₹ Cr)
            </label>
            <input
              id="af-amount"
              className="input num"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amountRequestedCr}
              onChange={set('amountRequestedCr')}
              placeholder="e.g. 20"
              required
              disabled={busy}
            />
          </div>

          <div className="row gap-3">
            <div className="field grow">
              <label className="field-label" htmlFor="af-tenor">
                Tenor (months)
              </label>
              <input
                id="af-tenor"
                className="input num"
                type="number"
                min="0"
                step="1"
                value={form.tenorMonths}
                onChange={set('tenorMonths')}
                placeholder="e.g. 60"
                disabled={busy}
              />
            </div>

            <div className="field grow">
              <label className="field-label" htmlFor="af-rate">
                All-in rate (%)
              </label>
              <input
                id="af-rate"
                className="input num"
                type="number"
                min="0"
                step="0.01"
                value={form.allInRatePct}
                onChange={set('allInRatePct')}
                placeholder="e.g. 9.25"
                disabled={busy}
              />
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
              {busy ? 'Adding…' : 'Add facility'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

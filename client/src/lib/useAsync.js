import { useCallback, useEffect, useState } from 'react';

/**
 * Data fetching with the four states every list and panel must have:
 * loading / error / empty / populated. See docs/DESIGN.md §7.
 *
 * Returns { data, error, loading, reload }.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);

  return { ...state, reload: run };
}

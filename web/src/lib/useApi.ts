import { useCallback, useEffect, useState } from 'react';
import type { DependencyList } from 'react';

export interface ApiState<T> {
  data: T | null;
  error: string;
  /** True while a request is in flight; `data` keeps the previous result meanwhile. */
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an abortable request whenever `deps` change. The previous data stays
 * on screen during refetches so views can dim instead of flashing.
 */
export function useApi<T>(request: (signal: AbortSignal) => Promise<T>, deps: DependencyList): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(request, deps);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    run(ctrl.signal)
      .then((d) => setData(d))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [run, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

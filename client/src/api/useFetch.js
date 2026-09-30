import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

/** Tiny data hook: GET a URL, expose { data, error, loading, reload }. */
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(url);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: errorMessage(e), loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

import {useCallback, useEffect, useRef, useState} from 'react';
import type {EventsResponse} from '../../shared/types.ts';
import {loadEvents} from './api.ts';

const STALE_AFTER_MS = 30_000;

export interface EventsState {
  data: EventsResponse | null;
  /** True during the first load, when there is nothing to show yet. */
  loading: boolean;
  /** True during any request, including background refreshes. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads events on mount and again when the tab regains focus after STALE_AFTER_MS.
 * A failed refresh keeps the last good data on screen and reports the error separately.
 */
export function useEvents(): EventsState {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const lastLoaded = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setRefreshing(true);
    try {
      const d = await loadEvents({fresh, signal: c.signal});
      setData(d);
      setError(null);
      lastLoaded.current = Date.now();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      if (controller.current === c) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoaded.current > STALE_AFTER_MS) void load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      controller.current?.abort();
    };
  }, [load]);

  return {data, loading: data === null && error === null, refreshing, error, refresh: () => void load(true)};
}

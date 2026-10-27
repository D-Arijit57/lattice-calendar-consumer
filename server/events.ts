import type {ApiError, EventsResponse, TypesResponse} from '../shared/types.ts';
import {fetchEvents, LatticeError, listTypes, type LatticeConfig} from './lattice.ts';

export type Result<T> = {status: 200; body: T} | {status: number; body: ApiError};

const MIN_FRESH_GAP_MS = 5_000;

type Loader<T> = (cfg: LatticeConfig, key: string) => Promise<T>;

/**
 * TTL cache keyed by string, with in-flight sharing: concurrent callers for the same key share one
 * Lattice fetch, so N browsers refreshing cost one upstream request per TTL, far below Lattice's
 * 60 requests/minute/key limit. Errors are never cached, so only slugs Lattice accepted are stored.
 */
function cachedBy<T>(cfg: LatticeConfig, ttlMs: number, load: Loader<T>, now: () => number) {
  const cache = new Map<string, {at: number; value: T}>();
  const inflight = new Map<string, Promise<T>>();

  return async function get(key: string, opts: {fresh?: boolean} = {}): Promise<Result<T>> {
    const hit = cache.get(key);
    // `fresh` (the Refresh button) skips the TTL but not MIN_FRESH_GAP_MS, so a client cannot
    // use it to drive unbounded upstream traffic.
    const age = hit ? now() - hit.at : Infinity;
    if (hit && age < (opts.fresh ? MIN_FRESH_GAP_MS : ttlMs)) return {status: 200, body: hit.value};
    try {
      let p = inflight.get(key);
      if (!p) {
        p = load(cfg, key).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      const value = await p;
      cache.set(key, {at: now(), value});
      return {status: 200, body: value};
    } catch (err) {
      if (err instanceof LatticeError) {
        return {status: err.status, body: {error: {code: err.code, message: err.message}}};
      }
      console.error('Unexpected error talking to Lattice:', err instanceof Error ? err.message : err);
      return {status: 500, body: {error: {code: 'internal', message: 'Unexpected server error.'}}};
    }
  };
}

type EventsFetcher = typeof fetchEvents;

/** Events for the chosen content type (`""` = configured / auto-detected). */
export function createEventsService(cfg: LatticeConfig, ttlMs: number, fetcher: EventsFetcher = fetchEvents, now = Date.now) {
  const get = cachedBy<EventsResponse>(cfg, ttlMs, (c, slug) => fetcher(c, fetch, slug || undefined), now);
  return (opts: {fresh?: boolean; type?: string} = {}) => get(opts.type ?? '', opts);
}

/** The picker's list of content types. */
export function createTypesService(cfg: LatticeConfig, ttlMs: number, lister: typeof listTypes = listTypes, now = Date.now) {
  const get = cachedBy<TypesResponse>(cfg, ttlMs, (c) => lister(c), now);
  return () => get('types');
}

import type {ApiError, EventsResponse} from '../shared/types.ts';
import {fetchEvents, LatticeError, type LatticeConfig} from './lattice.ts';

type Fetcher = typeof fetchEvents;

const MIN_FRESH_GAP_MS = 5_000;

export type EventsResult =
  | {status: 200; body: EventsResponse}
  | {status: number; body: ApiError};

/**
 * Serves /api/events with a short in-memory cache. Concurrent callers share one in-flight
 * Lattice fetch, so N browsers refreshing cost one upstream request per TTL, which keeps us
 * far below Lattice's 60 requests/minute/key limit. Errors are not cached.
 */
export function createEventsService(cfg: LatticeConfig, ttlMs: number, fetcher: Fetcher = fetchEvents, now = Date.now) {
  let cached: {at: number; value: EventsResponse} | null = null;
  let inflight: Promise<EventsResponse> | null = null;

  return async function getEvents(opts: {fresh?: boolean} = {}): Promise<EventsResult> {
    // `fresh` (the Refresh button) skips the TTL but not MIN_FRESH_GAP_MS, so a client cannot
    // use it to drive unbounded upstream traffic.
    const age = cached ? now() - cached.at : Infinity;
    if (cached && age < (opts.fresh ? MIN_FRESH_GAP_MS : ttlMs)) return {status: 200, body: cached.value};
    try {
      inflight ??= fetcher(cfg).finally(() => {
        inflight = null;
      });
      const value = await inflight;
      cached = {at: now(), value};
      return {status: 200, body: value};
    } catch (err) {
      if (err instanceof LatticeError) {
        return {status: err.status, body: {error: {code: err.code, message: err.message}}};
      }
      console.error('Unexpected error fetching events:', err instanceof Error ? err.message : err);
      return {status: 500, body: {error: {code: 'internal', message: 'Unexpected server error.'}}};
    }
  };
}

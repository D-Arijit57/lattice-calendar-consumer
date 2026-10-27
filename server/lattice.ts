import {normalizeEntry} from '../shared/normalize.ts';
import type {EventsResponse} from '../shared/types.ts';

export interface LatticeConfig {
  baseUrl: string; // e.g. http://localhost:8000/api (no trailing slash)
  apiKey: string;
  contentTypeSlug: string;
}

/** Upper bound on pages per refresh: 20 x 50 = 1000 entries. Keeps one refresh well under the 60/min key limit. */
export const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 10_000;

export class LatticeError extends Error {
  constructor(
    public code: 'unauthorized' | 'not_found' | 'rate_limited' | 'upstream' | 'unreachable',
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

/**
 * Lattice's `next` link is an absolute URL built from the request's Host header, which can be
 * wrong behind a proxy (API-Contract Surprise 10), and it is attacker-influenced data we would
 * be sending a bearer key to. So we never follow it; we take only its `cursor` and rebuild
 * the URL from our configured base.
 */
function cursorFromNext(next: unknown): string | null {
  if (typeof next !== 'string') return null;
  try {
    return new URL(next).searchParams.get('cursor');
  } catch {
    return null;
  }
}

async function getPage(cfg: LatticeConfig, cursor: string | null, fetchImpl: FetchLike) {
  const url = new URL(`${cfg.baseUrl}/delivery/content-types/${encodeURIComponent(cfg.contentTypeSlug)}/entries/`);
  if (cursor) url.searchParams.set('cursor', cursor);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json'},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LatticeError('unreachable', 'Could not reach the Lattice API.', 502);
  }

  if (res.status === 401 || res.status === 403) {
    throw new LatticeError('unauthorized', 'Lattice rejected the API key (invalid or revoked).', 502);
  }
  if (res.status === 404) {
    throw new LatticeError('not_found', `Content type "${cfg.contentTypeSlug}" was not found for this API key.`, 502);
  }
  if (res.status === 429) {
    throw new LatticeError('rate_limited', 'Lattice rate limit reached. Try again shortly.', 503);
  }
  if (!res.ok) {
    throw new LatticeError('upstream', `Lattice returned HTTP ${res.status}.`, 502);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new LatticeError('upstream', 'Lattice returned a non-JSON response.', 502);
  }
  const page = body as {results?: unknown; next?: unknown};
  if (!Array.isArray(page.results)) {
    throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);
  }
  return {results: page.results as unknown[], next: cursorFromNext(page.next)};
}

/** Fetches every page of the Event content type and normalizes the entries. */
export async function fetchEvents(cfg: LatticeConfig, fetchImpl: FetchLike = fetch): Promise<EventsResponse> {
  const events: EventsResponse['events'] = [];
  const skipped: EventsResponse['skipped'] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const {results, next} = await getPage(cfg, cursor, fetchImpl);
    for (const raw of results) {
      const r = normalizeEntry(raw);
      if (r.ok) events.push(r.event);
      else skipped.push({id: r.id, reason: r.reason});
    }
    if (!next) break;
    if (seenCursors.has(next)) break; // defensive: a repeating cursor must not loop forever
    seenCursors.add(next);
    cursor = next;
  }

  events.sort((a, b) => a.start.localeCompare(b.start) || Number(a.id) - Number(b.id));
  return {events, skipped, truncated, fetchedAt: new Date().toISOString()};
}

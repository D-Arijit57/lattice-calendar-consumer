import {DEFAULT_FIELD_MAP, normalizeEntry, type FieldMap} from '../shared/normalize.ts';
import {isCalendarShaped, resolveFieldMap, suggestFieldMap, type SchemaField} from '../shared/suggest.ts';
import type {ContentTypeOption, EventsResponse, TypesResponse} from '../shared/types.ts';

export interface LatticeConfig {
  baseUrl: string; // e.g. http://localhost:8000/api (no trailing slash)
  apiKey: string;
  /** Pin the content type. Unset = discover one that looks like events. */
  contentTypeSlug?: string;
  /** Explicit role -> field name overrides; they win over anything discovered. */
  fieldOverrides?: Partial<FieldMap>;
}

/** Upper bound on pages per refresh: 20 x 50 = 1000 entries. Keeps one refresh well under the 60/min key limit. */
export const MAX_PAGES = 20;
/** At most this many content types are inspected when auto-detecting. */
const MAX_TYPES_SCANNED = 10;
const FALLBACK_SLUG = 'event';
const REQUEST_TIMEOUT_MS = 10_000;

export class LatticeError extends Error {
  constructor(
    public code: 'unauthorized' | 'not_found' | 'no_event_type' | 'rate_limited' | 'upstream' | 'unreachable',
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

/** What we are reading and how its fields map onto calendar roles. */
export interface Target {
  slug: string;
  name: string | null;
  fieldMap: FieldMap;
  /** False when Lattice has no discovery routes and we fell back to configuration/defaults. */
  discovered: boolean;
}

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

/** GETs a Lattice URL. Maps auth/rate/server/network failures to LatticeError; 404 and 2xx are returned to the caller. */
async function get(cfg: LatticeConfig, url: URL, fetchImpl: FetchLike): Promise<Response> {
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
  if (res.status === 429) throw new LatticeError('rate_limited', 'Lattice rate limit reached. Try again shortly.', 503);
  if (res.status !== 404 && !res.ok) throw new LatticeError('upstream', `Lattice returned HTTP ${res.status}.`, 502);
  return res;
}

async function json(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new LatticeError('upstream', 'Lattice returned a non-JSON response.', 502);
  }
}

const typesUrl = (cfg: LatticeConfig, slug?: string) =>
  new URL(`${cfg.baseUrl}/delivery/content-types/${slug ? `${encodeURIComponent(slug)}/` : ''}`);

async function describeType(cfg: LatticeConfig, slug: string, fetchImpl: FetchLike) {
  const res = await get(cfg, typesUrl(cfg, slug), fetchImpl);
  if (res.status === 404) throw new LatticeError('not_found', `Content type "${slug}" was not found for this API key.`, 502);
  const body = (await json(res)) as {name?: unknown; fields?: unknown};
  if (!Array.isArray(body.fields)) throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);
  return {name: typeof body.name === 'string' ? body.name : null, fields: body.fields as SchemaField[]};
}

/** Lists the key's content types and whether each could be shown on a calendar. */
export async function listTypes(cfg: LatticeConfig, fetchImpl: FetchLike = fetch): Promise<TypesResponse> {
  const list = await get(cfg, typesUrl(cfg), fetchImpl);
  if (list.status === 404) return {types: [], discoveryAvailable: false};
  const types = (await json(list)) as {name: string; slug: string}[];
  if (!Array.isArray(types)) throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);

  const out: ContentTypeOption[] = [];
  for (const [i, t] of types.entries()) {
    // Past the scan limit we list the type but do not inspect it, so it is not selectable.
    let shaped = false;
    if (i < MAX_TYPES_SCANNED) {
      const d = await describeType(cfg, t.slug, fetchImpl);
      shaped = isCalendarShaped(suggestFieldMap(d.fields), overridesFor(cfg, t.slug));
    }
    out.push({slug: t.slug, name: t.name, calendarShaped: shaped});
  }
  return {types: out, discoveryAvailable: true};
}

/** Explicit overrides describe the configured type, so they are not applied to a type the user picked instead. */
function overridesFor(cfg: LatticeConfig, slug: string): Partial<FieldMap> {
  return !cfg.contentTypeSlug || cfg.contentTypeSlug === slug ? (cfg.fieldOverrides ?? {}) : {};
}

/**
 * Decides which content type to read and which fields are title/start/end/….
 * `requestedSlug` (the user's pick) beats the configured slug, which beats auto-detection.
 * Uses Lattice's discovery routes when present, and falls back to configuration
 * (slug default "event", default field names) when they are not, so older Lattice versions still work.
 */
export async function resolveTarget(cfg: LatticeConfig, fetchImpl: FetchLike = fetch, requestedSlug?: string): Promise<Target> {
  const pinned = requestedSlug ?? cfg.contentTypeSlug;
  const list = await get(cfg, typesUrl(cfg), fetchImpl);

  if (list.status === 404) {
    return {slug: pinned ?? FALLBACK_SLUG, name: null, fieldMap: resolveFieldMap({}, overridesFor(cfg, pinned ?? FALLBACK_SLUG)), discovered: false};
  }
  const types = (await json(list)) as {name: string; slug: string}[];
  if (!Array.isArray(types)) throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);

  if (pinned) {
    const d = await describeType(cfg, pinned, fetchImpl);
    return {slug: pinned, name: d.name, fieldMap: resolveFieldMap(suggestFieldMap(d.fields), overridesFor(cfg, pinned)), discovered: true};
  }

  const overrides = cfg.fieldOverrides ?? {};
  const candidates: Target[] = [];
  for (const t of types.slice(0, MAX_TYPES_SCANNED)) {
    const d = await describeType(cfg, t.slug, fetchImpl);
    const suggested = suggestFieldMap(d.fields);
    if (isCalendarShaped(suggested, overrides)) {
      candidates.push({slug: t.slug, name: d.name ?? t.name, fieldMap: resolveFieldMap(suggested, overrides), discovered: true});
    }
  }
  const chosen = candidates.find((c) => c.slug === FALLBACK_SLUG) ?? candidates[0];
  if (!chosen) {
    throw new LatticeError(
      'no_event_type',
      'No content type with a title and start/end time fields was found. Set LATTICE_EVENT_CONTENT_TYPE and LATTICE_FIELD_MAP.',
      502,
    );
  }
  return chosen;
}

async function getPage(cfg: LatticeConfig, slug: string, cursor: string | null, fetchImpl: FetchLike) {
  const url = new URL(`${typesUrl(cfg, slug)}entries/`);
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await get(cfg, url, fetchImpl);
  if (res.status === 404) throw new LatticeError('not_found', `Content type "${slug}" was not found for this API key.`, 502);

  const page = (await json(res)) as {results?: unknown; next?: unknown};
  if (!Array.isArray(page.results)) {
    throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);
  }
  return {results: page.results as unknown[], next: cursorFromNext(page.next)};
}

/** Resolves the target, fetches every page of its entries and normalizes them. */
export async function fetchEvents(cfg: LatticeConfig, fetchImpl: FetchLike = fetch, requestedSlug?: string): Promise<EventsResponse> {
  const target = await resolveTarget(cfg, fetchImpl, requestedSlug);
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
    const {results, next} = await getPage(cfg, target.slug, cursor, fetchImpl);
    for (const raw of results) {
      const r = normalizeEntry(raw, target.fieldMap ?? DEFAULT_FIELD_MAP);
      if (r.ok) events.push(r.event);
      else skipped.push({id: r.id, reason: r.reason});
    }
    if (!next) break;
    if (seenCursors.has(next)) break; // defensive: a repeating cursor must not loop forever
    seenCursors.add(next);
    cursor = next;
  }

  events.sort((a, b) => a.start.localeCompare(b.start) || Number(a.id) - Number(b.id));
  return {
    events,
    skipped,
    truncated,
    fetchedAt: new Date().toISOString(),
    source: {contentType: target.name ?? target.slug, slug: target.slug, discovered: target.discovered},
  };
}

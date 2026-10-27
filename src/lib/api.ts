import type {ApiError, EventsResponse, TypesResponse} from '../../shared/types.ts';

export class EventsFetchError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

/** GETs one of this app's own endpoints. Errors from proxies/hosting can be HTML, so never assume JSON. */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {signal});
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new EventsFetchError('Could not reach the calendar server.', 'network');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    const e = (body as ApiError | null)?.error;
    throw new EventsFetchError(e?.message ?? `Calendar server returned HTTP ${res.status}.`, e?.code ?? 'http');
  }
  if (!body || typeof body !== 'object') throw new EventsFetchError('Unexpected response from the calendar server.', 'shape');
  return body as T;
}

/** Loads events from this app's own server (never from Lattice directly: the API key lives there). */
export async function loadEvents(opts: {type?: string; fresh?: boolean; signal?: AbortSignal} = {}): Promise<EventsResponse> {
  const q = new URLSearchParams();
  if (opts.type) q.set('type', opts.type);
  if (opts.fresh) q.set('fresh', '1');
  const data = await getJson<EventsResponse>(`/api/events${q.size ? `?${q}` : ''}`, opts.signal);
  if (!Array.isArray(data.events)) throw new EventsFetchError('Unexpected response from the calendar server.', 'shape');
  return data;
}

export async function loadTypes(signal?: AbortSignal): Promise<TypesResponse> {
  const data = await getJson<TypesResponse>('/api/types', signal);
  if (!Array.isArray(data.types)) throw new EventsFetchError('Unexpected response from the calendar server.', 'shape');
  return data;
}

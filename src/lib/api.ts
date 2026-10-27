import type {ApiError, EventsResponse} from '../../shared/types.ts';

export class EventsFetchError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

/** Loads events from this app's own server (never from Lattice directly: the API key lives there). */
export async function loadEvents(opts: {fresh?: boolean; signal?: AbortSignal} = {}): Promise<EventsResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/events${opts.fresh ? '?fresh=1' : ''}`, {signal: opts.signal});
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new EventsFetchError('Could not reach the calendar server.', 'network');
  }
  // Errors from proxies/hosting can be HTML, so never assume JSON.
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
  const data = body as EventsResponse | null;
  if (!data || !Array.isArray(data.events)) throw new EventsFetchError('Unexpected response from the calendar server.', 'shape');
  return data;
}

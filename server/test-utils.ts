import {vi} from 'vitest';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

/**
 * A fake fetch that answers by URL path. `routes` maps a path suffix (e.g. "/entries/") to a
 * handler or fixed Response; the longest matching suffix wins. Unmatched paths return 404.
 */
export function routeFetch(routes: Record<string, Response | ((url: URL) => Response)>) {
  return vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const hit = Object.keys(routes)
      .filter((k) => url.pathname.endsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!hit) return json({detail: 'Not found'}, 404);
    const r = routes[hit];
    return typeof r === 'function' ? r(url) : r.clone();
  });
}

export const EVENT_FIELDS = [
  {name: 'title', data_type: 'string', required: true},
  {name: 'start_time', data_type: 'string', required: true},
  {name: 'end_time', data_type: 'string', required: true},
  {name: 'location', data_type: 'string', required: false},
];

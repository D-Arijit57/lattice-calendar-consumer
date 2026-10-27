import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEventsHandler} from './handler.ts';
import {EVENT_FIELDS, json, routeFetch} from './test-utils.ts';

const env = {LATTICE_API_BASE_URL: 'http://lattice.test/api', LATTICE_API_KEY: 'lat_secret'};
const req = (method = 'GET', qs = '') => new Request(`http://app.test/api/events${qs}`, {method});

afterEach(() => vi.unstubAllGlobals());

describe('createEventsHandler', () => {
  it('returns normalized events and sends the key only upstream', async () => {
    const upstream = routeFetch({
      '/delivery/content-types/': json([{name: 'Event', slug: 'event'}]),
      '/delivery/content-types/event/': json({name: 'Event', fields: EVENT_FIELDS}),
      '/event/entries/': json({
        next: null,
        results: [{id: 1, data: {title: 'A', start_time: '2026-11-03T10:00:00Z', end_time: '2026-11-03T11:00:00Z'}}],
      }),
    });
    vi.stubGlobal('fetch', upstream);
    const res = await createEventsHandler(env)(req());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text).events[0]).toMatchObject({id: '1', title: 'A', start: '2026-11-03T10:00:00.000Z'});
    expect(text).not.toContain('lat_secret');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    for (const [, init] of upstream.mock.calls as unknown as [URL, RequestInit][]) {
      expect(init.headers).toMatchObject({Authorization: 'Bearer lat_secret'});
    }
  });

  it('rejects non-GET methods', async () => {
    const res = await createEventsHandler(env)(req('POST'));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
  });

  it('returns a generic 500 for bad config without leaking values', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createEventsHandler({LATTICE_API_BASE_URL: 'nope', LATTICE_API_KEY: 'lat_secret_x'})(req());
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe('misconfigured');
    expect(text).not.toContain('nope');
  });

  it('maps a Lattice rejection to 502', async () => {
    vi.stubGlobal('fetch', routeFetch({'/delivery/content-types/': json({}, 401)}));
    const res = await createEventsHandler(env)(req());
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('unauthorized');
  });
});

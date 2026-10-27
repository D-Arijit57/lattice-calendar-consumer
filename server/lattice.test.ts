import {describe, expect, it, vi} from 'vitest';
import {createEventsService} from './events.ts';
import {fetchEvents, LatticeError, MAX_PAGES, resolveTarget, type LatticeConfig} from './lattice.ts';
import {EVENT_FIELDS, json, routeFetch} from './test-utils.ts';

const cfg: LatticeConfig = {baseUrl: 'http://lattice.test/api', apiKey: 'lat_secret', contentTypeSlug: 'event'};
const row = (id: number, start = '2026-11-03T10:00:00Z') => ({
  id, version_number: 1, updated_at: null,
  data: {title: `E${id}`, start_time: start, end_time: '2026-12-01T00:00:00Z'},
});
const asFetch = (f: unknown) => f as typeof fetch;
const eventType = {name: 'Event', slug: 'event', version_number: 1, fields: EVENT_FIELDS};
const discovery = {
  '/delivery/content-types/': json([{name: 'Event', slug: 'event'}]),
  '/delivery/content-types/event/': json(eventType),
};

describe('fetchEvents', () => {
  it('sends the bearer key, follows only the cursor of `next`, and reports the source', async () => {
    const f = routeFetch({
      ...discovery,
      '/event/entries/': (url) =>
        url.searchParams.get('cursor') === 'abc'
          ? json({next: null, results: [row(1), {id: 9, data: {title: 'bad'}}]})
          // Lattice's `next` points at a hostile host: it must be ignored apart from its cursor.
          : json({next: 'http://evil.test/api/x/?cursor=abc', results: [row(2, '2026-11-05T10:00:00Z')]}),
    });
    const out = await fetchEvents(cfg, asFetch(f));

    const urls = f.mock.calls.map(([u]) => String(u));
    expect(urls).toContain('http://lattice.test/api/delivery/content-types/event/entries/?cursor=abc');
    expect(urls.some((u) => u.includes('evil.test'))).toBe(false);
    for (const [, init] of f.mock.calls as unknown as [URL, RequestInit][]) {
      expect(init.headers).toMatchObject({Authorization: 'Bearer lat_secret'});
    }
    expect(out.events.map((e) => e.id)).toEqual(['1', '2']); // sorted by start
    expect(out.skipped).toEqual([{id: '9', reason: expect.stringContaining('start_time')}]);
    expect(out.truncated).toBe(false);
    expect(out.source).toEqual({contentType: 'Event', slug: 'event', discovered: true});
  });

  it('stops at the page cap and flags truncation', async () => {
    let n = 0;
    const f = routeFetch({...discovery, '/event/entries/': () => json({next: `http://x/?cursor=c${++n}`, results: [row(n)]})});
    const out = await fetchEvents(cfg, asFetch(f));
    expect(f.mock.calls.filter(([u]) => String(u).includes('/entries/'))).toHaveLength(MAX_PAGES);
    expect(out.truncated).toBe(true);
  });

  it('does not loop on a repeating cursor', async () => {
    const f = routeFetch({...discovery, '/event/entries/': () => json({next: 'http://x/?cursor=same', results: [row(1)]})});
    await fetchEvents(cfg, asFetch(f));
    expect(f.mock.calls.filter(([u]) => String(u).includes('/entries/'))).toHaveLength(2);
  });

  it.each([
    [401, 'unauthorized'], [403, 'unauthorized'], [429, 'rate_limited'], [500, 'upstream'],
  ])('maps HTTP %i to %s', async (status, code) => {
    await expect(fetchEvents(cfg, asFetch(routeFetch({'/delivery/content-types/': json({}, status)})))).rejects.toMatchObject({code});
  });

  it('reports a missing pinned content type', async () => {
    const f = routeFetch({'/delivery/content-types/': json([]), '/delivery/content-types/event/': json({}, 404)});
    await expect(fetchEvents(cfg, asFetch(f))).rejects.toMatchObject({code: 'not_found'});
  });

  it('maps network failure and bad bodies', async () => {
    await expect(fetchEvents(cfg, asFetch(async () => { throw new TypeError('boom'); }))).rejects.toMatchObject({code: 'unreachable'});
    await expect(fetchEvents(cfg, asFetch(async () => new Response('<html>', {status: 200})))).rejects.toMatchObject({code: 'upstream'});
    await expect(fetchEvents(cfg, asFetch(routeFetch({...discovery, '/event/entries/': json({results: 'nope'})})))).rejects.toMatchObject({code: 'upstream'});
  });

  it('never leaks the key in error messages', async () => {
    const err = (await fetchEvents(cfg, asFetch(routeFetch({'/delivery/content-types/': json({}, 401)}))).catch((e) => e)) as LatticeError;
    expect(err.message).not.toContain('lat_secret');
  });
});

describe('resolveTarget', () => {
  const noPin: LatticeConfig = {baseUrl: cfg.baseUrl, apiKey: cfg.apiKey};
  const blog = {name: 'Blog', slug: 'blog', version_number: 1, fields: [{name: 'body', data_type: 'string', required: true}]};

  it('auto-detects the calendar-shaped type among several', async () => {
    const f = routeFetch({
      '/delivery/content-types/': json([{name: 'Blog', slug: 'blog'}, {name: 'Event', slug: 'event'}]),
      '/delivery/content-types/blog/': json(blog),
      '/delivery/content-types/event/': json(eventType),
    });
    expect(await resolveTarget(noPin, asFetch(f))).toMatchObject({slug: 'event', name: 'Event', discovered: true, fieldMap: {start: 'start_time'}});
  });

  it('maps differently named fields automatically, with overrides winning', async () => {
    const gig = {name: 'Gig', fields: [
      {name: 'name', data_type: 'string', required: true}, {name: 'starts_at', data_type: 'string', required: true},
      {name: 'ends_at', data_type: 'string', required: true}, {name: 'venue', data_type: 'string', required: false}]};
    const f = routeFetch({'/delivery/content-types/': json([{name: 'Gig', slug: 'gig'}]), '/delivery/content-types/gig/': json(gig)});
    const t = await resolveTarget({...noPin, fieldOverrides: {location: 'name'}}, asFetch(f));
    expect(t.fieldMap).toMatchObject({title: 'name', start: 'starts_at', end: 'ends_at', location: 'name'});
  });

  it('errors helpfully when nothing looks like events', async () => {
    const f = routeFetch({'/delivery/content-types/': json([{name: 'Blog', slug: 'blog'}]), '/delivery/content-types/blog/': json(blog)});
    await expect(resolveTarget(noPin, asFetch(f))).rejects.toMatchObject({code: 'no_event_type'});
  });

  it('falls back to config/defaults when Lattice has no discovery routes', async () => {
    const f = routeFetch({}); // everything 404
    expect(await resolveTarget(noPin, asFetch(f))).toMatchObject({slug: 'event', name: null, discovered: false, fieldMap: {start: 'start_time'}});
    expect((await resolveTarget({...cfg, contentTypeSlug: 'party'}, asFetch(f))).slug).toBe('party');
  });
});

describe('createEventsService', () => {
  const ok = {events: [], skipped: [], truncated: false, fetchedAt: 'x', source: {contentType: 'Event', slug: 'event', discovered: true}};
  it('caches within the TTL, shares in-flight fetches, and does not cache errors', async () => {
    let t = 0;
    const fetcher = vi.fn().mockResolvedValue(ok);
    const get = createEventsService(cfg, 30_000, fetcher, () => t);
    await Promise.all([get(), get()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 29_000; await get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 31_000; await get();
    expect(fetcher).toHaveBeenCalledTimes(2);

    fetcher.mockRejectedValueOnce(new LatticeError('upstream', 'down', 502));
    t = 100_000;
    expect(await get()).toEqual({status: 502, body: {error: {code: 'upstream', message: 'down'}}});
    expect((await get()).status).toBe(200); // error was not cached
  });

  it('lets fresh bypass the TTL but not the 5s floor', async () => {
    let t = 0;
    const fetcher = vi.fn().mockResolvedValue(ok);
    const get = createEventsService(cfg, 30_000, fetcher, () => t);
    await get();
    t = 2_000; await get({fresh: true});
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 6_000; await get({fresh: true});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

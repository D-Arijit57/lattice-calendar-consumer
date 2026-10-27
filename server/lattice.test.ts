import {describe, expect, it, vi} from 'vitest';
import {createEventsService} from './events.ts';
import {fetchEvents, LatticeError, MAX_PAGES, type LatticeConfig} from './lattice.ts';

const cfg: LatticeConfig = {baseUrl: 'http://lattice.test/api', apiKey: 'lat_secret', contentTypeSlug: 'event'};
const row = (id: number, start = '2026-11-03T10:00:00Z') => ({
  id, version_number: 1, updated_at: null,
  data: {title: `E${id}`, start_time: start, end_time: '2026-12-01T00:00:00Z'},
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

describe('fetchEvents', () => {
  it('sends the bearer key to the slug route and follows cursors from our own base', async () => {
    const fetchMock = vi.fn()
      // Lattice's `next` points at a hostile host: it must be ignored apart from its cursor.
      .mockResolvedValueOnce(json({next: 'http://evil.test/api/x/?cursor=abc', results: [row(2, '2026-11-05T10:00:00Z')]}))
      .mockResolvedValueOnce(json({next: null, results: [row(1), {id: 9, data: {title: 'bad'}}]}));
    const out = await fetchEvents(cfg, fetchMock as unknown as typeof fetch);

    const [first, second] = fetchMock.mock.calls.map(([u]) => String(u));
    expect(first).toBe('http://lattice.test/api/delivery/content-types/event/entries/');
    expect(second).toBe('http://lattice.test/api/delivery/content-types/event/entries/?cursor=abc');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer lat_secret');
    expect(out.events.map((e) => e.id)).toEqual(['1', '2']); // sorted by start
    expect(out.skipped).toEqual([{id: '9', reason: expect.stringContaining('start_time')}]);
    expect(out.truncated).toBe(false);
  });

  it('stops at the page cap and flags truncation', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => json({next: `http://x/?cursor=c${++n}`, results: [row(n)]}));
    const out = await fetchEvents(cfg, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES);
    expect(out.truncated).toBe(true);
  });

  it('does not loop on a repeating cursor', async () => {
    const fetchMock = vi.fn(async () => json({next: 'http://x/?cursor=same', results: [row(1)]}));
    await fetchEvents(cfg, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 'unauthorized'], [403, 'unauthorized'], [404, 'not_found'], [429, 'rate_limited'], [500, 'upstream'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const f = vi.fn(async () => json({detail: 'x'}, status));
    await expect(fetchEvents(cfg, f as unknown as typeof fetch)).rejects.toMatchObject({code});
  });

  it('maps network failure and bad bodies', async () => {
    await expect(fetchEvents(cfg, (async () => { throw new TypeError('boom'); }) as unknown as typeof fetch))
      .rejects.toMatchObject({code: 'unreachable'});
    await expect(fetchEvents(cfg, (async () => new Response('<html>', {status: 200})) as unknown as typeof fetch))
      .rejects.toMatchObject({code: 'upstream'});
    await expect(fetchEvents(cfg, (async () => json({results: 'nope'})) as unknown as typeof fetch))
      .rejects.toMatchObject({code: 'upstream'});
  });

  it('never leaks the key in error messages', async () => {
    const f = vi.fn(async () => json({}, 401));
    const err = (await fetchEvents(cfg, f as unknown as typeof fetch).catch((e) => e)) as LatticeError;
    expect(JSON.stringify(err.message)).not.toContain('lat_secret');
  });
});

describe('createEventsService', () => {
  const ok = {events: [], skipped: [], truncated: false, fetchedAt: 'x'};
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

import {describe, expect, it} from 'vitest';
import {loadConfig} from './config.ts';

const good = {LATTICE_API_BASE_URL: 'http://localhost:8000/api/', LATTICE_API_KEY: 'lat_abc'};

describe('loadConfig', () => {
  it('applies defaults and trims the trailing slash', () => {
    const c = loadConfig(good);
    expect(c.lattice).toEqual({baseUrl: 'http://localhost:8000/api', apiKey: 'lat_abc', contentTypeSlug: 'event'});
    expect(c.port).toBe(3002);
    expect(c.cacheTtlMs).toBe(30_000);
  });
  it('reports every problem at once and never echoes the key', () => {
    expect.assertions(4);
    try {
      loadConfig({LATTICE_API_BASE_URL: 'nope', LATTICE_API_KEY: 'sk_live_supersecret', PORT: '0'});
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('LATTICE_API_BASE_URL');
      expect(m).toContain('LATTICE_API_KEY');
      expect(m).toContain('PORT');
      expect(m).not.toContain('supersecret');
    }
  });
  it('rejects the placeholder key', () => {
    expect(() => loadConfig({...good, LATTICE_API_KEY: 'lat_replace_me'})).toThrow(/LATTICE_API_KEY/);
  });
});

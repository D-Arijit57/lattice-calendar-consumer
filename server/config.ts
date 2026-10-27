import type {LatticeConfig} from './lattice.ts';

export interface AppConfig {
  lattice: LatticeConfig;
  port: number;
  cacheTtlMs: number;
}

/** Reads and validates environment variables. Throws one error listing everything wrong. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const rawBase = env.LATTICE_API_BASE_URL?.trim() ?? '';
  let baseUrl = '';
  try {
    const u = new URL(rawBase);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    baseUrl = rawBase.replace(/\/+$/, '');
  } catch {
    problems.push('LATTICE_API_BASE_URL must be an http(s) URL such as http://localhost:8000/api');
  }

  const apiKey = env.LATTICE_API_KEY?.trim() ?? '';
  if (!apiKey.startsWith('lat_') || apiKey === 'lat_replace_me') {
    problems.push('LATTICE_API_KEY must be a real Lattice key (starts with "lat_")');
  }

  const slug = (env.LATTICE_EVENT_CONTENT_TYPE ?? 'event').trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    problems.push('LATTICE_EVENT_CONTENT_TYPE must be a Lattice slug such as "event"');
  }

  const port = Number(env.PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be 1-65535');

  const ttl = Number(env.EVENTS_CACHE_TTL_SECONDS ?? 30);
  if (!Number.isFinite(ttl) || ttl < 0) problems.push('EVENTS_CACHE_TTL_SECONDS must be >= 0');

  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  return {lattice: {baseUrl, apiKey, contentTypeSlug: slug}, port, cacheTtlMs: ttl * 1000};
}

import {DEFAULT_FIELD_MAP, type FieldMap} from '../shared/normalize.ts';
import type {LatticeConfig} from './lattice.ts';

export interface AppConfig {
  lattice: LatticeConfig;
  port: number;
  cacheTtlMs: number;
}

/** Parses LATTICE_FIELD_MAP, a JSON object overriding some of the default role -> Lattice field names. */
function parseFieldMap(raw: string | undefined, problems: string[]): FieldMap {
  if (!raw?.trim()) return DEFAULT_FIELD_MAP;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.push('LATTICE_FIELD_MAP must be valid JSON, e.g. {"start":"starts_at"}');
    return DEFAULT_FIELD_MAP;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    problems.push('LATTICE_FIELD_MAP must be a JSON object');
    return DEFAULT_FIELD_MAP;
  }
  const map: FieldMap = {...DEFAULT_FIELD_MAP};
  for (const [role, field] of Object.entries(parsed)) {
    if (!(role in DEFAULT_FIELD_MAP)) {
      problems.push(`LATTICE_FIELD_MAP has unknown key "${role}" (allowed: ${Object.keys(DEFAULT_FIELD_MAP).join(', ')})`);
    } else if (typeof field !== 'string' || !field.trim()) {
      problems.push(`LATTICE_FIELD_MAP["${role}"] must be a non-empty field name`);
    } else {
      map[role as keyof FieldMap] = field.trim();
    }
  }
  return map;
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

  const fieldMap = parseFieldMap(env.LATTICE_FIELD_MAP, problems);

  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  return {lattice: {baseUrl, apiKey, contentTypeSlug: slug, fieldMap}, port, cacheTtlMs: ttl * 1000};
}

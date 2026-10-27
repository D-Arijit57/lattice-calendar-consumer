import type {CalendarEvent} from './types.ts';

/** Which Lattice field name plays each calendar role. */
export interface FieldMap {
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
  category: string;
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  title: 'title',
  start: 'start_time',
  end: 'end_time',
  description: 'description',
  location: 'location',
  category: 'category',
};

/**
 * Lattice has no date-time field type (`date` is YYYY-MM-DD only), so start_time and
 * end_time are `string` fields and Lattice does not check their format. This module is
 * therefore the only place that validates them.
 *
 * Accepted: ISO-8601 date-time WITH an explicit offset, e.g. 2026-11-03T14:00:00+05:30
 * or 2026-11-03T08:30:00Z. A time with no offset is ambiguous (whose "2pm"?), so it is
 * rejected rather than guessed at.
 */
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

export function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = ISO_WITH_OFFSET.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', zone] = m;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
  // Date.parse silently rolls 2026-02-31 over to March; reject impossible values instead.
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  if (zone.toUpperCase() !== 'Z') {
    const offH = Number(zone.slice(1, 3));
    const offM = Number(zone.slice(-2));
    if (offH > 23 || offM > 59) return null;
  }
  const ms = Date.parse(value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(ms) ? null : new Date(ms);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined; // wrong type -> caller reports
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export type NormalizeResult =
  | {ok: true; event: CalendarEvent}
  | {ok: false; id: string; reason: string};

/** Turns one raw Delivery API entry into a CalendarEvent, or says why it can't be shown. */
export function normalizeEntry(raw: unknown, map: FieldMap = DEFAULT_FIELD_MAP): NormalizeResult {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const id = entry.id !== undefined && entry.id !== null ? String(entry.id) : '?';
  const fail = (reason: string): NormalizeResult => ({ok: false, id, reason});

  if (entry.id === undefined || entry.id === null) return fail('Entry has no id.');
  const data = entry.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('Entry has no data object.');
  }
  const d = data as Record<string, unknown>;

  const title = d[map.title];
  if (typeof title !== 'string' || title.trim() === '') return fail(`${map.title} is missing.`);
  const start = parseInstant(d[map.start]);
  if (!start) return fail(`${map.start} is missing or not an ISO-8601 date-time with a UTC offset.`);
  const end = parseInstant(d[map.end]);
  if (!end) return fail(`${map.end} is missing or not an ISO-8601 date-time with a UTC offset.`);
  if (end.getTime() < start.getTime()) return fail(`${map.end} is before ${map.start}.`);

  const description = optionalString(d[map.description]);
  const location = optionalString(d[map.location]);
  const category = optionalString(d[map.category]);
  if (description === undefined) return fail(`${map.description} must be text.`);
  if (location === undefined) return fail(`${map.location} must be text.`);
  if (category === undefined) return fail(`${map.category} must be text.`);

  return {
    ok: true,
    event: {
      id,
      title: title.trim(),
      description,
      start: start.toISOString(),
      end: end.toISOString(),
      location,
      category,
      versionNumber: typeof entry.version_number === 'number' ? entry.version_number : null,
      updatedAt: typeof entry.updated_at === 'string' ? entry.updated_at : null,
    },
  };
}

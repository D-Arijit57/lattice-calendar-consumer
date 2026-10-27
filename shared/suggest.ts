import {DEFAULT_FIELD_MAP, type FieldMap} from './normalize.ts';

/** A field as described by Lattice's delivery discovery endpoint. */
export interface SchemaField {
  name: string;
  data_type: string;
  required: boolean;
}

const has = (name: string, re: RegExp) => re.test(name.toLowerCase());
const START = /(^|_)(start|starts|begin|begins|from)(_|$)/;
const END = /(^|_)(end|ends|finish|until|to)(_|$)/;
const TITLE_EXACT = ['title', 'name', 'summary', 'subject', 'event_name', 'heading'];
const LOCATION = /location|venue|place|address|where/;
const CATEGORY = /category|kind|type|tag|label/;
const DESCRIPTION = /desc|detail|about|notes?/;

/**
 * Guesses which Lattice field plays each calendar role, from names and types only.
 * Lattice has no date-time type, so start/end are looked for among `string` fields
 * (a `date` field is YYYY-MM-DD with no time, which the calendar cannot place).
 * Each field is used for at most one role. Roles with no match are omitted.
 */
export function suggestFieldMap(fields: SchemaField[]): Partial<FieldMap> {
  const strings = fields.filter((f) => f.data_type === 'string');
  const free = new Set(strings.map((f) => f.name));
  const out: Partial<FieldMap> = {};
  const take = (role: keyof FieldMap, pick: (names: string[]) => string | undefined) => {
    const hit = pick([...free]);
    if (hit) {
      out[role] = hit;
      free.delete(hit);
    }
  };
  const byRe = (re: RegExp) => (names: string[]) => names.find((n) => has(n, re));

  take('start', byRe(START));
  take('end', byRe(END));
  take('title', (names) => TITLE_EXACT.map((t) => names.find((n) => n.toLowerCase() === t)).find(Boolean)
    ?? strings.find((f) => f.required && free.has(f.name))?.name);
  take('location', byRe(LOCATION));
  take('category', byRe(CATEGORY));
  take('description', byRe(DESCRIPTION));
  return out;
}

/** True when the suggestion (plus any explicit overrides) can place an event on a calendar. */
export function isCalendarShaped(suggested: Partial<FieldMap>, overrides: Partial<FieldMap> = {}): boolean {
  const m = {...suggested, ...overrides};
  return Boolean(m.title && m.start && m.end);
}

export function resolveFieldMap(suggested: Partial<FieldMap>, overrides: Partial<FieldMap>): FieldMap {
  return {...DEFAULT_FIELD_MAP, ...suggested, ...overrides};
}

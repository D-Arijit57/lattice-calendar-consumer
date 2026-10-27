import {describe, expect, it} from 'vitest';
import {isCalendarShaped, resolveFieldMap, suggestFieldMap, type SchemaField} from './suggest.ts';

const f = (name: string, data_type = 'string', required = false): SchemaField => ({name, data_type, required});

describe('suggestFieldMap', () => {
  it('recognises the canonical Event schema', () => {
    const m = suggestFieldMap([f('title', 'string', true), f('description'), f('start_time', 'string', true),
      f('end_time', 'string', true), f('location'), f('category')]);
    expect(m).toEqual({start: 'start_time', end: 'end_time', title: 'title', location: 'location', category: 'category', description: 'description'});
  });
  it('recognises alternative names', () => {
    const m = suggestFieldMap([f('name', 'string', true), f('starts_at'), f('ends_at'), f('venue'), f('kind'), f('about')]);
    expect(m).toMatchObject({title: 'name', start: 'starts_at', end: 'ends_at', location: 'venue', category: 'kind', description: 'about'});
  });
  it('ignores non-string types for time roles and uses a required string as title fallback', () => {
    const m = suggestFieldMap([f('headline', 'string', true), f('start', 'date'), f('end', 'number')]);
    expect(m).toEqual({title: 'headline'});
  });
  it('uses each field for one role only', () => {
    const m = suggestFieldMap([f('title', 'string', true), f('start_time'), f('end_time'), f('start_location')]);
    expect(m.start).toBe('start_time'); // not start_location
    expect(m.location).toBe('start_location');
  });
});

describe('isCalendarShaped / resolveFieldMap', () => {
  it('needs title, start and end, counting overrides', () => {
    expect(isCalendarShaped({title: 'a', start: 'b'})).toBe(false);
    expect(isCalendarShaped({title: 'a', start: 'b'}, {end: 'c'})).toBe(true);
  });
  it('layers defaults < suggestion < overrides', () => {
    expect(resolveFieldMap({start: 's', end: 'e'}, {end: 'x'})).toMatchObject({start: 's', end: 'x', title: 'title'});
  });
});

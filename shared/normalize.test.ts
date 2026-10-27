import {describe, expect, it} from 'vitest';
import {normalizeEntry, parseInstant} from './normalize.ts';

const entry = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: 7, version_number: 2, updated_at: '2026-10-01T00:00:00Z', data, ...extra,
});
const valid = {title: 'Launch', start_time: '2026-11-03T14:00:00+05:30', end_time: '2026-11-03T15:30:00+05:30'};

describe('parseInstant', () => {
  it('converts offsets to the same UTC instant', () => {
    expect(parseInstant('2026-11-03T14:00:00+05:30')?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
    expect(parseInstant('2026-11-03T08:30:00Z')?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
    expect(parseInstant('2026-11-03T03:30:00-05:00')?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
    expect(parseInstant('2026-11-03T08:30:00.250+0000')?.toISOString()).toBe('2026-11-03T08:30:00.250Z');
  });
  it('accepts a missing seconds component', () => {
    expect(parseInstant('2026-11-03T08:30Z')?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
  });
  it('rejects times without an offset (ambiguous)', () => {
    expect(parseInstant('2026-11-03T14:00:00')).toBeNull();
    expect(parseInstant('2026-11-03')).toBeNull();
  });
  it('rejects impossible and non-string values', () => {
    expect(parseInstant('2026-02-31T10:00:00Z')).toBeNull();
    expect(parseInstant('2026-13-01T10:00:00Z')).toBeNull();
    expect(parseInstant('2026-11-03T25:00:00Z')).toBeNull();
    expect(parseInstant('2026-11-03T10:00:00+25:00')).toBeNull();
    expect(parseInstant('tomorrow')).toBeNull();
    expect(parseInstant(1762160400)).toBeNull();
    expect(parseInstant(null)).toBeNull();
  });
});

describe('normalizeEntry', () => {
  it('maps a valid entry', () => {
    const r = normalizeEntry(entry({...valid, description: ' Hi ', location: 'Room 1', category: 'talk'}));
    expect(r).toEqual({
      ok: true,
      event: {
        id: '7', title: 'Launch', description: 'Hi', start: '2026-11-03T08:30:00.000Z', end: '2026-11-03T10:00:00.000Z',
        location: 'Room 1', category: 'talk', versionNumber: 2, updatedAt: '2026-10-01T00:00:00Z',
      },
    });
  });
  it('treats absent, null and blank optionals as null', () => {
    const r = normalizeEntry(entry({...valid, description: null, location: '   '}));
    expect(r.ok && [r.event.description, r.event.location, r.event.category]).toEqual([null, null, null]);
  });
  it('allows a zero-length event but not a negative one', () => {
    expect(normalizeEntry(entry({...valid, end_time: valid.start_time})).ok).toBe(true);
    const r = normalizeEntry(entry({...valid, end_time: '2026-11-03T13:00:00+05:30'}));
    expect(r).toMatchObject({ok: false, id: '7', reason: 'end_time is before start_time.'});
  });
  it.each([
    [{...valid, title: ' '}, 'title is missing.'],
    [{...valid, start_time: undefined}, /start_time/],
    [{...valid, end_time: '2026-11-03T15:30:00'}, /end_time/],
    [{...valid, location: 5}, 'location must be text.'],
  ])('skips invalid data %#', (data, reason) => {
    const r = normalizeEntry(entry(data as Record<string, unknown>));
    expect(r.ok).toBe(false);
    if (!r.ok) typeof reason === 'string' ? expect(r.reason).toBe(reason) : expect(r.reason).toMatch(reason);
  });
  it('survives garbage input', () => {
    expect(normalizeEntry(null).ok).toBe(false);
    expect(normalizeEntry({id: 1, data: [1]}).ok).toBe(false);
    expect(normalizeEntry({data: valid}).ok).toBe(false);
  });
});

import {describe, expect, it} from 'vitest';
import {categoryColor, formatRange} from './format.ts';

describe('formatRange', () => {
  const ev = (start: string, end: string) => ({start, end});
  it('renders the same instant in different viewer timezones', () => {
    const r = ev('2026-11-03T08:30:00.000Z', '2026-11-03T10:00:00.000Z');
    expect(formatRange(r, 'Asia/Kolkata').time).toMatch(/2:00.?PM.*3:30.?PM.*(IST|GMT\+5:30)/);
    expect(formatRange(r, 'America/Los_Angeles').time).toMatch(/12:30.?AM.*2:00.?AM.*(PST|GMT-8)/);
  });
  it('shows both dates when the event crosses local midnight', () => {
    const r = formatRange(ev('2026-11-03T17:30:00Z', '2026-11-03T19:30:00Z'), 'Asia/Kolkata'); // 23:00 -> 01:00 next day
    expect(r.date).toContain('→');
    expect(formatRange(ev('2026-11-03T08:30:00Z', '2026-11-03T10:00:00Z'), 'Asia/Kolkata').date).not.toContain('→');
  });
});

describe('categoryColor', () => {
  it('is stable and case-insensitive, with a neutral fallback', () => {
    expect(categoryColor('Meeting')).toBe(categoryColor('meeting'));
    expect(categoryColor(null)).toBe('#404040');
  });
});

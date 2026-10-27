import {describe, expect, it} from 'vitest';
import {buildIcs, escapeText, foldLine, icsFilename, toIcsUtc} from './ics.ts';
import type {CalendarEvent} from './types.ts';

const ev: CalendarEvent = {
  id: '7', title: 'Launch; party, "big"', description: 'Line1\nLine2 \\ end', start: '2026-11-03T08:30:00.000Z',
  end: '2026-11-03T10:00:00.000Z', location: 'Room 1, HQ', category: 'social', versionNumber: 1, updatedAt: null,
};

describe('ics', () => {
  it('formats UTC timestamps', () => {
    expect(toIcsUtc('2026-11-03T08:30:00.000Z')).toBe('20261103T083000Z');
  });
  it('escapes TEXT values', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\;b\\,c\\\\d\\ne');
  });
  it('builds a CRLF document with required properties', () => {
    const out = buildIcs(ev, new Date('2026-10-28T00:00:00Z'));
    expect(out.endsWith('\r\n')).toBe(true);
    expect(out.split('\r\n').filter(Boolean)).toEqual([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lattice Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:lattice-entry-7@lattice-calendar', 'DTSTAMP:20261028T000000Z',
      'DTSTART:20261103T083000Z', 'DTEND:20261103T100000Z',
      'SUMMARY:Launch\; party\\, "big"', 'DESCRIPTION:Line1\\nLine2 \\\\ end', 'LOCATION:Room 1\\, HQ',
      'CATEGORIES:social', 'END:VEVENT', 'END:VCALENDAR',
    ]);
  });
  it('omits empty optional properties', () => {
    const out = buildIcs({...ev, description: null, location: null, category: null});
    expect(out).not.toMatch(/DESCRIPTION|LOCATION|CATEGORIES/);
  });
  it('folds long lines at 75 octets without splitting characters', () => {
    const line = 'SUMMARY:' + 'é'.repeat(100);
    const folded = foldLine(line).split('\r\n');
    for (const [i, part] of folded.entries()) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75); // continuation parts include their leading space
      if (i) expect(part[0]).toBe(' ');
    }
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });
  it('makes a safe filename', () => {
    expect(icsFilename(ev)).toBe('launch-party-big-7.ics');
    expect(icsFilename({...ev, title: '!!!'})).toBe('event-7.ics');
  });
});

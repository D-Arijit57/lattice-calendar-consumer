import type {CalendarEvent} from '../../shared/types.ts';

const dateFmt = (tz?: string) =>
  new Intl.DateTimeFormat(undefined, {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz});
const timeFmt = (tz?: string, withZone = false) =>
  new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit', timeZone: tz, ...(withZone ? {timeZoneName: 'short' as const} : {})});

/**
 * Human-readable range in the viewer's timezone (or `tz` in tests). Same-day events show one date;
 * events crossing local midnight show both, so a 23:00-01:00 shift is never displayed as 23:00 to 01:00 "today".
 */
export function formatRange(event: Pick<CalendarEvent, 'start' | 'end'>, tz?: string): {date: string; time: string} {
  const s = new Date(event.start);
  const e = new Date(event.end);
  const d = dateFmt(tz);
  if (d.format(s) === d.format(e)) {
    return {date: d.format(s), time: `${timeFmt(tz).format(s)} – ${timeFmt(tz, true).format(e)}`};
  }
  return {date: `${d.format(s)} → ${d.format(e)}`, time: `${timeFmt(tz).format(s)} – ${timeFmt(tz, true).format(e)}`};
}

const PALETTE = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#4f46e5', '#65a30d'];
const NEUTRAL = '#404040';

/** Stable colour per category. Colour is decoration only: the category name is always shown as text too. */
export function categoryColor(category: string | null): string {
  if (!category) return NEUTRAL;
  let h = 0;
  for (const ch of category.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

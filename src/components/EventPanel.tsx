import {useEffect, useRef} from 'react';
import {buildIcs, icsFilename} from '../../shared/ics.ts';
import type {CalendarEvent} from '../../shared/types.ts';
import {downloadText} from '../lib/download.ts';
import {categoryColor, formatRange} from '../lib/format.ts';

interface Props {
  event: CalendarEvent;
  onClose: () => void;
}

/** Side panel on wide screens, bottom sheet on narrow ones (see .event-panel in index.css). */
export function EventPanel({event, onClose}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const {date, time} = formatRange(event);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event.id, onClose]);

  return (
    <>
      <button type="button" aria-label="Close event details" className="panel-backdrop" onClick={onClose} tabIndex={-1} />
      <aside className="event-panel" role="dialog" aria-labelledby="event-title" aria-modal="false">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {event.category && (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                <span aria-hidden className="size-2 rounded-full" style={{background: categoryColor(event.category)}} />
                {event.category}
              </span>
            )}
            <h2 id="event-title" className="font-display text-xl font-semibold leading-snug break-words text-neutral-900">
              {event.title}
            </h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="label">When</dt>
            <dd className="mt-1 text-neutral-900">{date}</dd>
            <dd className="text-neutral-600">{time}</dd>
          </div>
          {event.location && (
            <div>
              <dt className="label">Where</dt>
              <dd className="mt-1 break-words text-neutral-900">{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div>
              <dt className="label">Details</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-neutral-700">{event.description}</dd>
            </div>
          )}
        </dl>

        <button
          type="button"
          className="btn-primary mt-6 w-full"
          onClick={() => downloadText(icsFilename(event), buildIcs(event), 'text/calendar;charset=utf-8')}
        >
          Add to calendar (.ics)
        </button>
        <p className="mt-3 text-xs text-neutral-500">Lattice entry #{event.id}</p>
      </aside>
    </>
  );
}

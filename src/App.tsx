import type FullCalendar from '@fullcalendar/react';
import {useCallback, useMemo, useRef, useState} from 'react';
import {CalendarView, type ViewName} from './components/CalendarView.tsx';
import {EventPanel} from './components/EventPanel.tsx';
import {ErrorBanner, Overlay, SkippedNotice} from './components/Notices.tsx';
import {useEvents} from './lib/useEvents.ts';

const VIEWS: {id: ViewName; label: string}[] = [
  {id: 'dayGridMonth', label: 'Month'},
  {id: 'timeGridWeek', label: 'Week'},
  {id: 'listMonth', label: 'Agenda'},
];

// Phones start on Agenda: a month grid is too small to read there.
const initialView: ViewName = window.matchMedia('(max-width: 639px)').matches ? 'listMonth' : 'dayGridMonth';

export default function App() {
  const calendar = useRef<FullCalendar>(null);
  const {data, loading, refreshing, error, refresh} = useEvents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<{title: string; view: ViewName; isToday: boolean}>({title: '', view: initialView, isToday: true});

  const events = data?.events ?? [];
  const selected = useMemo(() => events.find((e) => e.id === selectedId) ?? null, [events, selectedId]);
  const api = () => calendar.current?.getApi();
  const closePanel = useCallback(() => setSelectedId(null), []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-neutral-900 text-white">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 7h14M6 3v2M14 3v2M4.5 5h11A1.5 1.5 0 0 1 17 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5Z" />
            </svg>
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold leading-tight">Lattice Calendar</h1>
            <p className="text-xs text-neutral-500">Events delivered from Lattice</p>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing} aria-live="polite">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-icon" aria-label="Previous" onClick={() => api()?.prev()}>
            <Chevron dir="left" />
          </button>
          <button type="button" className="btn-icon" aria-label="Next" onClick={() => api()?.next()}>
            <Chevron dir="right" />
          </button>
          <button type="button" className="btn-secondary" onClick={() => api()?.today()} aria-disabled={nav.isToday}>
            Today
          </button>
          <h2 className="ml-1 font-display text-lg font-semibold sm:text-xl" aria-live="polite">{nav.title}</h2>
        </div>
        <div role="group" aria-label="Calendar view" className="inline-flex rounded-lg bg-neutral-200/70 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={nav.view === v.id}
              className="seg"
              onClick={() => api()?.changeView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refresh} hasData={!!data} />}
      {data && <SkippedNotice skipped={data.skipped} truncated={data.truncated} />}

      <main className="relative min-h-[480px] flex-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:p-4" aria-busy={loading}>
        <div className="calendar-host h-[calc(100dvh-14rem)] min-h-[480px]">
          <CalendarView ref={calendar} events={events} initialView={initialView} onSelect={setSelectedId} onDates={setNav} />
        </div>
        {loading && (
          <Overlay>
            <p role="status" className="flex items-center gap-3 text-sm text-neutral-600">
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
              Loading events…
            </p>
          </Overlay>
        )}
        {!loading && !error && data && events.length === 0 && (
          <Overlay>
            <div className="pointer-events-none">
              <p className="font-display text-lg font-semibold">No events yet</p>
              <p className="mt-1 max-w-xs text-sm text-neutral-600">
                Create entries in your Lattice Event content type and they will appear here.
              </p>
            </div>
          </Overlay>
        )}
        {!loading && error && !data && (
          <Overlay>
            <p className="text-sm text-neutral-600">Events are unavailable right now.</p>
          </Overlay>
        )}
      </main>

      {selected && <EventPanel event={selected} onClose={closePanel} />}
    </div>
  );
}

function Chevron({dir}: {dir: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} />
    </svg>
  );
}

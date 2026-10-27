import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import {forwardRef, useMemo} from 'react';
import type {CalendarEvent} from '../../shared/types.ts';
import {categoryColor} from '../lib/format.ts';

export type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'listMonth';

interface Props {
  events: CalendarEvent[];
  initialView: ViewName;
  onSelect: (id: string) => void;
  onDates: (info: {title: string; view: ViewName; isToday: boolean}) => void;
}

/**
 * FullCalendar with its own toolbar disabled; App drives navigation through the ref so the
 * controls are ordinary, accessible buttons. `timeZone="local"` renders every event in the
 * viewer's timezone from the UTC instants the server sends.
 */
export const CalendarView = forwardRef<FullCalendar, Props>(function CalendarView(
  {events, initialView, onSelect, onDates},
  ref,
) {
  const fcEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: categoryColor(e.category),
        borderColor: categoryColor(e.category),
      })),
    [events],
  );

  return (
    <FullCalendar
      ref={ref}
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={initialView}
      headerToolbar={false}
      timeZone="local"
      events={fcEvents}
      height="100%"
      dayMaxEvents={3}
      nowIndicator
      eventInteractive
      navLinks={false}
      scrollTime="08:00:00"
      eventTimeFormat={{hour: 'numeric', minute: '2-digit', meridiem: 'short'}}
      noEventsContent="No events in this period"
      eventClick={(info) => {
        info.jsEvent.preventDefault();
        onSelect(info.event.id);
      }}
      datesSet={(arg) =>
        onDates({
          title: arg.view.title,
          view: arg.view.type as ViewName,
          isToday: arg.start <= new Date() && new Date() < arg.end,
        })
      }
    />
  );
});

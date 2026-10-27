/** The calendar's internal event shape. Times are UTC ISO-8601 strings ending in "Z". */
export interface CalendarEvent {
  /** Lattice entry id, stringified. */
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  location: string | null;
  category: string | null;
  /** Schema version the entry is pinned to; informational. */
  versionNumber: number | null;
  updatedAt: string | null;
}

/** An entry that was returned by Lattice but could not be shown, with the reason. */
export interface SkippedEntry {
  id: string;
  reason: string;
}

/** Body of GET /api/events. */
export interface EventsResponse {
  events: CalendarEvent[];
  skipped: SkippedEntry[];
  /** True if the page cap was hit, so older entries are missing. */
  truncated: boolean;
  fetchedAt: string;
  /** Which Lattice content type these events came from. */
  source: {contentType: string; slug: string; discovered: boolean};
}

/** Body of every non-2xx response from this app's API. */
export interface ApiError {
  error: { code: string; message: string };
}

/** One content type in the organization, as shown in the picker. */
export interface ContentTypeOption {
  slug: string;
  name: string;
  /** True if it has fields that can fill title, start and end. */
  calendarShaped: boolean;
}

/** Body of GET /api/types. */
export interface TypesResponse {
  types: ContentTypeOption[];
  /** False when Lattice has no discovery routes: the picker is then unavailable. */
  discoveryAvailable: boolean;
}

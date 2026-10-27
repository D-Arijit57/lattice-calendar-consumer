# Lattice Calendar

A read-only calendar that displays **Event** entries from [Lattice](../Lattice)'s Delivery API. Month, Week and Agenda views, an event details panel, and `.ics` export.

```
Browser ──> Node server (this repo: server/) ──Bearer lat_…──> Lattice  /api/delivery/content-types/<slug>/entries/
```

The Lattice API key is read from the server's environment and only ever sent from the server. The browser calls this app's `/api/events`, which returns normalized events. Lattice's delivery routes have no CORS by design (Decision 122), so a server-side hop is required anyway.

## Setup

Requires Node 20+ and a running Lattice with an Event content type and a read-only API key.

```bash
npm install
cp .env.example .env      # fill in LATTICE_API_KEY etc.
npm run dev               # UI http://localhost:3001 (Vite) + API http://localhost:3002
```

Production-style: `npm run build && npm start` serves the UI and API together on `PORT` (default 3002).

| Variable | Meaning |
|---|---|
| `LATTICE_API_BASE_URL` | Lattice API base incl. `/api`, e.g. `http://localhost:8000/api` |
| `LATTICE_API_KEY` | Read-only key (`lat_…`). Server-only; none of these variables are `VITE_*`. |
| `LATTICE_EVENT_CONTENT_TYPE` | Slug of the Event content type (default `event`) |
| `PORT` | Server port (default 3002) |
| `EVENTS_CACHE_TTL_SECONDS` | Server cache for `/api/events` (default 30) |

## Event content type in Lattice

Create a content type with slug `event` and these fields, then publish a version. **All six are `string` fields**, because Lattice has no date-time type (`date` is `YYYY-MM-DD` only):

| Field | Required | Format |
|---|---|---|
| `title` | yes | text |
| `start_time`, `end_time` | yes | ISO-8601 **with a UTC offset**, e.g. `2026-11-03T14:00:00+05:30` or `…Z` |
| `description`, `location`, `category` | no | text |

Lattice does not validate the time strings. This app does: entries whose times lack an offset (ambiguous), are impossible, or end before they start are skipped and listed in a notice above the calendar.

`npm run seed` (with `SEED_EMAIL`/`SEED_PASSWORD`) creates the content type, sample entries and a key in a **local** Lattice via its public API, and prints the key.

## Behaviour

- Times are stored as UTC instants and rendered in the **viewer's** timezone.
- The Delivery API has no date filter, so all pages are fetched (cursor pagination, 50/page, max 20 pages = 1,000 newest entries; a notice appears if truncated). Lattice's `next` URL is never followed; only its `cursor` is reused against the configured base URL.
- Refresh: server cache of 30 s; the UI reloads on tab focus after 30 s and via the Refresh button (which bypasses the cache, at most once per 5 s). Lattice allows 60 requests/min per key.
- `.ics` is generated in the browser from already-loaded data (UTC times, RFC 5545 escaping/folding).

## Deploy on Vercel

`api/events.ts` is a Vercel Function that serves `/api/events` using the same code as the Node server; Vercel auto-detects Vite for the UI.

1. Import this repo in Vercel.
2. Add environment variables (Settings -> Environment Variables): `LATTICE_API_BASE_URL`, `LATTICE_API_KEY`, `LATTICE_EVENT_CONTENT_TYPE`. Never use a `VITE_` prefix: that would put the key in the browser bundle.
3. Deploy, then open `/api/events` to check it returns JSON.

The 30 s cache is per warm function instance. The function itself has only been unit-tested locally; the first Vercel deploy is its real test.

## Commands

`npm test` (vitest) · `npm run lint` (tsc) · `npm run build`

## Limitations

- No update/delete in Lattice V1, so changes are seen as new entries only.
- Only the newest 1,000 entries are loaded; no server-side date filtering exists.
- Every entry in the organization's Event type is shown (no draft/published in Lattice V1).
- Single-process in-memory cache; no Vercel function wrapper is included (Node server only).
- The UI has no component tests; verification of rendering was manual in Chrome.

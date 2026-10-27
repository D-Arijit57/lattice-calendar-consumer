# Lattice Calendar

A read-only calendar that displays event entries from [Lattice](https://github.com/D-Arijit57/Lattice), a multi-tenant headless content engine, through its Delivery API. It never touches Lattice's database and treats Events as ordinary schema-defined content.

**Live:** https://lattice-calendar-consumer.vercel.app

## Features

- Month, Week and Agenda views, Previous / Next / Today, and an event details panel
- Times rendered in the **viewer's** timezone from UTC instants
- Export a single event to `.ics`
- Loading, empty and error states, plus a notice listing entries Lattice returned but the calendar could not show
- Content type picker (appears when the organization has two or more content types)
- Responsive: phones open on Agenda
- Auto-detects which Lattice content type and fields to use; environment variables override detection

## How it works

```
Browser ──> /api/events, /api/types ──> server (Vercel Functions, or Node server locally)
                                           │  Authorization: Bearer lat_…
                                           ▼
                              Lattice  /api/delivery/content-types/…
```

- **The API key never reaches the browser.** It is read from server environment variables and sent only from the server. The browser calls this app's own `/api/*` routes, which return normalized data. (Lattice's delivery routes have no CORS by design, so a server hop is needed anyway.)
- **Discovery.** The server asks Lattice for the key's content types (`GET /api/delivery/content-types/`), reads each latest field schema (`…/<slug>/`), and picks the type shaped like an event: a title plus start and end `string` fields, matched by name (`start_time`, `starts_at`, `begin`, …). Per field role the precedence is `LATTICE_FIELD_MAP` > detected name > default name.
- **Fallback.** Lattice versions without the discovery routes still work: the slug defaults to `event` and fields to the defaults below.
- **Pagination.** All pages of entries are fetched (cursor pagination, 50 per page, up to 20 pages = the newest 1,000). Lattice's `next` URL is never followed; only its `cursor` is reused against the configured base URL, so the key is only ever sent to your configured Lattice.
- **Caching.** Responses are cached per content type for 30 s; concurrent requests share one upstream fetch, which keeps usage far below Lattice's 60 requests/min per key. The Refresh button bypasses the cache, at most once per 5 s.

## Quick start (local)

Requires Node 20+, and a Lattice with an Event content type and a **read-only API key** for its organization.

```bash
npm install
cp .env.example .env      # set LATTICE_API_BASE_URL and LATTICE_API_KEY
npm run dev               # UI http://localhost:3001 (Vite) + API http://localhost:3002
```

Production-style, single process: `npm run build && npm start` serves the UI and API on `PORT` (default 3002).

## Configuration

All variables are read **server-side only**. None may start with `VITE_`: that would inline the value into the public browser bundle.

| Variable | Required | Meaning |
|---|---|---|
| `LATTICE_API_BASE_URL` | yes | Lattice API base including `/api`, e.g. `http://localhost:8000/api` |
| `LATTICE_API_KEY` | yes | Read-only key (`lat_…`) |
| `LATTICE_EVENT_CONTENT_TYPE` | no | Slug to pin. Unset = auto-detect |
| `LATTICE_FIELD_MAP` | no | JSON overriding which Lattice field plays each role: `title`, `start`, `end`, `description`, `location`, `category`. Example: `{"title":"name","start":"starts_at","end":"ends_at"}`. Unlisted roles use detected/default names. Applies only to the configured type, never to one picked in the UI. |
| `EVENTS_CACHE_TTL_SECONDS` | no | Server cache lifetime (default 30) |
| `PORT` | no | Local Node server port (default 3002; not used on Vercel) |

Invalid configuration is reported with every problem at once and never echoes secret values.

## Event content type in Lattice

Default field names (all `string`, because Lattice has no date-time field type):

| Field | Required | Format |
|---|---|---|
| `title` | yes | text |
| `start_time`, `end_time` | yes | ISO-8601 **with a UTC offset**: `2026-11-03T14:00:00+05:30` or `2026-11-03T08:30:00Z` |
| `description`, `location`, `category` | no | text |

Create the content type, add the fields, **publish a version**, then add entries. Lattice does not validate the time strings; this app does. An entry whose time has no offset (ambiguous), is impossible (e.g. Feb 31) or ends before it starts is skipped and listed in a notice above the calendar with the reason.

`npm run seed` (with `SEED_EMAIL` and `SEED_PASSWORD`) creates a content type, sample entries and a key in a **local** Lattice through its public API and prints the key. It refuses non-local URLs.

## Content type picker

With two or more content types, a "Content type" dropdown appears in the header. Types lacking title/start/end fields are listed but disabled. The choice is remembered in the browser (`localStorage`) and wins over the configured or auto-detected type. A remembered type that no longer exists falls back to the default. On Lattice versions without discovery routes the picker is hidden.

## Deploy on Vercel

1. Import this repository in Vercel (the Vite preset is detected automatically).
2. Settings → Environment Variables: set `LATTICE_API_BASE_URL` and `LATTICE_API_KEY` (Production, and Preview if you use it). Optionally `LATTICE_EVENT_CONTENT_TYPE` and `LATTICE_FIELD_MAP`. Redeploy after changing variables.
3. Open `<your-url>/api/types` and `<your-url>/api/events`: both should return JSON.

The backend is two Vercel Functions, `api/events.js` and `api/types.js`, generated from `server/vercel-entry.ts` and bundled by esbuild into self-contained files. **They are committed build output.** After changing anything under `server/` or `shared/`, run `npm run bundle:api` (`npm run build` also does it) and commit the result. `npm test` fails if they are stale.

**Troubleshooting**

| Symptom | Likely cause |
|---|---|
| `500` with body `{"error":{"code":"misconfigured"…}}` | A required variable is missing or invalid; the function log names which one (never its value) |
| `502` `unauthorized` | Key invalid or revoked |
| `502` `not_found` | Pinned content type does not exist for this key's organization |
| `502` `no_event_type` | No content type has title/start/end fields; set `LATTICE_EVENT_CONTENT_TYPE` and `LATTICE_FIELD_MAP` |
| `503` `rate_limited` | Lattice's 60 requests/min per key was hit; retry shortly |
| `500` plain text `FUNCTION_INVOCATION_FAILED` | The function crashed on load: re-run `npm run bundle:api` and commit |
| Calendar empty, notice about skipped entries | Times lack a UTC offset or are invalid; see the notice for reasons |

## Project structure

```
src/        React UI (calendar, details panel, picker, notices) and client helpers
server/     Lattice client, discovery, config, cache, shared request handler, local Node server
shared/     Code used by both sides: types, entry normalization, .ics builder, field-name heuristics
api/        Generated Vercel Functions (committed bundles of server/vercel-entry.ts)
scripts/    bundle-api.mjs (esbuild), seed-lattice.ts (local demo data)
```

Built with React 19, Vite, Tailwind CSS 4 and FullCalendar 6.1 (MIT; v7 is a different design and not used).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite UI + Node API with reload |
| `npm run build` | Build the UI and regenerate `api/*.js` |
| `npm start` | Serve the built UI and API (single process) |
| `npm test` | Vitest: normalization, `.ics`, discovery, pagination, caching, handler, bundle freshness |
| `npm run lint` | Type-check (`tsc --noEmit`) |
| `npm run bundle:api` | Regenerate `api/*.js` |
| `npm run seed` | Create demo data in a local Lattice |

## Limitations

- **Lattice has no date-time field type**, so times are strings validated only by this app. Detection of the start/end fields is name-based and may need `LATTICE_FIELD_MAP`; at most 10 content types are scanned.
- **Lattice V1 has no edit/delete**, so changes appear as new entries only.
- **No server-side date filtering**: only the newest 1,000 entries load (a notice appears if there are more).
- **No draft/published state in Lattice V1**: every entry of the chosen type is shown.
- **No login**: anyone with the URL sees the events. Do not point it at an organization whose events should be private.
- **`.ics` export is per event** (no subscription feed). Files were validated with a parser but not imported into specific calendar apps.
- **The cache is per server instance**, so serverless cold starts reset it.
- **No component or browser tests**: the UI was verified by hand in Chrome; the data layer, handler and `.ics` are covered by automated tests.
- Auto-detection needs a Lattice version with the delivery discovery routes (`GET /api/delivery/content-types/`); older versions use the configured/default names.

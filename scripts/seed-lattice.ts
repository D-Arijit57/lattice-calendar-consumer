/**
 * Demo/E2E helper: creates an Event content type, sample entries and a read-only API key in a
 * Lattice organization through Lattice's public control-plane API (login cookies), then prints
 * the key. It never touches the Lattice database. Point it at a LOCAL Lattice only.
 *
 *   LATTICE_API_BASE_URL=http://localhost:8000/api SEED_EMAIL=you@example.com SEED_PASSWORD=... npm run seed
 */
const base = (process.env.LATTICE_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/+$/, '');
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;
if (!email || !password) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD.');
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) {
  console.error(`Refusing to seed non-local Lattice at ${base}.`);
  process.exit(1);
}

let cookies = '';
async function call(method: string, path: string, body?: unknown, okStatuses = [200, 201]) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {'Content-Type': 'application/json', ...(cookies ? {Cookie: cookies} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length) cookies = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!okStatuses.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

await call('POST', '/auth/signup/', {name: 'Calendar Seed', email, password}, [201, 400]);
await call('POST', '/auth/login/', {email, password});
const org = await call('POST', '/organizations/', {name: `Calendar Demo ${new Date().toISOString().slice(0, 16)}`});
const o = `/organizations/${org.id}`;
const ct = await call('POST', `${o}/content-types/`, {name: 'Event', slug: 'event'});
const f = `${o}/content-types/${ct.id}`;
for (const [name, required] of [['title', true], ['description', false], ['start_time', true], ['end_time', true], ['location', false], ['category', false]] as const) {
  await call('POST', `${f}/fields/`, {name, data_type: 'string', required});
}
await call('POST', `${f}/versions/`, {});

// Dates are relative to now so the demo always has events in the current month and week.
const day = (offset: number, hh: number, mm: number, zone: string) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hh)}:${p(mm)}:00${zone}`;
};
const samples = [
  {title: 'Team standup', start_time: day(0, 9, 30, '+05:30'), end_time: day(0, 10, 0, '+05:30'), location: 'Zoom', category: 'meeting'},
  {title: 'Design review', description: 'Review the new calendar UI, with notes; follow-ups.', start_time: day(1, 14, 0, '+05:30'), end_time: day(1, 15, 30, '+05:30'), location: 'Room 4, HQ', category: 'meeting'},
  {title: 'Launch party', description: 'Cake.\nMusic.', start_time: day(3, 18, 0, 'Z'), end_time: day(3, 21, 0, 'Z'), location: 'Rooftop', category: 'social'},
  {title: 'Conference (UTC-8)', start_time: day(5, 9, 0, '-08:00'), end_time: day(6, 17, 0, '-08:00'), category: 'conference'},
  {title: 'Night shift handover', start_time: day(2, 23, 0, '+05:30'), end_time: day(3, 1, 0, '+05:30'), category: 'ops'},
  {title: 'Quarterly planning', start_time: day(-4, 11, 0, '+05:30'), end_time: day(-4, 13, 0, '+05:30'), location: 'Board room', category: 'planning'},
];
for (const data of samples) await call('POST', `${f}/entries/`, {data});
// One deliberately invalid-for-the-calendar entry: Lattice accepts it (both are plain strings).
await call('POST', `${f}/entries/`, {data: {title: 'No timezone', start_time: '2026-11-03T14:00:00', end_time: '2026-11-03T15:00:00'}});

const key = await call('POST', `${o}/api-keys/`, {name: 'calendar-readonly'});
console.log(`org=${org.id} content_type=${ct.id} entries=${samples.length + 1}`);
console.log(`LATTICE_API_KEY=${key.key}`);

import {loadConfig} from './config.ts';
import {createEventsService, createTypesService} from './events.ts';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Services = {events: ReturnType<typeof createEventsService>; types: ReturnType<typeof createTypesService>};

/**
 * Web-standard handler for the app's API (GET /api/events[?type=&fresh=], GET /api/types), shared by
 * the Vercel function and the Node server. Config and caches are created lazily and reused while the
 * instance stays warm. A bad configuration returns a generic 500 and logs which variables are wrong,
 * never their values.
 */
export function createApiHandler(env: NodeJS.ProcessEnv = process.env) {
  let services: Services | null = null;

  return async function handle(request: Request): Promise<Response> {
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {status, headers: {...HEADERS, ...extra}});
    const error = (status: number, code: string, message: string) => json(status, {error: {code, message}});

    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '');
    if (route !== '/api/events' && route !== '/api/types') return error(404, 'not_found', 'Unknown API route.');
    if (request.method !== 'GET') return json(405, {error: {code: 'method_not_allowed', message: 'Use GET.'}}, {Allow: 'GET'});

    if (!services) {
      try {
        const cfg = loadConfig(env);
        services = {
          events: createEventsService(cfg.lattice, cfg.cacheTtlMs),
          types: createTypesService(cfg.lattice, cfg.cacheTtlMs),
        };
      } catch (err) {
        console.error((err as Error).message);
        return error(500, 'misconfigured', 'The server is not configured correctly.');
      }
    }

    if (route === '/api/types') {
      const r = await services.types();
      return json(r.status, r.body);
    }
    const type = url.searchParams.get('type') ?? undefined;
    if (type !== undefined && !SLUG.test(type)) return error(400, 'bad_type', 'type must be a content type slug.');
    const r = await services.events({fresh: url.searchParams.has('fresh'), type});
    return json(r.status, r.body);
  };
}

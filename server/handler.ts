import {loadConfig} from './config.ts';
import {createEventsService} from './events.ts';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

type Service = ReturnType<typeof createEventsService>;

/**
 * Web-standard handler for GET /api/events, used by the Vercel function. Config and the
 * in-memory cache are created lazily and reused while the function instance stays warm.
 * A bad configuration returns a generic 500 and logs which variables are wrong, never their values.
 */
export function createEventsHandler(env: NodeJS.ProcessEnv = process.env) {
  let service: Service | null = null;

  return async function handle(request: Request): Promise<Response> {
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {status, headers: {...HEADERS, ...extra}});

    if (request.method !== 'GET') return json(405, {error: {code: 'method_not_allowed', message: 'Use GET.'}}, {Allow: 'GET'});

    if (!service) {
      try {
        const cfg = loadConfig(env);
        service = createEventsService(cfg.lattice, cfg.cacheTtlMs);
      } catch (err) {
        console.error((err as Error).message);
        return json(500, {error: {code: 'misconfigured', message: 'The server is not configured correctly.'}});
      }
    }
    const result = await service({fresh: new URL(request.url).searchParams.has('fresh')});
    return json(result.status, result.body);
  };
}

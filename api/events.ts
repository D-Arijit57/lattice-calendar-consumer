// Vercel Function: GET /api/events. Holds the Lattice API key (from Vercel environment
// variables) so the browser never sees it. Same pattern as Lattice's own api/proxy.ts.
import {createApiHandler} from '../server/handler.ts';

const handle = createApiHandler();

export default {
  fetch: (request: Request): Promise<Response> => handle(request),
};

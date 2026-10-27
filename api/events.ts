// Vercel Function: GET /api/events. Holds the Lattice API key (from Vercel environment
// variables) so the browser never sees it. Same pattern as Lattice's own api/proxy.ts.
import {createEventsHandler} from '../server/handler.ts';

const handle = createEventsHandler();

export default {
  fetch: (request: Request): Promise<Response> => handle(request),
};

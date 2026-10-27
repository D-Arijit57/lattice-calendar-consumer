// Vercel Function: GET /api/types (content types for the picker). See events.ts.
import {createApiHandler} from '../server/handler.ts';

const handle = createApiHandler();

export default {
  fetch: (request: Request): Promise<Response> => handle(request),
};

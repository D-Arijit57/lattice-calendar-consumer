import {createReadStream, existsSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, normalize, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.ts';
import {createApiHandler} from './handler.ts';

try {
  process.loadEnvFile(); // .env in the working directory; real env vars win
} catch {
  /* no .env file: rely on the process environment */
}

let config;
try {
  config = loadConfig(); // fail fast at startup; the handler re-reads the same environment
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const api = createApiHandler();
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const secure = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};

  if (url.pathname.startsWith('/api/')) {
    const r = await api(new Request(url, {method: req.method}));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
    return;
  }

  // Static files from dist/, falling back to index.html. Resolved paths must stay inside dist/.
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* malformed escape: serve the SPA shell */
    pathname = '/';
  }
  let file = resolve(join(DIST, normalize(pathname)));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, {'Content-Type': 'text/plain', ...secure}).end('UI not built. Run "npm run build" first.');
    return;
  }
  res.writeHead(200, {'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...secure});
  createReadStream(file).pipe(res);
});

server.listen(config.port, () => {
  console.log(`Lattice Calendar server on http://localhost:${config.port} -> ${config.lattice.baseUrl}`);
});

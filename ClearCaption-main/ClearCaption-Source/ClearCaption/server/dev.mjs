import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { localDB } from './local-db.mjs';
import { handleAPI } from './api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
export async function startServer({ port = 3000, host = '127.0.0.1', dbPath = path.join(root, '.data/clearcaption.db'), apiKey } = {}) {
  const DB = localDB(dbPath);
  const env = { ...process.env, DB, LOCAL: true, ...(apiKey ? { OPENAI_API_KEY: apiKey } : {}) };
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host}`;
      const url = new URL(incoming.url, origin);
      let response;
      if (url.pathname.startsWith('/api/')) {
        const source = incoming.headers.origin;
        if (source && source !== origin) { outgoing.writeHead(403); outgoing.end(); return; }
        let data = '';
        for await (const chunk of incoming) {
          data += chunk;
          if (data.length > 500000) { outgoing.writeHead(413); outgoing.end(); return; }
        }
        const req = new Request(url, { method: incoming.method, headers: incoming.headers,
          ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: data } : {}) });
        response = await handleAPI(req, env);
      } else {
        const name = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
        const filename = path.resolve(root, 'web', `.${decodeURIComponent(name)}`);
        if (!filename.startsWith(path.join(root, 'web') + path.sep)) throw new Error('Invalid path');
        response = new Response(readFileSync(filename), { headers: {
          'Content-Type': `${types[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8`,
          'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        } });
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(404); outgoing.end('Not found'); }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  return { server, DB, origin: `http://127.0.0.1:${server.address().port}`, setAPIKey: key => { env.OPENAI_API_KEY = key; } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
  const { origin } = await startServer({ port, host: process.env.HOST || '0.0.0.0' });
  console.log(`ClearCaption ready at ${origin}`);
}

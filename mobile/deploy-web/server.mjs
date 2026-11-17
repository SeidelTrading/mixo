import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'site');
const TARGET = process.env.TARGET ?? 'https://web-production-a959d0b7.up.railway.app';
const PROXY = /^\/(api\/|data\/|img\/)/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  try {
    if (PROXY.test(url)) {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const r = await fetch(TARGET + url);
      const h = { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream' };
      const cc = r.headers.get('cache-control'); if (cc) h['cache-control'] = cc;
      res.writeHead(r.status, h).end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const path = normalize(decodeURIComponent(url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, path);
    let ok = false;
    try { ok = (await stat(file)).isFile(); } catch {}
    if (!ok) file = join(ROOT, 'index.html');
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': path.includes('_expo/') ? 'public, max-age=31536000, immutable' : 'no-cache' }).end(body);
  } catch { res.writeHead(502).end('error'); }
}).listen(Number(process.env.PORT ?? 8080), () => console.log('mixo-mobile web up'));

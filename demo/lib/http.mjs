import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { HERE } from './config.mjs';
import { isObj } from './store.mjs';

/* ───────── HTTP ───────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};
export const send = (res, code, obj, headers = {}) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(b);
};
const httpErr = (code, msg) => Object.assign(new Error(msg), { http: code });
// Gövde: yalnız JSON nesnesi kabul edilir (null, dizi, sayı → 400). Boyut aşılırsa fazlası atılır ve 413 dönülür (bağlantı yanıtsız kesilmez).
export const readBody = (req, max = 200e3) =>
  new Promise((ok, no) => {
    let n = 0,
      over = false;
    const ch = [];
    req.on('data', c => {
      if (over) return;
      n += c.length;
      if (n > max) {
        over = true;
        ch.length = 0;
        no(httpErr(413, 'too large'));
      } else ch.push(c);
    });
    req.on('end', () => {
      if (over) return;
      let v;
      try {
        v = ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {};
      } catch {
        return no(httpErr(400, 'bad json'));
      }
      isObj(v) ? ok(v) : no(httpErr(400, 'bad json'));
    });
    req.on('error', no);
  });
// Her yanıta eklenen güvenlik başlıkları. Sayfalarda satır içi betik/stil olduğu için CSP'de 'unsafe-inline' var; yine de yabancı betik,
// yabancı adrese veri gönderimi, çerçeve içinde gösterim ve <base>/<form> kaçırma engellenir.
export const SEC_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};
export function serveStatic(req, res, url) {
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (p === '/') p = '/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
  if (p === '/sunum') {
    res.writeHead(302, { location: '/sunum/' });
    return res.end();
  }
  if (p === '/sunum/') p = '/sunum/index.html';
  if (
    !/^\/(index\.html|app\.js|app\/[\w.-]+\.js|data\/[\w.-]+|img\/(?:fix\/)?[\w.%() -]+|admin\/[\w.-]+|sunum\/(?:img\/)?[\w.-]+)$/.test(
      p,
    )
  ) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const file = path.join(HERE, p);
  if (!file.startsWith(HERE + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  const rs = o => fs.createReadStream(file, o).on('error', () => res.destroy()); // dosya arada silinirse süreç çökmesin
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }
    const h = {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      etag,
      'cache-control': p.startsWith('/img/') ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    if (p.startsWith('/admin/')) h['x-robots-tag'] = 'noindex';
    if (/\.(js|html|json|svg|css)$/.test(file)) h.vary = 'accept-encoding';
    if (/\.(js|html|json|svg|css)$/.test(file) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      h['content-encoding'] = 'gzip';
      res.writeHead(200, h);
      rs().pipe(zlib.createGzip()).pipe(res);
    } else if (file.endsWith('.mp4')) {
      // video: ileri-geri sarma için aralık isteği
      h['accept-ranges'] = 'bytes';
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        let a = m[1] ? +m[1] : st.size - +m[2],
          b = m[1] && m[2] ? +m[2] : st.size - 1;
        a = Math.max(0, a);
        b = Math.min(b, st.size - 1);
        if (a > b) {
          res.writeHead(416, { 'content-range': `bytes */${st.size}` });
          return res.end();
        }
        h['content-range'] = `bytes ${a}-${b}/${st.size}`;
        h['content-length'] = b - a + 1;
        res.writeHead(206, h);
        rs({ start: a, end: b }).pipe(res);
      } else {
        h['content-length'] = st.size;
        res.writeHead(200, h);
        rs().pipe(res);
      }
    } else {
      h['content-length'] = st.size;
      res.writeHead(200, h);
      rs().pipe(res);
    }
  });
}

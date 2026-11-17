// Yalnız web önizlemesi için: canlı demo sunucusu CORS başlığı vermediği için tarayıcıdan okunamaz.
// Bu küçük vekil yalnız GET isteklerini ve yalnız okuma yollarını iletir, CORS başlığı ekler.
// iOS/Android uygulamasında CORS yoktur, vekil gerekmez.  Kullanım: node tools/dev-proxy.mjs
import http from 'node:http';
const TARGET = process.env.TARGET ?? 'https://web-production-a959d0b7.up.railway.app';
const OK = /^\/(api\/config|api\/shop\/(home|product)|data\/[\w.-]+\.js|img\/[\w./-]+)(\?|$)/;
http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method !== 'GET' || !OK.test(req.url ?? '')) { res.writeHead(403).end('nur okuma'); return; }
  try {
    const r = await fetch(TARGET + req.url);
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch { res.writeHead(502).end('vekil hatası'); }
}).listen(Number(process.env.PORT ?? 8098), () => console.log('vekil: http://localhost:8098'));

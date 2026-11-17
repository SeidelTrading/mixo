import { send } from '../lib/http.mjs';
import { FeedError, auditFeed, buildFeed, bulkUpload, lastAudit } from '../services/feed.mjs';

// Feed uçları: GET son rapor (?market=), POST audit | build | bulk. Yetki ve yöntem kapıları handler.mjs'tedir.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404 };
const WRITES = new Set(['audit', 'build', 'bulk']);

export async function adminFeedRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/feed(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (sub && !WRITES.has(sub)) return send(res, 404, { error: 'Uç yok' });
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      const b = body && typeof body === 'object' ? body : {};
      if (sub === 'audit') return send(res, 200, { ok: true, ...auditFeed(b.market, { limit: b.limit }) });
      if (sub === 'build') {
        const xml = buildFeed(b.market, { limit: b.limit });
        // send() JSON yazar; XML için başlık ve gövde doğrudan yazılır.
        res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(xml);
      }
      return send(res, 200, { ok: true, ...(await bulkUpload(b)) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    const market = url.searchParams.get('market');
    if (!market) return send(res, 400, { error: 'market gerekli' });
    // Henüz denetim çalıştırılmamış olması bir hata değil, normal boş durumdur: panel ilk açılışta 404 görmemeli.
    const r = lastAudit(market);
    return send(res, 200, r || { market, audit: null, checked: 0, okCount: 0, problems: [], t: null });
  } catch (e) {
    if (e instanceof FeedError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

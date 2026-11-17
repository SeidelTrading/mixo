import { send } from '../lib/http.mjs';
import { assertShared } from '../services/scope.mjs';
import { FeedError } from '../services/feed.mjs';
import { buildChannel, getConfig, listTargets, rotateToken, setConfig } from '../services/channel-feed.mjs';

// Karşılaştırma sitesi feed'leri (idealo, PriceRunner) yönetim uçları:
//   GET  /api/admin/channel-feed          → ayar + hedef listesi
//   POST /api/admin/channel-feed/config   → ülke ayarı (kur, kargo, ödeme, teslim süresi) — yalnız yönetici
//   POST /api/admin/channel-feed/token    → hedefin erişim anahtarını yeniler, düz anahtar bir kez döner — yalnız yönetici
//   POST /api/admin/channel-feed/build    → feed önizlemesi (platformun göreceği dosyanın aynısı)
// Herkese açık çekme ucu routes/public.mjs içindedir (/api/feeds/<hedef>.<csv|xml>).
const STATUS = { invalid: 400, notfound: 404, notready: 409 };
const WRITES = new Set(['config', 'token', 'build']);

export async function adminChannelFeedRoutes(c) {
  const { req, res, p, body, me } = c;
  const m = /^\/api\/admin\/channel-feed(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (sub && !WRITES.has(sub)) return send(res, 404, { error: 'Uç yok' });
    // Ayar kiracıya bağlı değil (tek satış sitesi): kiracıya bağlı kullanıcı göremez.
    assertShared(me, 'Kanal feed ayarı');
    if (!sub) {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
      return send(res, 200, { config: getConfig(), targets: listTargets() });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
    const b = body && typeof body === 'object' ? body : {};
    if (sub === 'config') return send(res, 200, { ok: true, config: setConfig(b) });
    if (sub === 'token') return send(res, 200, { ok: true, ...rotateToken(b.target) });
    const r = buildChannel(b.target, { limit: b.limit });
    res.writeHead(200, {
      'content-type': r.contentType,
      'cache-control': 'no-store',
      'x-feed-count': String(r.count),
      'x-feed-skipped': JSON.stringify(r.skipped),
    });
    return res.end(r.body);
  } catch (e) {
    if (e instanceof FeedError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

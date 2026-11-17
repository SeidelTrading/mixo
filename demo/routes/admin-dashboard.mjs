import { send } from '../lib/http.mjs';
import {
  DashboardError,
  addSpot,
  consume,
  listSpots,
  listTargets,
  revenue,
  setTarget,
  spotStatus,
  summary,
} from '../services/dashboard.mjs';

// Canlı pano uçları: özet, ciro, günlük hedefler, spot ürünler. Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404 };
const ID_RE = /^[\w-]{1,80}$/;
const WRITES = new Set(['target', 'consume', 'spot']);

const bad = (res, msg) => send(res, 400, { error: msg });

export async function adminDashboardRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/dashboard(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(p);
  if (!m) return;
  const [, sub, id] = m;
  try {
    if (req.method === 'POST') {
      if (!WRITES.has(sub) || id) return send(res, 404, { error: 'Uç yok' });
      if (sub === 'target') return send(res, 200, { ok: true, target: setTarget(body) });
      if (sub === 'consume') return send(res, 200, { ok: true, target: consume(body) });
      const spot = addSpot(body);
      return send(res, 201, { ok: true, spot: spotStatus(spot.id) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const allow = sub && !WRITES.has(sub) ? 'GET, HEAD' : 'GET, HEAD, POST';
      return send(res, 405, { error: 'GET ya da POST bekleniyor' }, { allow });
    }
    if (!sub) return send(res, 200, summary());
    if (sub === 'revenue' && !id) {
      const sp = url.searchParams;
      return send(
        res,
        200,
        revenue({
          from: sp.get('from') ?? undefined,
          to: sp.get('to') ?? undefined,
          groupBy: sp.get('groupBy') ?? undefined,
        }),
      );
    }
    if (sub === 'target' && !id) return send(res, 200, { targets: listTargets() });
    if (sub === 'spot') {
      if (!id) return send(res, 200, { spots: listSpots() });
      if (!ID_RE.test(id)) return bad(res, 'Geçersiz kimlik');
      return send(res, 200, spotStatus(id));
    }
    return send(res, 404, { error: 'Uç yok' });
  } catch (e) {
    if (e instanceof DashboardError)
      return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

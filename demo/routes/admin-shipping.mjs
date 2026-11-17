import { send } from '../lib/http.mjs';
import {
  ShippingError,
  addCarrier,
  chooseCarrier,
  listCarriers,
  recordDelivery,
  selectionLog,
  setCarrier,
  stats,
} from '../services/shipping.mjs';

// Kargo uçları: istatistik, teslim sonucu kaydı, seçim sorgusu, firma ekle/güncelle, seçim günlüğü.
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404 };
const WRITES = new Set(['delivery', 'choose', 'carrier']);

const bad = (res, msg) => send(res, 400, { error: msg });

export async function adminShippingRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/shipping(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'delivery') {
        if (typeof body.carrier !== 'string' || !body.carrier) return bad(res, 'carrier gerekli');
        return send(res, 200, { ok: true, ...recordDelivery(body) });
      }
      if (sub === 'choose') return send(res, 200, { ok: true, ...chooseCarrier(body) });
      // carrier: kimlik varsa güncelle, yoksa ekle
      if (typeof body.id !== 'string' || !body.id) return bad(res, 'id gerekli');
      const id = body.id.trim().toLowerCase();
      const exists = listCarriers().some(x => x.id === id);
      const carrier = exists ? setCarrier(id, body) : addCarrier(body);
      return send(res, exists ? 200 : 201, { ok: true, carrier });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    if (!sub) return send(res, 200, stats());
    if (sub === 'log')
      return send(res, 200, { log: selectionLog(url.searchParams.get('limit') ?? undefined) });
    return send(res, 404, { error: 'Uç yok' });
  } catch (e) {
    if (e instanceof ShippingError)
      return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

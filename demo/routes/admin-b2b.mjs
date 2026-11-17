import { send } from '../lib/http.mjs';
import { assertShared, isSafeKey } from '../services/scope.mjs';
import {
  B2BError,
  addOffer,
  advanceDeal,
  createDeal,
  match,
  quote,
  registerBuyer,
  registerSeller,
  summary,
} from '../services/b2b.mjs';
import { StaffError, performance, recordWork } from '../services/staff.mjs';

// B2B uçları (/api/admin/b2b) ve personel performansı (/api/admin/b2b/staff: yalnız iş çıktısı metrikleri, gözetim yok).
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409 };
const WRITES = new Set(['seller', 'buyer', 'offer', 'match', 'quote', 'deal', 'deal-status']);

// Servis katmanında nesne indeksi olarak kullanılan kimlik alanları (d.offers[offerId] gibi).
// `__proto__` / `constructor` / `prototype` değerleri Object.prototype'ı kirletir (konsey bulgusu #4),
// bu yüzden uç katmanında reddedilir. Servis katmanı düzeltmesi ayrıca yapılmaktadır (b2b.mjs bu işin dışında).
const KEY_FIELDS = ['id', 'offerId', 'buyerId', 'sellerId'];

const bad = (res, msg) => send(res, 400, { error: msg });

// KAPSAM NOTU: B2B kayıtlarında (satıcı, alıcı, teklif, anlaşma) kiracı alanı YOK; kayıtlar VAT numarası gibi
// iş ortağı verisi taşıdığı için okuma uçları kiracıya bağlı kullanıcıya (yönetici dışı) kapatılır.
export async function adminB2bRoutes(c) {
  const { req, res, p, url, body, me } = c;
  const m = /^\/api\/admin\/b2b(?:\/(staff\/(?:performance|work)|[a-z-]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (sub === 'staff/work' || WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      for (const f of KEY_FIELDS)
        if (body?.[f] !== undefined && !isSafeKey(body[f])) return bad(res, `Geçersiz kimlik: ${f}`);
      if (sub === 'seller') return send(res, 201, { ok: true, seller: registerSeller(body) });
      if (sub === 'buyer') return send(res, 201, { ok: true, buyer: registerBuyer(body) });
      if (sub === 'offer') return send(res, 201, { ok: true, offer: addOffer(body) });
      if (sub === 'match') return send(res, 200, { ok: true, matches: match(body) });
      if (sub === 'quote') return send(res, 200, { ok: true, quote: quote(body) });
      if (sub === 'deal') return send(res, 201, { ok: true, deal: createDeal(body) });
      if (sub === 'staff/work') return send(res, 201, { ok: true, record: recordWork(body) });
      // deal-status: { id, status }
      if (typeof body.id !== 'string' || !body.id) return bad(res, 'id gerekli');
      if (typeof body.status !== 'string' || !body.status) return bad(res, 'status gerekli');
      return send(res, 200, { ok: true, deal: advanceDeal(body.id, body.status) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    assertShared(me, 'B2B verisi');
    if (!sub) return send(res, 200, summary());
    if (sub === 'staff/performance') {
      const sp = url.searchParams;
      return send(
        res,
        200,
        performance({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined }),
      );
    }
    return send(res, 404, { error: 'Uç yok' });
  } catch (e) {
    if (e instanceof B2BError || e instanceof StaffError)
      return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

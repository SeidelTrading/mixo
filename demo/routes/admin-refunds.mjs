import { send } from '../lib/http.mjs';
import { assertShared, isSafeKey } from '../services/scope.mjs';
import {
  RefundError,
  getRefund,
  labelSent,
  listRefunds,
  markReceived,
  reject,
  requestRefund,
  settle,
  storno,
} from '../services/refunds.mjs';

// İade uçları: liste, tek kayıt, request, storno, label, received, settle, reject (yazma uçları POST).
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409, limit: 409 };
const ID_RE = /^[\w-]{1,40}$/;
const WRITES = new Set(['request', 'storno', 'label', 'received', 'settle', 'reject']);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);

// KAPSAM NOTU: iade kayıtlarında kiracı alanı YOK; kayıtlar fatura ve müşteri verisi taşıdığı için okuma uçları
// kiracıya bağlı kullanıcıya (yönetici dışı) kapatılır. settle + approve:true ayrıca handler.mjs'teki
// ADMIN_ONLY tablosuyla yöneticiye kısıtlıdır; dört göz kuralı services/refunds.mjs içindedir.
export async function adminRefundRoutes(c) {
  const { req, res, p, url, body, me } = c;
  const m = /^\/api\/admin\/refunds(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  // Oturumdaki panel kullanıcısı: lib/auth.mjs users tablosundan gelir, alan adı `username`.
  const by = typeof me?.username === 'string' ? me.username : undefined;
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'request') {
        const err = needStr(body.orderId, 'orderId');
        if (err) return bad(res, err);
        // Talep eden oturumdan yazılır (dört göz kuralının dayanağı); gövdeden isim kabul edilmez.
        return send(res, 201, { ok: true, refund: requestRefund(body, { by }) });
      }
      const err = needStr(body.refundId, 'refundId');
      if (err) return bad(res, err);
      // `d.refunds[refundId]` nesne indeksidir: __proto__ gibi anahtarlar reddedilir (konsey bulgusu #4/#6).
      if (!isSafeKey(body.refundId)) return bad(res, 'Geçersiz kimlik');
      if (sub === 'storno') return send(res, 200, { ok: true, invoice: storno(body.refundId) });
      if (sub === 'label') {
        const e2 = needStr(body.trackingNo, 'trackingNo');
        if (e2) return bad(res, e2);
        return send(res, 200, { ok: true, refund: labelSent(body.refundId, body.trackingNo, { by }) });
      }
      if (sub === 'received')
        return send(res, 200, { ok: true, refund: markReceived(body.refundId, { by }) });
      if (sub === 'reject') return send(res, 200, { ok: true, refund: reject(body.refundId, { by }) });
      // settle: onaylayanın adı YALNIZ oturumdan gelir; gövde yalnız onay istendiğini bildirir (approve: true).
      // Oturumda kullanıcı adı yoksa onay üretilmez (eskiden 'yönetici' varsayılanı yazılıyordu).
      const approvedBy = body.approve === true ? by : undefined;
      return send(res, 200, { ok: true, ...settle(body.refundId, { approvedBy, provider: body.provider }) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    assertShared(me, 'İade');
    if (!sub)
      return send(res, 200, {
        refunds: listRefunds({ status: url.searchParams.get('status') || undefined }),
      });
    if (!ID_RE.test(sub) || !isSafeKey(sub)) return bad(res, 'Geçersiz kimlik');
    const r = getRefund(sub);
    return r ? send(res, 200, r) : send(res, 404, { error: 'İade yok' });
  } catch (e) {
    if (e instanceof RefundError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

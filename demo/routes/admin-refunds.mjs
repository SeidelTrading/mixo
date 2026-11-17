import { send } from '../lib/http.mjs';
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
        return send(res, 201, { ok: true, refund: requestRefund(body) });
      }
      const err = needStr(body.refundId, 'refundId');
      if (err) return bad(res, err);
      if (sub === 'storno') return send(res, 200, { ok: true, invoice: storno(body.refundId) });
      if (sub === 'label') {
        const e2 = needStr(body.trackingNo, 'trackingNo');
        if (e2) return bad(res, e2);
        return send(res, 200, { ok: true, refund: labelSent(body.refundId, body.trackingNo, { by }) });
      }
      if (sub === 'received')
        return send(res, 200, { ok: true, refund: markReceived(body.refundId, { by }) });
      if (sub === 'reject') return send(res, 200, { ok: true, refund: reject(body.refundId, { by }) });
      // settle: onay yalnız oturumdaki kullanıcıdan gelir; gövdedeki approvedBy yalnız onay istendiğini bildirir (bool).
      const approvedBy = body.approve === true ? by || 'yönetici' : undefined;
      return send(res, 200, { ok: true, ...settle(body.refundId, { approvedBy, provider: body.provider }) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    if (!sub)
      return send(res, 200, {
        refunds: listRefunds({ status: url.searchParams.get('status') || undefined }),
      });
    if (!ID_RE.test(sub)) return bad(res, 'Geçersiz kimlik');
    const r = getRefund(sub);
    return r ? send(res, 200, r) : send(res, 404, { error: 'İade yok' });
  } catch (e) {
    if (e instanceof RefundError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

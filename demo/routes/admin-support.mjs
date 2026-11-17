import { send } from '../lib/http.mjs';
import {
  SupportError,
  alerts,
  autoReply,
  complaintReport,
  customerReply,
  getTicket,
  intake,
  listTickets,
  recordComplaint,
} from '../services/support.mjs';

// Destek uçları: ticket listesi/tek ticket, intake, reply (otomatik cevap), customer (müşteri cevabı), complaint, report, alerts.
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409 };
const ID_RE = /^[\w-]{1,40}$/;
const WRITES = new Set(['intake', 'reply', 'customer', 'complaint']);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);

export async function adminSupportRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/support(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'intake') {
        const err = needStr(body.from, 'from');
        if (err) return bad(res, err);
        return send(res, 201, { ok: true, ticket: intake(body) });
      }
      if (sub === 'complaint') {
        const err = needStr(body.poolId, 'poolId');
        if (err) return bad(res, err);
        return send(res, 201, { ok: true, complaint: recordComplaint(body) });
      }
      const err = needStr(body.ticketId, 'ticketId');
      if (err) return bad(res, err);
      if (sub === 'reply') return send(res, 200, { ok: true, ticket: autoReply(body.ticketId) });
      const e2 = needStr(body.text, 'text');
      if (e2) return bad(res, e2);
      return send(res, 200, { ok: true, ticket: customerReply(body.ticketId, body.text) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    const sp = url.searchParams;
    if (sub === 'alerts') return send(res, 200, { alerts: alerts() });
    if (sub === 'report')
      return send(res, 200, { report: complaintReport({ minCount: sp.get('minCount') ?? undefined }) });
    if (!sub)
      return send(res, 200, {
        tickets: listTickets({ status: sp.get('status') || undefined, kind: sp.get('kind') || undefined }),
      });
    if (!ID_RE.test(sub)) return bad(res, 'Geçersiz kimlik');
    const t = getTicket(sub);
    return t ? send(res, 200, t) : send(res, 404, { error: 'Ticket yok' });
  } catch (e) {
    if (e instanceof SupportError)
      return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

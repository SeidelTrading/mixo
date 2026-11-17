import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { recordSet, moveDocRows } from './records.mjs';
import { orders } from './orders.mjs';

// İade akışı (K-13 storno faturası, K-14 iade etiketi takibi ve otomatik para iadesi). HTTP bilmez.
// DİKKAT: Mollie/PayPal çağrısı SİMÜLASYONDUR; gerçek ödeme çağrısı yapılmaz. settle() yalnız kayıt üretir ({ id, provider, amount, simulated: true }).
// Durum akışı: requested → label_sent → received → refunded; ayrıca rejected ve pending_approval. Geçerli geçişler TRANSITIONS tablosundadır.

// KDV oranı tek yerde: Almanya normal oranı %19. Fiyatlar brüt (KDV dahil) kabul edilir; net = brüt / 1,19.
export const VAT_RATE = 0.19;
// Bu tutarın (€) üstündeki iadeler insan onayı ister. Sunumda sayı verilmediği için 200 € bir VARSAYIMDIR; REFUND_APPROVAL_THRESHOLD ile ayarlanır.
export const APPROVAL_THRESHOLD = Number(process.env.REFUND_APPROVAL_THRESHOLD) || 200;

export const STATES = ['requested', 'label_sent', 'received', 'pending_approval', 'refunded', 'rejected'];
export const TRANSITIONS = {
  requested: ['label_sent', 'rejected'],
  label_sent: ['received', 'rejected'],
  received: ['refunded', 'pending_approval', 'rejected'],
  pending_approval: ['refunded', 'rejected'],
  refunded: [],
  rejected: [],
};
const CLOSED = new Set(['refunded', 'rejected']); // bu durumlarda kalem için "açık iade" sayılmaz (refunded miktar olarak ayrıca düşülür)

// Hata türleri: invalid (girdi / geçersiz geçiş), notfound, conflict (açık iade, tutar uyuşmazlığı, sıra), limit. Yönlendirme katmanı HTTP koduna çevirir.
export class RefundError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new RefundError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cents = n => Math.round(Number(n) * 100);
const money = c => c / 100;
const clone = o => (o ? structuredClone(o) : o);

// Depolama (satır tablosu katmanı, services/records.mjs): iade kayıtları, olay günlüğü, ödeme kayıtları ve
// simüle postalar BÜYÜYEN koleksiyonlardır; belgede durmaları her yazmada tüm belgeyi yeniden yazdırıyordu
// (5.000 iadede ≈ 5 MB, ≈ 130 ms olay döngüsü bloğu). Artık yalnız değişen satır yazılır.
// Belgede (store.doc('refunds')) yalnız küçük sayaç kalır: seq = { yıl: son storno sırası }.
// Satırlar: refunds (id = iade kimliği, t = created), refund_orders (id = sipariş kimliği, { ids } — sipariş
// başına iade araması için; tüm iadeleri taramamak adına), refund_events, refund_payments (id = 'pay_'+iade), refund_mails.
// Çok adımlı oku-değiştir-yaz dizileri store.tx içindedir; satır yazmaları aynı işleme katılır.
const refundRows = recordSet('refunds'),
  orderIdx = recordSet('refund_orders'),
  eventRows = recordSet('refund_events'),
  payRows = recordSet('refund_payments'),
  mailRows = recordSet('refund_mails');
// TAVAN POLİTİKASI: iade kayıtları, storno faturaları (kayıt içinde), ödeme kayıtları ve sipariş dizini MALİ
// KAYITTIR; hiçbir koşulda silinmez, tavan yok. Yalnız yardımcı koleksiyonlara tavan var: olay günlüğü
// (iade başına en çok ~6 olay; 50.000 ≈ 8.000 iadelik geçmiş) ve simüle posta kutusu (eskiden de 1000'di).
const MAX_EVENTS = 50000,
  MAX_MAILS = 1000;
const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12); // 48 bit: 50.000 satırda çakışma olasılığı ihmal edilebilir

// Satır `t` sütunu yalnız sıralama anahtarıdır; dışarı dönen kayıtlarda eski şekli korumak için atılır.
const noT = ({ t: _t, ...r }) => r;
const noId = ({ id: _i, ...r }) => r;
const getR = id => {
  const r = refundRows.get(id);
  return r ? noT(r) : null;
};
const putR = r => refundRows.put({ ...r, t: r.created });
// Tek iade için okuma-değiştirme-yazma; fn(r) kaydı değiştirir, çağıran aynı işlemde çalışır.
const run = fn => store.tx(fn);

const need = id => getR(id) || fail('notfound', 'İade yok');

// Durum geçişi + olay satırı. Çağıran save(r) ile kaydı yazar (aynı işlemde).
function move(r, to, by) {
  if (!TRANSITIONS[r.status]?.includes(to)) fail('invalid', `Geçersiz durum geçişi: ${r.status} → ${to}`);
  addEvent({ t: Date.now(), refundId: r.id, from: r.status, to, by: by || 'sistem' });
  r.status = to;
  r.updated = Date.now();
}
function addEvent(e) {
  eventRows.put({ id: newId(), ...e });
  eventRows.prune(MAX_EVENTS);
}

// Simüle e-posta (marketing/consent.mjs simMail deseni); gerçek gönderim yok, kayıt satır olarak durur.
function simMail({ kind, to, subject, body }) {
  mailRows.put({
    id: crypto.randomUUID().slice(0, 8),
    t: Date.now(),
    key: kind,
    to,
    subject,
    body,
    simulated: true,
  });
  mailRows.prune(MAX_MAILS);
}

// Eski kurulum: iadeler tek belgedeydi. Modül yüklenirken BİR KEZ satırlara taşınır (store.tx dışında:
// putMany kendi işlemini açar). Sıra önemli: sipariş dizini iadelerden türetilir, bu yüzden iade belgeden
// silinmeden (strip) ÖNCE çalışmalı; iade taşıması en sonda.
moveDocRows('refund_orders', 'refunds', {
  rows: d => {
    const by = new Map();
    for (const [k, r] of Object.entries(d.refunds || {})) {
      const oid = String(r?.orderId ?? '');
      if (!oid) continue;
      if (!by.has(oid)) by.set(oid, []);
      by.get(oid).push(r.id ?? k);
    }
    return [...by].map(([id, ids]) => ({ id, ids }));
  },
  strip: () => {}, // dizin türetilmiştir; iade verisi son adımda silinir
});
moveDocRows('refund_events', 'refunds', {
  rows: d => (d.events || []).map(e => ({ id: newId(), ...e })),
  strip: d => delete d.events,
});
moveDocRows('refund_payments', 'refunds', {
  rows: d => Object.entries(d.payments || {}).map(([k, p]) => ({ ...p, id: p.id ?? 'pay_' + k })),
  strip: d => delete d.payments,
});
moveDocRows('refund_mails', 'refunds', {
  rows: d => (d.mails || []).map(m => ({ ...m, id: m.id ?? newId() })),
  strip: d => delete d.mails,
});
moveDocRows('refunds', 'refunds', {
  rows: d =>
    Object.entries(d.refunds || {}).map(([k, r]) => ({ ...r, id: r.id ?? k, t: r.created ?? Date.now() })),
  strip: d => delete d.refunds,
});

// requestRefund({ orderId, items: [{id, qty}], reason }, { by }) → iade kaydı
// `by` TALEP EDEN panel kullanıcısıdır ve yalnız oturumdan gelir (gövdeden asla okunmaz); dört göz kuralı
// için kayda `requestedBy` olarak yazılır: aynı kişi settle() ile kendi talebini onaylayamaz.
/** @param {any} input @param {{ by?: string }} [o2] */
export function requestRefund(input, { by } = {}) {
  const o = input && typeof input === 'object' ? input : {};
  const requestedBy = str(by, 80) || null;
  const orderId = str(o.orderId, 40),
    reason = str(o.reason, 500);
  if (!orderId) fail('invalid', 'orderId gerekli');
  if (!Array.isArray(o.items) || !o.items.length) fail('invalid', 'items gerekli');
  const order = orders.find(x => x.id === orderId);
  if (!order) fail('notfound', 'Sipariş yok');
  return run(() => {
    const idx = orderIdx.get(orderId);
    const prev = Array.isArray(idx?.ids) ? idx.ids : [];
    const mine = prev.map(getR).filter(r => r && r.status !== 'rejected');
    const lines = new Map();
    for (const it of o.items) {
      const id = str(it?.id, 80),
        qty = Math.floor(Number(it?.qty));
      if (!id || !(qty >= 1)) fail('invalid', 'Geçersiz kalem');
      if (lines.has(id)) fail('invalid', `Kalem tekrarlanmış: ${id}`);
      const oi = order.items.find(x => x.id === id);
      if (!oi) fail('invalid', `Kalem siparişte yok: ${id}`);
      const open = mine.find(r => !CLOSED.has(r.status) && r.lines.some(l => l.id === id));
      if (open) fail('conflict', `Bu kalem için açık iade var: ${open.id}`);
      const done = mine
        .filter(r => r.status === 'refunded')
        .reduce((a, r) => a + (r.lines.find(l => l.id === id)?.qty || 0), 0);
      if (done + qty > oi.qty) fail('limit', `İade miktarı siparişi aşıyor: ${id}`);
      lines.set(id, { id, title: oi.title, qty, price: oi.price });
    }
    const list = [...lines.values()];
    const now = Date.now();
    const r = {
      id: 'rf_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
      orderId,
      status: 'requested',
      lines: list,
      amount: money(list.reduce((a, l) => a + cents(l.price) * l.qty, 0)),
      reason,
      tracking: null,
      invoiceNo: null,
      invoice: null,
      approvedBy: null,
      requestedBy,
      created: now,
      updated: now,
    };
    putR(r);
    orderIdx.put({ id: orderId, ids: [...prev, r.id] });
    addEvent({ t: now, refundId: r.id, from: null, to: 'requested', by: requestedBy || 'müşteri' });
    return clone(r);
  });
}

// storno(refundId) → storno faturası. ST-<yıl>-<sıra>; sıra yıl başına 1'den artar, atlanmaz ve tekrar etmez.
// İkinci çağrı mevcut faturayı döndürür (yeni numara yok). Reddedilmiş iadeye fatura kesilmez.
// NUMARA BÜTÜNLÜĞÜ: sayaç belgede (küçük, atomik artış), fatura iade satırında durur; ikisi AYNI store.tx
// içinde yazılır. Süreç ortada ölürse işlem geri alınır: ne numara kaybolur ne de iki kez verilir.
export function storno(refundId) {
  return run(() => {
    const r = need(refundId);
    if (r.invoice) return clone(r.invoice);
    if (r.status === 'rejected') fail('invalid', 'Reddedilmiş iade için storno kesilemez');
    const t = Date.now(),
      year = new Date(t).getFullYear();
    /** @type {any} */
    const d = store.doc('refunds', null) || {};
    if (!d.seq || typeof d.seq !== 'object') d.seq = {};
    const n = (d.seq[year] || 0) + 1;
    d.seq[year] = n;
    store.saveDoc('refunds', d);
    const lines = r.lines.map(l => ({ title: l.title, qty: l.qty, price: l.price }));
    const grossC = r.lines.reduce((a, l) => a + cents(l.price) * l.qty, 0);
    const netC = Math.round(grossC / (1 + VAT_RATE));
    const inv = {
      no: `ST-${year}-${String(n).padStart(5, '0')}`,
      t,
      orderId: r.orderId,
      lines,
      net: money(netC),
      vat: money(grossC - netC),
      gross: money(grossC),
    };
    r.invoice = inv;
    r.invoiceNo = inv.no;
    r.updated = t;
    putR(r);
    const order = orders.find(x => x.id === r.orderId);
    if (order?.customer?.email)
      simMail({
        kind: `storno:${inv.no}`,
        to: order.customer.email,
        subject: `Stornorechnung ${inv.no}`,
        body: `Hallo${order.customer.name ? ' ' + order.customer.name : ''},\n\nzu Ihrer Bestellung ${r.orderId} haben wir die Stornorechnung ${inv.no} über ${inv.gross.toFixed(2)} EUR (brutto) erstellt.`,
      });
    return clone(inv);
  });
}

/** @param {string} refundId @param {string} trackingNo @param {{ by?: string }} [o] */
export function labelSent(refundId, trackingNo, { by } = {}) {
  const tr = str(trackingNo, 60);
  if (!tr) fail('invalid', 'trackingNo gerekli');
  return run(() => {
    const r = need(refundId);
    move(r, 'label_sent', by);
    r.tracking = tr;
    putR(r);
    return clone(r);
  });
}

/** @param {string} refundId @param {{ by?: string }} [o] */
export function markReceived(refundId, { by } = {}) {
  return run(() => {
    const r = need(refundId);
    move(r, 'received', by);
    putR(r);
    return clone(r);
  });
}

/** @param {string} refundId @param {{ by?: string }} [o] */
export function reject(refundId, { by } = {}) {
  return run(() => {
    const r = need(refundId);
    move(r, 'rejected', by);
    putR(r);
    return clone(r);
  });
}

// settle(refundId, { approvedBy, provider }) → { refund, payment, duplicate }
// Yalnız received (ya da onay bekleyen) iade ödenir. Ödeme kaydı iade kimliğine bağlıdır (id = 'pay_'+iade;
// satır birincil anahtarı): çift ödeme yapısal olarak imkânsızdır. Durum denetimi, ödeme satırı ve iade
// güncellemesi tek store.tx içindedir.
/** @param {string} refundId @param {{ approvedBy?: string, provider?: string }} [o] */
export function settle(refundId, { approvedBy, provider } = {}) {
  const by = str(approvedBy, 80);
  const prov = provider === 'paypal' ? 'paypal' : 'mollie';
  return run(() => {
    const r = need(refundId);
    if (r.status === 'refunded')
      return { refund: clone(r), payment: payRows.get('pay_' + r.id), duplicate: true };
    if (r.status !== 'received' && r.status !== 'pending_approval')
      fail('invalid', `Ödeme için durum received olmalı (şu an: ${r.status})`);
    if (!r.invoice) fail('conflict', 'Önce storno faturası üretilmeli');
    if (cents(r.amount) !== cents(r.invoice.gross))
      fail('conflict', `İade tutarı (${r.amount}) storno brüt tutarıyla (${r.invoice.gross}) eşleşmiyor`);
    if (cents(r.amount) > cents(APPROVAL_THRESHOLD) && !by) {
      if (r.status === 'received') {
        move(r, 'pending_approval', 'sistem');
        putR(r);
      }
      return { refund: clone(r), payment: null, duplicate: false };
    }
    // Dört göz kuralı: iadeyi talep eden kişi kendi talebini onaylayamaz (onaylayan oturumdan gelir).
    if (by && r.requestedBy && by === r.requestedBy)
      fail('conflict', 'Dört göz kuralı: iadeyi talep eden kişi kendi onaylayamaz');
    if (by) r.approvedBy = by;
    move(r, 'refunded', by || 'sistem');
    const pay = payRows.put({
      id: 'pay_' + r.id,
      refundId: r.id,
      provider: prov,
      amount: r.invoice.gross,
      currency: 'EUR',
      t: Date.now(),
      simulated: true,
    });
    r.paymentId = pay.id;
    putR(r);
    return { refund: clone(r), payment: clone(pay), duplicate: false };
  });
}

/** @param {{ status?: string }} [o] */
export function listRefunds({ status } = {}) {
  return refundRows
    .all({ desc: true })
    .filter(r => !status || r.status === status)
    .map(noT);
}
export const getRefund = id => clone(getR(id));
export const refundEvents = refundId =>
  eventRows
    .all()
    .filter(e => !refundId || e.refundId === refundId)
    .map(noId);
export const refundPayment = refundId => payRows.get('pay_' + refundId);
export const refundMails = () => mailRows.all();

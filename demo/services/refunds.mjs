import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
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

// Tek belge: { refunds: {id: kayıt}, seq: {yıl: son sıra}, events: [], payments: {refundId: ödeme}, mails: [] }.
// Çok adımlı değişiklikler store.tx içinde, tek okuma + tek yazma ile yapılır; sıra ve ödeme kaydı iade ile birlikte atomik yazılır.
/** @returns {{ refunds: Record<string, any>, seq: Record<string, number>, events: any[], payments: Record<string, any>, mails: any[] }} */
const load = () => {
  /** @type {any} */
  const d = store.doc('refunds', null) || {};
  return {
    refunds: d.refunds || {},
    seq: d.seq || {},
    events: d.events || [],
    payments: d.payments || {},
    mails: d.mails || [],
  };
};
const save = d => store.saveDoc('refunds', d);
const run = fn =>
  store.tx(() => {
    const d = load();
    const r = fn(d);
    save(d);
    return r;
  });

const need = (d, id) => d.refunds[id] || fail('notfound', 'İade yok');

function move(d, r, to, by) {
  if (!TRANSITIONS[r.status]?.includes(to)) fail('invalid', `Geçersiz durum geçişi: ${r.status} → ${to}`);
  d.events.push({ t: Date.now(), refundId: r.id, from: r.status, to, by: by || 'sistem' });
  r.status = to;
  r.updated = Date.now();
}

// Simüle e-posta (marketing/consent.mjs simMail deseni); gerçek gönderim yok, kayıt belgede durur.
function simMail(d, { kind, to, subject, body }) {
  d.mails.push({
    id: crypto.randomUUID().slice(0, 8),
    t: Date.now(),
    key: kind,
    to,
    subject,
    body,
    simulated: true,
  });
  if (d.mails.length > 1000) d.mails.splice(0, d.mails.length - 1000);
}

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
  return run(d => {
    const lines = new Map();
    for (const it of o.items) {
      const id = str(it?.id, 80),
        qty = Math.floor(Number(it?.qty));
      if (!id || !(qty >= 1)) fail('invalid', 'Geçersiz kalem');
      if (lines.has(id)) fail('invalid', `Kalem tekrarlanmış: ${id}`);
      const oi = order.items.find(x => x.id === id);
      if (!oi) fail('invalid', `Kalem siparişte yok: ${id}`);
      const mine = Object.values(d.refunds).filter(r => r.orderId === orderId && r.status !== 'rejected');
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
    d.refunds[r.id] = r;
    d.events.push({ t: now, refundId: r.id, from: null, to: 'requested', by: requestedBy || 'müşteri' });
    return clone(r);
  });
}

// storno(refundId) → storno faturası. ST-<yıl>-<sıra>; sıra yıl başına 1'den artar, atlanmaz ve tekrar etmez.
// İkinci çağrı mevcut faturayı döndürür (yeni numara yok). Reddedilmiş iadeye fatura kesilmez.
export function storno(refundId) {
  return run(d => {
    const r = need(d, refundId);
    if (r.invoice) return clone(r.invoice);
    if (r.status === 'rejected') fail('invalid', 'Reddedilmiş iade için storno kesilemez');
    const t = Date.now(),
      year = new Date(t).getFullYear();
    const n = (d.seq[year] || 0) + 1;
    d.seq[year] = n;
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
    const order = orders.find(x => x.id === r.orderId);
    if (order?.customer?.email)
      simMail(d, {
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
  return run(d => {
    const r = need(d, refundId);
    move(d, r, 'label_sent', by);
    r.tracking = tr;
    return clone(r);
  });
}

/** @param {string} refundId @param {{ by?: string }} [o] */
export function markReceived(refundId, { by } = {}) {
  return run(d => {
    const r = need(d, refundId);
    move(d, r, 'received', by);
    return clone(r);
  });
}

/** @param {string} refundId @param {{ by?: string }} [o] */
export function reject(refundId, { by } = {}) {
  return run(d => {
    const r = need(d, refundId);
    move(d, r, 'rejected', by);
    return clone(r);
  });
}

// settle(refundId, { approvedBy, provider }) → { refund, payment, duplicate }
// Yalnız received (ya da onay bekleyen) iade ödenir. Ödeme kaydı iade kimliğine bağlıdır (tek kayıt): çift ödeme yapısal olarak imkânsızdır.
/** @param {string} refundId @param {{ approvedBy?: string, provider?: string }} [o] */
export function settle(refundId, { approvedBy, provider } = {}) {
  const by = str(approvedBy, 80);
  const prov = provider === 'paypal' ? 'paypal' : 'mollie';
  return run(d => {
    const r = need(d, refundId);
    if (r.status === 'refunded')
      return { refund: clone(r), payment: clone(d.payments[r.id]), duplicate: true };
    if (r.status !== 'received' && r.status !== 'pending_approval')
      fail('invalid', `Ödeme için durum received olmalı (şu an: ${r.status})`);
    if (!r.invoice) fail('conflict', 'Önce storno faturası üretilmeli');
    if (cents(r.amount) !== cents(r.invoice.gross))
      fail('conflict', `İade tutarı (${r.amount}) storno brüt tutarıyla (${r.invoice.gross}) eşleşmiyor`);
    if (cents(r.amount) > cents(APPROVAL_THRESHOLD) && !by) {
      if (r.status === 'received') move(d, r, 'pending_approval', 'sistem');
      return { refund: clone(r), payment: null, duplicate: false };
    }
    // Dört göz kuralı: iadeyi talep eden kişi kendi talebini onaylayamaz (onaylayan oturumdan gelir).
    if (by && r.requestedBy && by === r.requestedBy)
      fail('conflict', 'Dört göz kuralı: iadeyi talep eden kişi kendi onaylayamaz');
    if (by) r.approvedBy = by;
    move(d, r, 'refunded', by || 'sistem');
    const pay = {
      id: 'pay_' + r.id,
      refundId: r.id,
      provider: prov,
      amount: r.invoice.gross,
      currency: 'EUR',
      t: Date.now(),
      simulated: true,
    };
    d.payments[r.id] = pay;
    r.paymentId = pay.id;
    return { refund: clone(r), payment: clone(pay), duplicate: false };
  });
}

/** @param {{ status?: string }} [o] */
export function listRefunds({ status } = {}) {
  const all = Object.values(load().refunds).sort((a, b) => b.created - a.created);
  return all.filter(r => !status || r.status === status).map(clone);
}
export const getRefund = id => clone(load().refunds[id] || null);
export const refundEvents = refundId => load().events.filter(e => !refundId || e.refundId === refundId);
export const refundPayment = refundId => clone(load().payments[refundId] || null);
export const refundMails = () => load().mails.map(clone);

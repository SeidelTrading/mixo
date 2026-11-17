// İade servisi birim testleri (node:test). Geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit-refunds.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const ord = await import('../services/orders.mjs');
const { P } = await import('../services/catalog.mjs');
const rf = await import('../services/refunds.mjs');
const { store } = await import('../lib/store.mjs');
const { recordSet } = await import('../services/records.mjs');

test.after(() => {
  store.close?.();
});

const cust = {
  name: 'Erika Muster',
  email: 'erika@example.com',
  street: 'Hauptstr. 1',
  zip: '10115',
  city: 'Berlin',
};
// Katalogdan ilk uygun ürün: tek adedi eşiğin altında, 20 adedi eşiğin üstünde kalacak fiyat aralığı.
const pid = [...P.values()].find(p => p.price >= 20 && p.price <= 150).id;
let seq = 0;
function mkOrder(qty = 1) {
  const r = ord.createOrder({
    items: [{ id: pid, qty }],
    customer: { ...cust, email: `e${++seq}@example.com` },
  });
  assert.ok(r.order, r.err);
  return r.order;
}
const req = (order, qty = 1) =>
  rf.requestRefund({ orderId: order.id, items: [{ id: pid, qty }], reason: 'test' });
function toReceived(r) {
  rf.storno(r.id);
  rf.labelSent(r.id, 'TRK123');
  return rf.markReceived(r.id);
}
const codeOf = fn => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('storno: numara tekrar etmez, ikinci çağrı aynı faturayı döndürür', () => {
  const a = req(mkOrder()),
    b = req(mkOrder());
  const i1 = rf.storno(a.id),
    i2 = rf.storno(b.id),
    i1b = rf.storno(a.id);
  assert.match(i1.no, /^ST-\d{4}-\d{5}$/);
  assert.notEqual(i1.no, i2.no);
  assert.equal(i1b.no, i1.no);
  const n = x => Number(x.no.split('-')[2]);
  assert.equal(n(i2), n(i1) + 1);
  assert.equal(i1.gross, Math.round((i1.net + i1.vat) * 100) / 100);
});

test('geçersiz durum geçişi reddedilir', () => {
  const r = req(mkOrder());
  assert.equal(
    codeOf(() => rf.markReceived(r.id)),
    'invalid',
  );
  assert.equal(
    codeOf(() => rf.settle(r.id)),
    'invalid',
  );
  assert.equal(rf.getRefund(r.id).status, 'requested');
  assert.equal(
    codeOf(() => rf.requestRefund({ orderId: 'yok', items: [{ id: pid, qty: 1 }] })),
    'notfound',
  );
});

test('aynı kalem için açık iade conflict verir', () => {
  const o = mkOrder(2);
  req(o);
  assert.equal(
    codeOf(() => req(o)),
    'conflict',
  );
});

test('settle idempotent: iki çağrı tek ödeme', () => {
  const r = toReceived(req(mkOrder()));
  const a = rf.settle(r.id),
    b = rf.settle(r.id);
  assert.equal(a.refund.status, 'refunded');
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.payment.id, a.payment.id);
  assert.equal(a.payment.amount, rf.getRefund(r.id).invoice.gross);
  assert.equal(rf.refundEvents(r.id).filter(e => e.to === 'refunded').length, 1);
});

test('tutar uyuşmazlığında conflict, ödeme yok', () => {
  const r = toReceived(req(mkOrder()));
  const rows = recordSet('refunds');
  const row = rows.get(r.id);
  rows.put({ ...row, amount: row.amount + 1 });
  assert.equal(
    codeOf(() => rf.settle(r.id)),
    'conflict',
  );
  assert.equal(rf.refundPayment(r.id), null);
  assert.equal(rf.getRefund(r.id).status, 'received');
});

test('eşik üstü: onaysız pending_approval, onaylıyken ödeme', () => {
  const o = mkOrder(Math.min(20, Math.floor(rf.APPROVAL_THRESHOLD / P.get(pid).price) + 1));
  const r = toReceived(req(o, o.items[0].qty));
  assert.ok(r.amount > rf.APPROVAL_THRESHOLD, 'test siparişi eşiği aşmalı');
  const a = rf.settle(r.id);
  assert.equal(a.refund.status, 'pending_approval');
  assert.equal(a.payment, null);
  assert.equal(rf.refundPayment(r.id), null);
  const b = rf.settle(r.id);
  assert.equal(b.refund.status, 'pending_approval');
  const c = rf.settle(r.id, { approvedBy: 'yonetici' });
  assert.equal(c.refund.status, 'refunded');
  assert.equal(c.refund.approvedBy, 'yonetici');
  assert.ok(c.payment);
});

test('settle: ödeme satırı iade kimliğine bağlı, iki çağrıda tek satır, ödeme sayısı 1', () => {
  const before = recordSet('refund_payments').count();
  const r = toReceived(req(mkOrder()));
  rf.settle(r.id);
  rf.settle(r.id);
  rf.settle(r.id);
  assert.equal(recordSet('refund_payments').count(), before + 1);
  assert.equal(rf.refundPayment(r.id).id, 'pay_' + r.id);
});

test('dört göz kuralı: talep eden kendi iadesini onaylayamaz, başkası onaylar', () => {
  const o = mkOrder();
  const r0 = rf.requestRefund({ orderId: o.id, items: [{ id: pid, qty: 1 }] }, { by: 'ayse' });
  const r = toReceived(r0);
  assert.equal(
    codeOf(() => rf.settle(r.id, { approvedBy: 'ayse' })),
    'conflict',
  );
  assert.equal(rf.getRefund(r.id).status, 'received');
  assert.equal(rf.refundPayment(r.id), null);
  const ok = rf.settle(r.id, { approvedBy: 'mehmet' });
  assert.equal(ok.refund.status, 'refunded');
  assert.equal(ok.refund.approvedBy, 'mehmet');
});

test('iade verisi belgede kalmaz; belgede yalnız sayaç vardır; dönen kayıtta t alanı yok', () => {
  const r = req(mkOrder());
  const d = store.doc('refunds', {});
  for (const k of ['refunds', 'events', 'payments', 'mails'])
    assert.equal(k in d, false, `belgede ${k} kalmamalı`);
  assert.ok(d.seq, 'storno sayacı belgede');
  assert.equal('t' in rf.getRefund(r.id), false);
  assert.equal('id' in rf.refundEvents(r.id)[0], false);
});

test('storno numarası 1.000 ardışık çağrıda tekrar etmez ve atlamaz', () => {
  const year = new Date().getFullYear();
  const start = store.doc('refunds', {}).seq?.[year] || 0;
  const rows = recordSet('refunds');
  const ids = [];
  rows.putMany(
    Array.from({ length: 1000 }, (_, i) => {
      const id = `rf_seq${String(i).padStart(4, '0')}`;
      ids.push(id);
      return {
        id,
        orderId: 'seq-' + i,
        status: 'received',
        lines: [{ id: 'x', title: 'X', qty: 1, price: 10 }],
        amount: 10,
        reason: '',
        invoice: null,
        created: Date.now(),
        updated: Date.now(),
      };
    }),
  );
  const nos = ids.map(id => rf.storno(id).no);
  assert.equal(new Set(nos).size, 1000);
  nos.forEach((no, i) => assert.equal(no, `ST-${year}-${String(start + i + 1).padStart(5, '0')}`));
  assert.equal(store.doc('refunds', {}).seq[year], start + 1000);
});

test('storno işlemi yarıda patlarsa numara kaybolmaz ve kayıt yazılmaz (tx geri alınır)', () => {
  const year = new Date().getFullYear();
  const r = req(mkOrder());
  const before = store.doc('refunds', {}).seq?.[year] || 0;
  // Sayaç ve iade satırı yazıldıktan SONRA (posta yazılırken) hata: tek işlem olduğu için hepsi geri alınmalı.
  const orig = store.recs.put;
  store.recs.put = (kind, rec) => {
    if (kind === 'refund_mails') throw new Error('süreç öldü (simülasyon)');
    return orig(kind, rec);
  };
  try {
    assert.throws(() => rf.storno(r.id), /süreç öldü/);
  } finally {
    store.recs.put = orig;
  }
  assert.equal(store.doc('refunds', {}).seq?.[year] || 0, before);
  assert.equal(rf.getRefund(r.id).invoice, null);
  assert.equal(rf.storno(r.id).no, `ST-${year}-${String(before + 1).padStart(5, '0')}`, 'numara kaybolmadı');
});

test('5.000 iade kaydından sonra getRefund ve listRefunds doğru çalışır', () => {
  const rows = recordSet('refunds');
  const base = Date.now() - 10_000_000;
  const mk = i => ({
    id: `rf_big${String(i).padStart(5, '0')}`,
    orderId: 'big-' + (i % 50),
    status: i % 2 ? 'refunded' : 'requested',
    lines: [{ id: 'x', title: 'X', qty: 1, price: 5 }],
    amount: 5,
    reason: '',
    invoice: null,
    created: base + i,
    updated: base + i,
  });
  rows.putMany(Array.from({ length: 5000 }, (_, i) => mk(i)));
  assert.equal(rf.getRefund('rf_big04999').status, 'refunded');
  assert.equal(rf.getRefund('rf_big00000').status, 'requested');
  assert.equal(rf.getRefund('rf_yok'), null);
  const all = rf.listRefunds();
  assert.ok(all.length >= 5000);
  const big = all.filter(r => r.id.startsWith('rf_big'));
  assert.equal(big.length, 5000);
  assert.equal(big[0].id, 'rf_big04999', 'yeniden eskiye');
  assert.equal(rf.listRefunds({ status: 'refunded' }).filter(r => r.id.startsWith('rf_big')).length, 2500);
  // belge şişmedi
  assert.ok(JSON.stringify(store.doc('refunds', {})).length < 2000);
  // büyük tablo varken yazma ve eski iadeye erişim bozulmaz
  const o = mkOrder();
  const r = req(o);
  assert.equal(rf.getRefund(r.id).orderId, o.id);
});

test('olay günlüğü ve posta kutusu tavanlıdır; iade kayıtları tavansızdır', () => {
  const before = recordSet('refunds').count();
  const mails = recordSet('refund_mails');
  mails.putMany(Array.from({ length: 1100 }, (_, i) => ({ id: 'm' + i, t: Date.now() + i, key: 'x' })));
  rf.storno(req(mkOrder()).id); // posta yazar ve budar
  assert.ok(mails.count() <= 1000);
  assert.ok(recordSet('refunds').count() >= before);
});

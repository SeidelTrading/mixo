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
  const d = store.doc('refunds', null);
  d.refunds[r.id].amount += 1;
  store.saveDoc('refunds', d);
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

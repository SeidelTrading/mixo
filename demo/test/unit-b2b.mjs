// B2B ve personel performansı birim testleri (node:test). Geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit-b2b.mjs   (Node >= 22.13)
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

const b2b = await import('../services/b2b.mjs');
const staff = await import('../services/staff.mjs');
const { store } = await import('../lib/store.mjs');

test.after(() => {
  store.close?.();
});

const code = c => e => e instanceof Error && 'code' in e && e.code === c;
const seller = (over = {}) =>
  b2b.registerSeller({
    name: 'Ege Tekstil',
    country: 'TR',
    vat: 'TR1234567890',
    categories: ['tekstil'],
    ...over,
  });
const buyer = (over = {}) =>
  b2b.registerBuyer({
    name: 'Muster GmbH',
    country: 'DE',
    vat: 'DE123456789',
    categories: ['tekstil'],
    ...over,
  });
const offer = (s, over = {}) =>
  b2b.addOffer({
    sellerId: s.id,
    title: 'Havlu',
    qty: 100,
    unitPrice: 10,
    currency: 'EUR',
    incoterm: 'DAP',
    ...over,
  });

test('boş VAT ve geçersiz ülke reddedilir; varsayılan ülkeler', () => {
  assert.throws(() => seller({ vat: '  ' }), code('invalid'));
  assert.throws(() => buyer({ vat: '' }), code('invalid'));
  assert.throws(() => seller({ country: 'XX' }), code('invalid'));
  assert.throws(() => seller({ country: 'Turkey' }), code('invalid'));
  assert.equal(b2b.registerSeller({ name: 'A', vat: '1' }).country, 'TR');
  assert.equal(b2b.registerBuyer({ name: 'B', vat: '2' }).country, 'DE');
});

test('geçersiz incoterm reddedilir', () => {
  const s = seller();
  assert.throws(() => offer(s, { incoterm: 'CIF' }), code('invalid'));
  assert.equal(offer(s, { incoterm: 'FOB' }).incoterm, 'FOB');
});

test('komisyon kuruş hassasiyetinde, kayan nokta hatası birikmez', () => {
  const s = seller();
  const o = offer(s, { qty: 1000000, unitPrice: 0.1 });
  const q = b2b.quote({ offerId: o.id, qty: 3 }); // 0,30 € → komisyon 0,009 → 0,01
  assert.deepEqual(q.cents, { net: 30, commission: 1, gross: 31 });
  const big = b2b.quote({ offerId: o.id, qty: 1000000 }); // 100000,00 → %3 = 3000,00
  assert.deepEqual(big.cents, { net: 10000000, commission: 300000, gross: 10300000 });
  assert.equal(big.gross, 103000);
  // 0,1 + 0,2 gibi toplamlar tam sayı kuruşla: 0,29 €/adet × 7 = 2,03 €
  const o2 = offer(s, { unitPrice: 0.29 });
  assert.equal(b2b.quote({ offerId: o2.id, qty: 7 }).cents.net, 203);
  assert.throws(() => offer(s, { unitPrice: 1.005 }), code('invalid'));
});

test('adet yetmezse conflict; iptalde adet teklife döner; geçersiz geçiş reddedilir', () => {
  const s = seller(),
    b = buyer();
  const o = offer(s, { qty: 10 });
  const d1 = b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 8 });
  assert.equal(d1.status, 'open');
  assert.equal(d1.invoiceParty, 'platform');
  assert.throws(() => b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 3 }), code('conflict'));
  assert.equal(b2b.listOffers().find(x => x.id === o.id).remaining, 2);
  assert.throws(() => b2b.advanceDeal(d1.id, 'shipped'), code('invalid'));
  assert.throws(() => b2b.advanceDeal(d1.id, 'closed'), code('invalid'));
  b2b.advanceDeal(d1.id, 'cancelled');
  assert.equal(b2b.listOffers().find(x => x.id === o.id).remaining, 10);
  assert.throws(() => b2b.advanceDeal(d1.id, 'confirmed'), code('invalid'));
  const d2 = b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 1, invoiceParty: 'seller' });
  assert.equal(d2.invoiceParty, 'seller');
  for (const st of ['confirmed', 'shipped', 'closed']) assert.equal(b2b.advanceDeal(d2.id, st).status, st);
  assert.throws(
    () => b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 1, invoiceParty: 'x' }),
    code('invalid'),
  );
});

test('match fiyat tavanını aşan teklifi eler ve gerekçe verir', () => {
  const s = seller({ categories: ['elektronik'] });
  const b = buyer({ categories: ['elektronik'] });
  const ucuz = offer(s, { title: 'Ucuz', unitPrice: 5 });
  offer(s, { title: 'Pahalı', unitPrice: 50 });
  const r = b2b.match({ buyerId: b.id, category: 'elektronik', maxUnitPrice: 10 });
  assert.equal(r.length, 1);
  assert.equal(r[0].offer.id, ucuz.id);
  assert.ok(r[0].score > 0 && r[0].why.includes('kategoride'));
  assert.deepEqual(b2b.match({ buyerId: b.id, category: 'mobilya' }), []);
});

test('personel ortalamaları, p90 ve küçük ekip uyarısı', () => {
  assert.throws(() => staff.recordWork({ user: 'a', kind: 'x', ms: 1, ticketId: 't' }), code('invalid'));
  assert.throws(
    () => staff.recordWork({ user: 'a', kind: 'resolution', ms: 0, ticketId: 't' }),
    code('invalid'),
  );
  assert.throws(
    () => staff.recordWork({ user: 'a', kind: 'resolution', ms: -5, ticketId: 't' }),
    code('invalid'),
  );
  staff.recordWork({ user: 'ayse', kind: 'first_reply', ms: 1000, ticketId: 'T1' });
  staff.recordWork({ user: 'ayse', kind: 'first_reply', ms: 3000, ticketId: 'T2' });
  for (let i = 1; i <= 10; i++)
    staff.recordWork({ user: 'ayse', kind: 'resolution', ms: i * 100, ticketId: 'T' + i });
  staff.recordWork({ user: 'can', kind: 'resolution', ms: 777, ticketId: 'T9' });
  const r = staff.performance({});
  const ayse = r.people.find(p => p.user === 'ayse');
  assert.deepEqual(ayse, {
    user: 'ayse',
    tickets: 10,
    avgFirstReplyMs: 2000,
    avgResolutionMs: 550,
    p90ResolutionMs: 900,
  });
  const can = r.people.find(p => p.user === 'can');
  assert.equal(can.p90ResolutionMs, 777); // tek kayıtta p90 o kayıt
  assert.equal(can.avgFirstReplyMs, null);
  assert.ok(r.warning && r.warning.includes('gözetim'));
  for (const u of ['d', 'e', 'f'])
    staff.recordWork({ user: u, kind: 'resolution', ms: 10, ticketId: 'X' + u });
  assert.equal(staff.performance({}).warning, undefined); // 5 kişi
  assert.equal(staff.performance({ from: Date.now() + 100000 }).people.length, 0);
});

/* ───────── prototip kirlenmesi ───────── */
test("__proto__ kimlikli anlaşma Object.prototype'ı kirletmez, notfound döner", () => {
  const s = seller(),
    b = b2b.registerBuyer({ name: 'Müller GmbH', country: 'DE', vat: 'DE123456789' });
  void s;
  assert.throws(
    () => b2b.createDeal({ offerId: '__proto__', buyerId: '__proto__', qty: 7 }),
    code('notfound'),
  );
  assert.throws(() => b2b.advanceDeal('__proto__', 'shipped'), code('notfound'));
  assert.throws(() => b2b.createDeal({ offerId: 'constructor', buyerId: b.id, qty: 1 }), code('notfound'));
  assert.equal(/** @type {any} */ ({}).remaining, undefined);
  assert.equal('remaining' in {}, false);
  assert.equal('status' in {}, false);
});

test('b2b: iki ayrı süreç aynı belgeye kayıt eklerken kayıp olmaz (store.tx)', async () => {
  const { spawn } = await import('node:child_process');
  const before = b2b.summary().counts.sellers,
    N = 40;
  const src = `
    const b2b = await import('./services/b2b.mjs');
    for (let i = 0; i < ${N}; i++)
      b2b.registerSeller({ name: 'S' + i, country: 'TR', vat: 'TR1234567890', categories: ['tekstil'] });
  `;
  const run = () =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', src], {
        cwd: path.resolve(import.meta.dirname, '..'),
        env: { ...process.env },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      p.stderr.on('data', d => (err += d));
      p.on('exit', c => (c === 0 ? resolve() : reject(new Error(`süreç ${c}: ${err}`))));
    });
  await Promise.all([run(), run()]);
  assert.equal(b2b.summary().counts.sellers, before + 2 * N);
});

test('b2b: kapalı anlaşma tavanı yalnız sonuçlanmışları budar, açık anlaşmalara dokunmaz', () => {
  const s = seller(),
    b = buyer(),
    o = offer(s, { qty: 1000 });
  const eski = b2b.LIMITS.maxDoneDeals;
  b2b.LIMITS.maxDoneDeals = 3;
  try {
    const open = [1, 2, 3, 4, 5].map(() => b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 1 }));
    const closed = [];
    for (let i = 0; i < 6; i++) {
      const d = b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 1 });
      for (const st of ['confirmed', 'shipped', 'closed']) b2b.advanceDeal(d.id, st);
      closed.push(d.id);
    }
    const ids = new Set(b2b.summary().deals.map(d => d.id));
    for (const d of open) assert.ok(ids.has(d.id), 'açık anlaşma silinmemeli');
    assert.equal(closed.filter(id => ids.has(id)).length, 3, 'yalnız en yeni 3 kapalı kalır');
    assert.ok(!ids.has(closed[0]) && ids.has(closed[5]));
    // iptal edilen de sonuçlanmıştır; adet teklife geri döner
    const rem = () => b2b.listOffers().find(x => x.id === o.id).remaining;
    const before = rem();
    const c = b2b.createDeal({ offerId: o.id, buyerId: b.id, qty: 4 });
    assert.equal(rem(), before - 4);
    b2b.advanceDeal(c.id, 'cancelled');
    assert.equal(rem(), before);
    assert.throws(() => b2b.advanceDeal(c.id, 'confirmed'), code('invalid'));
    // açık anlaşma hâlâ ilerletilebilir
    assert.equal(b2b.advanceDeal(open[0].id, 'confirmed').status, 'confirmed');
  } finally {
    b2b.LIMITS.maxDoneDeals = eski;
  }
});

test('b2b: belge küçük kalır, kayıtlar satır tablosundadır', () => {
  const d = store.doc('b2b', {});
  assert.equal(d.sellers, undefined);
  assert.equal(d.deals, undefined);
  assert.ok(b2b.summary().counts.sellers > 0);
});

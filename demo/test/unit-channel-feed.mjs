// Karşılaştırma sitesi feed'leri (idealo CSV, PriceRunner XML) birim testleri.
// Çalıştır: node --test test/unit-channel-feed.mjs
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

const pool = await import('../services/pool.mjs');
const cf = await import('../services/channel-feed.mjs');
const rules = await import('../services/rules.mjs');
const { store } = await import('../lib/store.mjs');

const LEGAL = { representative: 'Acme GmbH', address: 'Hauptstr. 1, Berlin', taxId: 'DE123456789' };
const add = (ref, extra = {}) =>
  pool.ingest({
    src: 'cf',
    ref,
    title: 'Toner ' + ref,
    vendor: 'CfMarka',
    mpn: 'M-' + ref,
    eans: [extra.ean ?? '4006381333931'],
    description: '<p>Yeterince uzun bir "ürün" açıklaması</p>',
    image: 'https://cdn.example.com/' + ref + '.jpg',
    price: 20,
    legal: LEGAL,
    ...extra,
  });

const DE = {
  deliveryMin: 1,
  deliveryMax: 3,
  shipping: { dhl: 4.9, dpd: 5.5 },
  payments: { paypal: 0, cash_in_advance: 0 },
  freeFrom: 50,
};

test.after(() => {
  store.close?.();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('ayarı eksik ülkenin feedi üretilmez', () => {
  assert.throws(() => cf.buildChannel('idealo-de'), { code: 'notready' });
  assert.deepEqual(cf.countryGaps('se').sort(), ['delivery', 'payments', 'rate', 'shipping']);
});

test('geçersiz ayar reddedilir', () => {
  assert.throws(() => cf.setConfig({ countries: { fr: {} } }), { code: 'invalid' });
  assert.throws(() => cf.setConfig({ countries: { de: { shipping: { DHL: 1 } } } }), { code: 'invalid' });
  assert.throws(() => cf.setConfig({ countries: { de: { shipping: { __proto__x: -1 } } } }), {
    code: 'invalid',
  });
  assert.throws(() => cf.setConfig({ countries: { de: { deliveryMin: 5, deliveryMax: 2 } } }), {
    code: 'invalid',
  });
  assert.throws(() => cf.setConfig({ baseUrl: 'javascript:alert(1)' }), { code: 'invalid' });
  assert.throws(() => cf.setConfig({ countries: { se: { rate: 0 } } }), { code: 'invalid' });
});

test('idealo CSV: zorunlu sütunlar, KDV dahil fiyat, kargo ve ödeme sütunları', () => {
  cf.setConfig({ baseUrl: 'https://shop.example.com/', countries: { de: DE } });
  const { id } = add('A1');
  const r = cf.buildChannel('idealo-de');
  assert.equal(r.format, 'csv');
  assert.ok(r.body.startsWith('﻿'), 'UTF-8 BOM');
  const [head, row] = r.body.slice(1).trim().split('\r\n');
  for (const c of ['sku', 'title', 'url', 'price', 'delivery', 'deliveryCosts_dhl', 'paymentCosts_paypal'])
    assert.ok(head.includes(`"${c}"`), c);
  assert.ok(row.includes(`"${id}"`));
  assert.ok(row.includes('"20.00"'));
  assert.ok(row.includes('"1-3 Werktage"'));
  assert.ok(row.includes('"4.90"') && row.includes('"5.50"'), 'her kargo firması kendi sütununda');
  assert.ok(row.includes('https://shop.example.com/p/4006381333931?utm_source=idealo'), row);
  assert.ok(!row.includes('<p>'), 'HTML atılır');
  assert.ok(row.includes('""ürün""'), 'tırnak ikilenir');
  assert.equal(r.count, 1);
});

test('ücretsiz kargo eşiği feed ve sayfa fiyatında aynı', () => {
  const { id } = add('B1', { ean: '4006381333948', price: 60 });
  const p = pool.getPool(id);
  assert.equal(cf.offerPrice(p, 'de'), 60);
  assert.equal(cf.shippingCost(60, 'de'), 0);
  assert.equal(cf.shippingCost(20, 'de'), 4.9, 'en ucuz kargo');
  const row = cf
    .buildChannel('idealo-de')
    .body.split('\r\n')
    .find(l => l.includes(id));
  assert.ok(row.includes('"60.00"') && row.includes('"0.00"'));
});

test('stokta olmayan ürün yayınlanmaz, nedeni sayılır', () => {
  add('C1', { ean: '4006381333955', stock: 0 });
  const r = cf.buildChannel('idealo-de');
  assert.equal(r.skipped['stok yok'], 1);
  assert.ok(!r.body.includes('Toner C1'));
});

test('satış yasağı olan marka feede girmez', () => {
  add('D1', { ean: '4006381333962', vendor: 'YasakMarka' });
  rules.addRule({ vendor: 'YasakMarka', market: 'idealo', reason: 'birim testi yasağı' });
  assert.ok(!cf.buildChannel('idealo-de').body.includes('Toner D1'));
});

test('PriceRunner XML: kurla çevrilmiş fiyat, para birimi, kaçış', () => {
  cf.setConfig({
    countries: {
      se: { rate: 11.5, deliveryMin: 2, deliveryMax: 5, shipping: { postnord: 49 }, payments: { klarna: 0 } },
    },
  });
  add('E1', { ean: '4006381333979', title: 'Kablo "A&B" <b>E1</b>' });
  const r = cf.buildChannel('pricerunner-se');
  assert.equal(r.format, 'xml');
  assert.match(r.body, /<Price>230\.00<\/Price>/);
  assert.match(r.body, /<Currency>SEK<\/Currency>/);
  assert.match(r.body, /<DeliveryTime>2-5 arbetsdagar<\/DeliveryTime>/);
  assert.match(
    r.body,
    /<ProductName>Kablo &quot;A&amp;B&quot; E1<\/ProductName>/,
    'HTML atılır, & ve tırnak kaçar',
  );
});

test('erişim anahtarı: yalnız özeti saklanır, doğru anahtar geçer', () => {
  const { token } = cf.rotateToken('idealo-de');
  assert.ok(cf.tokenOk('idealo-de', token));
  assert.ok(!cf.tokenOk('idealo-de', token + 'x'));
  assert.ok(!cf.tokenOk('idealo-at', token), 'anahtar hedefe bağlı');
  assert.ok(!JSON.stringify(store.doc('channel_feed', {})).includes(token), 'düz anahtar saklanmaz');
  const { token: t2 } = cf.rotateToken('idealo-de');
  assert.ok(!cf.tokenOk('idealo-de', token), 'yenilenen anahtar eskisini geçersiz kılar');
  assert.ok(cf.tokenOk('idealo-de', t2));
});

test('CSV hücresi formül olarak açılmaz', () => {
  assert.equal(cf.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(cf.csvCell('-5'), '"-5"');
  assert.equal(cf.csvCell('a\r\nb'), '"a b"');
});

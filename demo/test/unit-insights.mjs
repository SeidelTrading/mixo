// Birim testleri (node:test). Modüller açılışta veritabanı ve katalog yüklediği için geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit.mjs   (Node >= 22.13)
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

const { store } = await import('../lib/store.mjs');
const analytics = await import('../services/analytics.mjs');
const ins = await import('../services/insights.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const EAN = '4006381333931';
const feed = (market, price, currency = 'EUR', extra = {}) =>
  ins.importMarketData({
    market,
    source: 'api',
    rows: [{ ean: EAN, title: 'Test', price, currency, sales30d: 10, ...extra }],
  });

test('geçersiz source reddedilir', () => {
  assert.throws(
    () => ins.importMarketData({ market: 'amazon', source: 'scrape', rows: [{ ean: EAN, price: 1 }] }),
    e => e instanceof ins.InsightsError && e.code === 'invalid',
  );
  assert.throws(() => ins.importMarketData({ market: 'amazon', rows: [{ ean: EAN, price: 1 }] }), /source/);
});

test('compare: fiyat aralığı doğru', () => {
  feed('amazon', 50);
  feed('kaufland', 40);
  feed('trendyol', 1000, 'TRY'); // 26 EUR
  const [r] = ins.compare({ eans: [EAN] });
  assert.equal(r.min, 26);
  assert.equal(r.max, 50);
  assert.equal(r.spread, 24);
  assert.equal(r.rows.length, 3);
  assert.throws(
    () => ins.compare({ eans: ['12345670'] }),
    e => e.code === 'notfound',
  );
});

test('arbitrage: maliyetler düşülür, minMargin altı elenir', () => {
  const [a] = ins.arbitrage({ fromMarkets: ['trendyol'], toMarkets: ['amazon', 'kaufland'], minMargin: 0 });
  // alış 26; kargo 7.5; gümrük 26*0.19=4.94; komisyon 50*0.15=7.5; net = 50-26-7.5-4.94-7.5 = 4.06
  assert.equal(a.buy.market, 'trendyol');
  assert.equal(a.sell.market, 'amazon');
  assert.equal(a.costs.duty, 4.94);
  assert.equal(a.costs.commission, 7.5);
  assert.equal(a.netMargin, 4.06);
  assert.equal(a.marginPct, 15.62);
  assert.equal(ins.arbitrage({ fromMarkets: ['trendyol'], toMarkets: ['amazon'], minMargin: 5 }).length, 0);
});

test('huni: onaysız olay girmez, skippedNoConsent artar', () => {
  const t = Date.now();
  const ev = (vid, e, x = {}) => analytics.events.push({ t, vid, s: 1, e, d: 'd', ...x });
  ev('v1', 'view', { consent: true });
  ev('v1', 'add', { consent: true });
  ev('v2', 'view', { consent: true });
  ev('v3', 'view', { c: 1 });
  ev('v4', 'view'); // onaysız
  ev('v4', 'checkout');
  const f = ins.funnel({ days: 1 });
  assert.equal(f.consented, 3);
  assert.equal(f.skippedNoConsent, 2);
  assert.equal(f.steps[0].visitors, 3);
  assert.equal(f.steps.find(s => s.step === 'Ödeme').visitors, 0);
  assert.equal(f.steps.find(s => s.step === 'Sepete ekleme').visitors, 1);
});

test('cohort: veri olmayan boyut uydurma değer üretmez', () => {
  const c = ins.cohort({ days: 1 });
  assert.equal(c.region, 'veri yok');
  assert.equal(c.weather, 'veri yok');
  assert.equal(c.returns, 'veri yok');
  assert.ok(Array.isArray(c.hour));
  ins.importContext({ rows: [{ type: 'returns', key: 'moda', value: 4 }] });
  assert.deepEqual(ins.cohort({ days: 1 }).returns, [{ key: 'moda', avg: 4, n: 1 }]);
});

// Satış yasağı kuralları ve fiyat stratejisi birim testleri (node:test). Geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit-rules.mjs   (Node >= 22.13)
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

const rules = await import('../services/rules.mjs');
const ps = await import('../services/price-strategy.mjs');

test('şirket+marka+pazar yeri kuralı eşleşir, diğerleri serbest kalır', () => {
  rules.addRule({ company: 'Lady', vendor: 'Chanel', market: 'idealo', reason: 'Marka sözleşmesi' });
  const no = rules.evaluate({ company: 'lady', vendor: 'CHANEL', market: 'Idealo' });
  assert.equal(no.allowed, false);
  assert.match(no.reason, /Marka sözleşmesi/);
  assert.equal(rules.evaluate({ company: 'Lady', vendor: 'Chanel', market: 'amazon' }).allowed, true);
  assert.equal(rules.evaluate({ company: 'Diğer', vendor: 'Chanel', market: 'idealo' }).allowed, true);
});

test('daha genel kural daha özeli ezmez', () => {
  rules.addRule({ category: 'Biyomedikal', market: 'amazon', reason: 'Mevzuat' });
  rules.addRule({ company: 'Lady', category: 'Biyomedikal', market: 'amazon', reason: 'Şirket özel yasak' });
  const r = rules.evaluate({ company: 'Lady', category: 'Biyomedikal', market: 'amazon' });
  assert.match(r.reason, /Şirket özel yasak/);
  assert.match(rules.evaluate({ company: 'X', category: 'Biyomedikal', market: 'amazon' }).reason, /Mevzuat/);
});

test('reason boşken kural eklenemez; güncelle ve sil çalışır', () => {
  assert.throws(() => rules.addRule({ vendor: 'Nike', reason: '  ' }), { code: 'invalid' });
  assert.throws(() => rules.addRule({ reason: 'Her şeyi yasaklar' }), { code: 'invalid' });
  const r = rules.addRule({ vendor: 'Nike', market: 'kaufland', reason: 'Deneme' });
  rules.updateRule(r.id, { enabled: false });
  assert.equal(rules.evaluate({ vendor: 'Nike', market: 'kaufland' }).allowed, true);
  rules.removeRule(r.id);
  assert.throws(() => rules.removeRule(r.id), { code: 'notfound' });
});

test('preview her marka için sonuç döndürür', () => {
  const out = rules.preview({ company: 'Lady', market: 'idealo', vendors: ['Chanel', 'Dior', 'Chanel'] });
  assert.equal(out.length, 2);
  assert.equal(out[0].allowed, false);
  assert.equal(out[1].allowed, true);
});

test('taban fiyat maliyet + komisyon + kargo + marj ile hesaplanır', () => {
  // (100 + 5 + 100×0,10) / (1 − 0,15) = 135,2941… → 135,30
  const f = ps.floorPrice({ cost: 100, market: 'amazon', shipping: 5, minMargin: 0.1 });
  assert.equal(f, 135.3);
  const sale = f * (1 - ps.COMMISSION.amazon);
  assert.ok(sale >= 115 - 1e-6);
  assert.equal(ps.floorPrice({ cost: 50, market: 'idealo', shipping: 0, minMargin: 0 }), 50);
  assert.throws(() => ps.floorPrice({ cost: 1, market: 'yok' }), { code: 'invalid' });
});

test('rakip fiyatı tabanın altındayken skip döner', () => {
  ps.setStrategy({ company: 'Lady', minMargin: 0.1 });
  const d = ps.priceDecision({
    company: 'Lady',
    market: 'amazon',
    cost: 100,
    shipping: 5,
    competitorPrice: 120,
  });
  assert.equal(d.action, 'skip');
  assert.equal(d.floor, 135.3);
  assert.equal(d.price, null);
  const ok = ps.priceDecision({
    company: 'Lady',
    market: 'amazon',
    cost: 100,
    shipping: 5,
    competitorPrice: 140,
  });
  assert.equal(ok.action, 'match');
  assert.equal(ok.price, 140);
});

test('excluded şirkette hold döner', () => {
  ps.setStrategy({ company: '*', excluded: ['Muaf'] });
  ps.setStrategy({ company: 'Muaf' });
  const d = ps.priceDecision({ company: 'Muaf', market: 'amazon', cost: 10, competitorPrice: 50 });
  assert.equal(d.action, 'hold');
  assert.equal(d.reason, 'strateji dışı');
});

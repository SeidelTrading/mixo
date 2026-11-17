// Sipariş kaydının kaynak alanları (kiracı, mağaza, pazar yeri) ve sipariş akışının iş modüllerine bağlanması.
// Çalıştır: node --test test/unit-order-flow.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-of-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const { P } = await import('../services/catalog.mjs');
const { store } = await import('../lib/store.mjs');
const { settings } = await import('../services/settings.mjs');
const ord = await import('../services/orders.mjs');
const dash = await import('../services/dashboard.mjs');
await import('../services/order-flow.mjs'); // kancayı bağlar

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const pid = [...P.keys()][0];
const musteri = {
  name: 'Testi Test',
  email: 'of@example.com',
  street: 'Teststr 1',
  zip: '44137',
  city: 'Dortmund',
};
const siparis = (over = {}) => ord.createOrder({ items: [{ id: pid, qty: 1 }], customer: musteri, ...over });

test('sipariş kaydı kiracı, mağaza ve pazar yeri alanlarını taşır', () => {
  const r = siparis();
  assert.equal(r.err, undefined, r.err);
  assert.equal(r.order.shop, 'mixoutlet');
  assert.equal(r.order.market, 'shop');
  assert.equal(r.order.tenantId, null, 'tek kiracılı kurulumda kiracı yok');
});

test('kaynak alanları istemciden gelemez: gövdedeki değer yok sayılır', () => {
  // Herkese açık kasa ucu bu alanları seçebilseydi, başka kiracının adına sipariş yazılabilirdi.
  const r = siparis({ tenantId: 'baska-kiraci', shop: 'baska-magaza', market: 'amazon' });
  assert.equal(r.order.tenantId, null);
  assert.equal(r.order.shop, 'mixoutlet');
  assert.equal(r.order.market, 'shop');
});

test('sunucu ayarı değişince yeni siparişler yeni kaynağı taşır', () => {
  settings.origin = { tenantId: 'kiraci-1', shop: 'depo-2', market: 'kaufland' };
  const r = siparis();
  assert.equal(r.order.tenantId, 'kiraci-1');
  assert.equal(r.order.shop, 'depo-2');
  assert.equal(r.order.market, 'kaufland');
  settings.origin = { tenantId: null, shop: 'mixoutlet', market: 'shop' };
});

test('pano kırılımı gerçek alanları kullanır, "bilinmiyor" altında toplanmaz', () => {
  const byShop = dash.revenue({ groupBy: 'shop' });
  const keys = byShop.rows.map(r => r.key);
  assert.ok(keys.includes('mixoutlet'), 'mağaza kırılımı gerçek mağaza adını veriyor: ' + keys.join(', '));
  assert.ok(keys.includes('depo-2'), 'ayar değişmeden önceki ve sonraki siparişler ayrı satırlarda');
  const byMarket = dash.revenue({ groupBy: 'market' });
  assert.ok(byMarket.rows.map(r => r.key).includes('shop'));
  assert.ok(byShop.total > 0 && Number.isFinite(byShop.total));
});

test('satış, kategorisinin günlük hedef sayacından düşer', () => {
  const cat = P.get(pid).cat;
  dash.setTarget({ cat, label: 'Test hedefi', count: 10 });
  const once = dash.listTargets().find(t => t.cat === cat).left;
  const r = siparis();
  assert.equal(r.err, undefined, r.err);
  const sonra = dash.listTargets().find(t => t.cat === cat).left;
  assert.equal(sonra, once - 1, 'bir adet satış sayacı bir düşürür');
});

test('hedefi tanımlı olmayan kategorideki satış sessizce geçer, sipariş düşmez', () => {
  // Hedefi olmayan kategori 'notfound' atar; kanca bunu yutmalı, yoksa sipariş akışı kırılırdı.
  const other = [...P.values()].find(p => p.cat !== P.get(pid).cat);
  const r = ord.createOrder({ items: [{ id: other.id, qty: 1 }], customer: musteri });
  assert.equal(r.err, undefined, r.err);
  assert.ok(r.order.id);
});

test('siparişe kargo firması seçimi yazılır', () => {
  const r = siparis();
  assert.ok(r.order.shippingChoice, 'seçim siparişe yazıldı');
  assert.ok(typeof r.order.shippingChoice.carrier === 'string' && r.order.shippingChoice.carrier);
  assert.ok(typeof r.order.shippingChoice.reason === 'string' && r.order.shippingChoice.reason);
});

test('geçersiz posta kodunda kargo seçimi yapılmaz ama sipariş geçerli kalır', () => {
  const r = ord.createOrder({
    items: [{ id: pid, qty: 1 }],
    customer: { ...musteri, zip: 'abc' },
  });
  assert.equal(r.err, undefined, r.err);
  assert.equal(r.order.shippingChoice, undefined, 'seçim yok');
  assert.equal(r.order.status, 'new', 'sipariş yine de geçerli');
});

// Canlı pano birim testleri (K-18, K-19, K-20). Çalıştır: node --test test/unit-dashboard.mjs   (Node >= 22.13)
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
const { store } = await import('../lib/store.mjs');
const dash = await import('../services/dashboard.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const CUSTOMER = {
  name: 'Test Kişi',
  email: 'pano@example.com',
  street: 'Teststr. 1',
  zip: '10115',
  city: 'Berlin',
};
const prod = [...P.values()].filter(p => !p.na).slice(0, 3);
const mkOrder = (id, qty = 1, extra = {}) => {
  const r = ord.createOrder({ items: [{ id, qty }], customer: CUSTOMER });
  assert.ok(r.order, r.err);
  Object.assign(r.order, extra);
  return r.order;
};
// Elle sipariş: kuruş testi için tam toplam verilir (kayıt belleğe eklenir, veritabanına yazılmaz).
const fake = (total, extra = {}) => {
  const o = {
    id: 'T-' + Math.random(),
    t: Date.now(),
    status: 'new',
    items: [{ id: 'x', qty: 1 }],
    total,
    ...extra,
  };
  ord.orders.push(o);
  return o;
};
const drop = os => os.forEach(o => ord.orders.splice(ord.orders.indexOf(o), 1));

test('ciro: iptal ve doğrulanmamış sipariş toplama girmez; bilinmeyen alan bilinmiyor altında', () => {
  const a = mkOrder(prod[0].id, 2),
    b = mkOrder(prod[1].id, 1),
    c = mkOrder(prod[0].id, 1, { status: 'cancelled' }),
    d = mkOrder(prod[0].id, 1, { status: 'unverified' });
  const r = dash.revenue({ groupBy: 'company' });
  assert.equal(r.orders, 2);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].key, dash.UNKNOWN);
  assert.equal(r.rows[0].count, 3);
  assert.equal(Math.round(r.total * 100), Math.round(a.total * 100) + Math.round(b.total * 100));
  assert.equal(r.stale, false);
  assert.equal(r.updatedAt, Math.max(a.t, b.t));
  drop([a, b, c, d]);
});

test('ciro: şirket, mağaza, pazar yeri ve gün kırılımı; tarih aralığı', () => {
  const o1 = fake(10, {
    company: 'A',
    shop: 's1',
    market: 'hepsiburada',
    t: Date.parse('2026-11-01T10:00:00Z'),
  });
  const o2 = fake(5, { company: 'A', shop: 's2', market: 'trendyol', t: Date.parse('2026-11-02T10:00:00Z') });
  const o3 = fake(7, {
    company: 'B',
    shop: 's1',
    market: 'hepsiburada',
    t: Date.parse('2026-11-02T11:00:00Z'),
  });
  assert.deepEqual(
    dash.revenue({ groupBy: 'company' }).rows.map(r => [r.key, r.revenue]),
    [
      ['A', 15],
      ['B', 7],
    ],
  );
  assert.deepEqual(
    dash.revenue({ groupBy: 'shop' }).rows.map(r => [r.key, r.revenue]),
    [
      ['s1', 17],
      ['s2', 5],
    ],
  );
  assert.deepEqual(
    dash.revenue({ groupBy: 'market' }).rows.map(r => r.key),
    ['hepsiburada', 'trendyol'],
  );
  assert.equal(dash.revenue({ groupBy: 'day' }).rows.length, 2);
  assert.equal(dash.revenue({ groupBy: 'shop', from: '2026-11-02T00:00:00Z' }).total, 12);
  assert.throws(() => dash.revenue({ groupBy: 'x' }), { code: 'invalid' });
  assert.throws(() => dash.revenue({ from: 'bozuk' }), { code: 'invalid' });
  drop([o1, o2, o3]);
});

test('ciro: kuruş hassasiyeti korunur (0.1 + 0.2 tuzağı)', () => {
  assert.notEqual(0.1 + 0.2, 0.3); // kayan nokta tuzağı gerçek
  const os = [fake(0.1), fake(0.2)];
  assert.equal(dash.revenue({ groupBy: 'company' }).total, 0.3);
  drop(os);
  const many = Array.from({ length: 1000 }, () => fake(0.1));
  const r = dash.revenue({ groupBy: 'company' });
  assert.equal(r.total, 100);
  assert.equal(r.rows[0].revenue, 100);
  drop(many);
});

test('ciro: eski siparişte veri bayat sayılır; sipariş yoksa da', () => {
  assert.equal(dash.revenue({}).stale, true);
  const o = fake(1, { t: Date.now() - dash.STALE_MS - 1000 });
  assert.equal(dash.revenue({}).stale, true);
  assert.equal(dash.revenue({}).updatedAt, o.t);
  drop([o]);
});

test('hedef: geri sayar, sıfırın altına inmez, geçersiz girdiyi reddeder', () => {
  dash.setTarget({ cat: 'parfum', label: 'Parfüm', count: 100 });
  assert.equal(dash.consume({ cat: 'parfum', qty: 3 }).left, 97);
  assert.equal(dash.consume({ cat: 'parfum', qty: 1000 }).left, 0);
  assert.equal(dash.consume({ cat: 'parfum', qty: 1 }).left, 0);
  assert.equal(dash.listTargets().find(t => t.cat === 'parfum').left, 0);
  assert.throws(() => dash.consume({ cat: 'yok', qty: 1 }), { code: 'notfound' });
  assert.throws(() => dash.consume({ cat: 'parfum', qty: 0 }), { code: 'invalid' });
  assert.throws(() => dash.setTarget({ cat: 'x y', count: 5 }), { code: 'invalid' });
  assert.throws(() => dash.setTarget({ cat: 'toner', count: -1 }), { code: 'invalid' });
});

test('hedef: gün değişince sıfırlanır, aynı gün içinde sıfırlanmaz', () => {
  dash.setTarget({ cat: 'saat', label: 'Saat', count: 50 });
  dash.consume({ cat: 'saat', qty: 20 });
  const now = Date.now();
  assert.equal(dash.resetDaily(now), false);
  assert.equal(dash.listTargets().find(t => t.cat === 'saat').left, 30);
  assert.equal(dash.resetDaily(now + 60e3), false, 'aynı gün: sayaç korunur');
  assert.equal(dash.listTargets().find(t => t.cat === 'saat').left, 30);
  assert.equal(dash.resetDaily(now + 36 * 3600e3), true, 'ertesi gün: sıfırlanır');
  assert.equal(dash.listTargets(now + 36 * 3600e3).find(t => t.cat === 'saat').left, 50);
  assert.equal(dash.listTargets(now + 36 * 3600e3).find(t => t.cat === 'parfum').left, 100);
  assert.equal(dash.resetDaily(now + 36 * 3600e3), false);
});

test('spot: kalan adet, günlük hız ve eksik mağazalar', () => {
  const s = dash.addSpot({
    poolId: prod[2].id,
    title: 'Yastık',
    total: 3000,
    shops: ['Mağaza A'],
    allShops: ['Mağaza A', 'Mağaza B'],
  });
  let st = dash.spotStatus(s.id);
  assert.equal(st.sold, 0);
  assert.equal(st.remaining, 3000);
  assert.equal(st.perDay, 0);
  assert.equal(st.daysLeft, null);
  assert.deepEqual(st.missingShops, ['Mağaza B']);
  const o1 = mkOrder(prod[2].id, 4, { t: Date.now() - 2 * 864e5 });
  const o2 = mkOrder(prod[2].id, 2);
  const o3 = mkOrder(prod[2].id, 9, { status: 'cancelled' });
  st = dash.spotStatus(s.id);
  assert.equal(st.sold, 6);
  assert.equal(st.remaining, 2994);
  assert.equal(st.perDay, 3); // 6 adet / 2 gün
  assert.equal(st.daysLeft, 998);
  assert.equal(dash.listSpots().length, 1);
  drop([o1, o2, o3]);
  assert.throws(() => dash.spotStatus('yok'), { code: 'notfound' });
  assert.throws(() => dash.addSpot({ poolId: 'p', title: 't', total: 0 }), { code: 'invalid' });
  assert.throws(() => dash.addSpot({ title: 't', total: 5 }), { code: 'invalid' });
});

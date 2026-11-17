// Kargo birim testleri (node:test). Çalıştır: node --test test/unit-shipping.mjs   (Node >= 22.13)
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
const sh = await import('../services/shipping.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const feed = (carrier, zip, delivered, lost = 0, late = 0) => {
  for (const [outcome, n] of [
    ['delivered', delivered],
    ['lost', lost],
    ['late', late],
  ])
    for (let i = 0; i < n; i++) sh.recordDelivery({ carrier, zip, outcome });
};

test('Dortmund 44 GLS, Berlin 10 DHL seçilir; gerekçe skorları içerir', () => {
  feed('gls', '44135', 28, 1, 1);
  feed('dhl', '44135', 22, 6, 2);
  feed('dhl', '10115', 29, 0, 1);
  feed('gls', '10115', 21, 5, 4);
  const a = sh.chooseCarrier({ zip: '44137', orderTotal: 50 });
  const b = sh.chooseCarrier({ zip: '10117', orderTotal: 50 });
  assert.equal(a.carrier, 'gls');
  assert.equal(b.carrier, 'dhl');
  assert.equal(a.extraCost, 0);
  assert.match(a.reason, /GLS %\d+/);
  assert.match(a.reason, /DHL %\d+/);
});

test('aynı bölgede daha başarılı firma seçilir; skor 0-1 arasındadır', () => {
  const g = sh.scoreOf('gls', '44135');
  const d = sh.scoreOf('dhl', '44135');
  assert.ok(g.score > d.score && g.score <= 1 && d.score >= 0);
  assert.equal(g.samples, 30);
  assert.equal(g.reliable, true);
});

test('veri azken reliable:false ve varsayılan firmaya düşer', () => {
  feed('gls', '80331', 5);
  const s = sh.scoreOf('gls', '80331');
  assert.equal(s.reliable, false);
  assert.equal(s.samples, 5);
  const r = sh.chooseCarrier({ zip: '80331', orderTotal: 10 });
  assert.equal(r.carrier, 'dhl');
  assert.match(r.reason, /güvenilir veri yok/);
});

test('tutar eşiği üstünde UPS (güvenilir ve ilk ikide ise) +1,50 € ek maliyetle seçilir', () => {
  feed('ups', '44135', 26, 2, 2); // 44'te üçüncü: UPS (0,87) < GLS < DHL? DHL 0,77 → UPS ikinci
  const low = sh.chooseCarrier({ zip: '44135', orderTotal: 100 });
  assert.equal(low.carrier, 'gls');
  const hi = sh.chooseCarrier({ zip: '44135', orderTotal: 250.01 });
  assert.equal(hi.carrier, 'ups');
  assert.equal(hi.extraCost, 1.5);
  const biz = sh.chooseCarrier({ zip: '44135', orderTotal: 10, businessAddress: true });
  assert.equal(biz.carrier, 'ups');
  assert.equal(biz.extraCost, 1.5);
  // Berlin'de UPS verisi yok: kural uygulanmaz
  const be = sh.chooseCarrier({ zip: '10115', orderTotal: 900, businessAddress: true });
  assert.equal(be.carrier, 'dhl');
  assert.equal(be.extraCost, 0);
});

test('UPS bölgede son sıradaysa kural uygulanmaz', () => {
  feed('ups', '50667', 10, 15, 5);
  feed('dhl', '50667', 25, 3, 2);
  feed('gls', '50667', 24, 4, 2);
  const r = sh.chooseCarrier({ zip: '50667', orderTotal: 1000, businessAddress: true });
  assert.notEqual(r.carrier, 'ups');
  assert.equal(r.extraCost, 0);
});

test('geçersiz posta kodu ShippingError(invalid) fırlatır', () => {
  for (const zip of ['', '1234', 'abcde', '00123', undefined])
    assert.throws(
      () => sh.chooseCarrier({ zip, orderTotal: 5 }),
      e => e instanceof sh.ShippingError && e.code === 'invalid',
    );
  assert.throws(
    () => sh.recordDelivery({ carrier: 'dhl', zip: '44135', outcome: 'x' }),
    e => e.code === 'invalid',
  );
  assert.throws(
    () => sh.recordDelivery({ carrier: 'yok', zip: '44135', outcome: 'lost' }),
    e => e.code === 'notfound',
  );
});

test('yeni firma eklenince seçime girer; devre dışı firma seçilmez', () => {
  sh.addCarrier({ id: 'hermes', name: 'Hermes', handoverFee: 0 });
  feed('hermes', '20095', 30);
  feed('dhl', '20095', 24, 4, 2);
  assert.equal(sh.chooseCarrier({ zip: '20095', orderTotal: 20 }).carrier, 'hermes');
  assert.throws(
    () => sh.addCarrier({ id: 'hermes' }),
    e => e.code === 'invalid',
  );
  sh.setCarrier('hermes', { enabled: false });
  assert.equal(sh.chooseCarrier({ zip: '20095', orderTotal: 20 }).carrier, 'dhl');
  assert.equal(sh.listCarriers().find(c => c.id === 'ups').handoverFee, 1.5);
});

test('labelFor seçimi günlüğe yazar; günlük LOG_MAX ile sınırlıdır; stats bölge tablosu verir', () => {
  const r = sh.labelFor({ id: 'S1', total: 300, customer: { zip: '44135', business: false } });
  assert.equal(r.carrier, 'ups');
  assert.equal(r.zip, '44135');
  assert.equal(sh.selectionLog(1)[0].orderId, 'S1');
  for (let i = 0; i < sh.LOG_MAX + 5; i++) sh.labelFor({ id: 'X' + i, total: 5, customer: { zip: '10115' } });
  const all = sh.selectionLog(sh.LOG_MAX + 50);
  assert.equal(all.length, sh.LOG_MAX);
  assert.equal(all[0].orderId, 'X' + (sh.LOG_MAX + 4));
  const st = sh.stats();
  assert.ok(st.zones.some(z => z.zone === '44' && z.carriers.gls.reliable));
});

/* ───────── kayıp güncelleme: oku-değiştir-yaz store.tx içinde ───────── */
test('çok sayıda recordDelivery çağrısından sonra kayıt sayısı tam (süreç içi)', () => {
  const zip = '20095',
    before = sh.scoreOf('dhl', zip).samples;
  for (let i = 0; i < 300; i++) sh.recordDelivery({ carrier: 'dhl', zip, outcome: 'delivered' });
  assert.equal(sh.scoreOf('dhl', zip).samples, before + 300);
});

test('iki ayrı süreç aynı veritabanına yazarken kayıt kaybolmaz (store.tx)', async () => {
  const { spawn } = await import('node:child_process');
  const zip = '30159',
    N = 150;
  const code = `
    const sh = await import('./services/shipping.mjs');
    for (let i = 0; i < ${N}; i++) sh.recordDelivery({ carrier: 'gls', zip: '${zip}', outcome: 'delivered' });
  `;
  const run = () =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', code], {
        cwd: path.resolve(import.meta.dirname, '..'),
        env: { ...process.env },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      p.stderr.on('data', d => (err += d));
      p.on('exit', c => (c === 0 ? resolve() : reject(new Error(`süreç ${c}: ${err}`))));
    });
  await Promise.all([run(), run()]);
  assert.equal(sh.scoreOf('gls', zip).samples, 2 * N);
});

test('firma kimliği "constructor" olsa da sayaç ve prototip bozulmaz', () => {
  sh.addCarrier({ id: 'constructor', name: 'Garip' });
  sh.recordDelivery({ carrier: 'constructor', zip: '40210', outcome: 'delivered' });
  assert.equal(sh.scoreOf('constructor', '40210').samples, 1);
  assert.equal(/** @type {any} */ ({}).delivered, undefined);
  assert.equal(/** @type {any} */ (Object).delivered, undefined);
});

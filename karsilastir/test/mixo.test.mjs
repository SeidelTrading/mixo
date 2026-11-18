import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { mixoComparison, mixoSummary } from '../db/mixo.mjs';

test('Mixoutlet kapsama ve fark: en az bir rakip fiyatı olan ürünler sayılır', () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'mixo-')));
  const now = Date.now();
  const mixo = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'www.mixoutlet.de' }));
  const rival = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'Rakip', domain: 'rakip.test', shippingDefault: 5 }));
  const row = (ean, price, n) => ({
    ean,
    title: 'Ürün ' + n,
    brand: 'X',
    price,
    url: `https://s.test/${ean}`,
    inStock: true,
  });
  ingestOffer(db, mixo, row('4006381333931', 100, 1), now);
  ingestOffer(db, mixo, row('4006381333948', 50, 2), now);
  ingestOffer(db, mixo, { title: 'EANsız', price: 10, url: 'https://m.test/x' }, now);
  ingestOffer(db, rival, row('4006381333931', 80, 1), now); // toplam 85
  const s = mixoSummary(db, now, 30, 44862);
  assert.equal(s.total, 44862);
  assert.equal(s.known, 3);
  assert.equal(s.withEan, 2);
  assert.equal(s.covered, 1);
  assert.deepEqual(s.byShop, [{ name: 'Rakip', n: 1 }]);
  const c = mixoComparison(db, now, 30);
  const mixoDiff = Math.round((c.items[0].mixo - 85) * 100) / 100;
  assert.equal(c.total, 1);
  assert.equal(c.items[0].diff, mixoDiff);
  assert.equal(c.items[0].best, 85);
  assert.equal(c.items[0].pct, 17.6);
  db.close();
});

// ---- MPN yolu: EAN'sız Mixoutlet satırı ile EAN'sız rakip satırı, aynı marka+mpn anahtarı ----
function mpnSetup() {
  const db = openDb(mkdtempSync(join(tmpdir(), 'mixo-mpn-')));
  const shop = (name, domain, shippingDefault = 0) =>
    db
      .prepare('SELECT * FROM shops WHERE id = ?')
      .get(addShop(db, { market: 'de', name, domain, shippingDefault }));
  return {
    db,
    mixo: shop('Mixoutlet', 'mixoutlet.de'),
    rival: shop('Rakip', 'rakip.test', 5),
    rival2: shop('Rakip2', 'rakip2.test'),
  };
}
const casio = (url, price, mpn = 'EFB-109D-7AVEF') => ({
  title: 'Casio Edifice ' + mpn,
  brand: 'Casio',
  mpn,
  price,
  url,
  inStock: true,
});

test("MPN yolu: EAN'sız ikisi aynı anahtarda -> covered, coveredByMpn, matchType mpn, fark doğru", () => {
  const { db, mixo, rival } = mpnSetup();
  const now = Date.now();
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 139, 'EFB 109D 7AVEF'), now); // toplam 144
  const s = mixoSummary(db, now, 30, 100);
  assert.equal(s.known, 1);
  assert.equal(s.withEan, 0);
  assert.equal(s.covered, 1);
  assert.equal(s.coveredByMpn, 1);
  assert.equal(s.coveredEan, 0);
  assert.equal(s.cheaper, 0);
  assert.deepEqual(s.byShop, [{ name: 'Rakip', n: 1 }]);
  const c = mixoComparison(db, now, 30);
  assert.equal(c.total, 1);
  const it = c.items[0];
  assert.equal(it.matchType, 'mpn');
  assert.equal(it.ean, null);
  assert.equal(it.id, 'mpn:casio|efb109d7avef');
  assert.equal(it.title, 'Casio Edifice EFB-109D-7AVEF');
  assert.equal(it.mixoUrl, 'https://mixoutlet.de/products/casio-1');
  assert.equal(it.best, 144);
  assert.equal(it.diff, 20.41);
  assert.equal(it.pct, 14.2);
  assert.equal(it.rivals[0].url, 'https://rakip.test/casio-1');
  db.close();
});

test('MPN yolu: EAN yolundaki satırlar matchType ean taşır ve birlikte sayılır', () => {
  const { db, mixo, rival } = mpnSetup();
  const now = Date.now();
  const row = { ean: '4006381333931', title: 'Ürün', brand: 'X', url: 'https://s.test/1', inStock: true };
  ingestOffer(db, mixo, { ...row, price: 100 }, now);
  ingestOffer(db, rival, { ...row, price: 80 }, now); // toplam 85
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 100), now);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 90), now); // toplam 95
  const s = mixoSummary(db, now, 30, 100);
  assert.deepEqual([s.covered, s.coveredEan, s.coveredByMpn], [2, 1, 1]);
  assert.deepEqual(s.byShop, [{ name: 'Rakip', n: 2 }]);
  const c = mixoComparison(db, now, 30);
  assert.deepEqual(c.items.map(i => i.matchType).sort(), ['ean', 'mpn']);
  db.close();
});

test("MPN yolu: aynı anahtar iki farklı EAN'lı ürüne denk geliyorsa ya da iki Mixoutlet satırı varsa sayılmaz", () => {
  const { db, mixo, rival, rival2 } = mpnSetup();
  const now = Date.now();
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 139), now);
  // anahtar products tablosunda iki ürüne denk gelir: belirsiz
  for (const ean of ['4006381333931', '96385074'])
    ingestOffer(db, rival2, { ...casio('https://rakip2.test/' + ean, 150), ean }, now);
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 0);
  assert.equal(mixoComparison(db, now, 30).total, 0);
  db.close();

  const t = mpnSetup();
  ingestOffer(t.db, t.mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now);
  ingestOffer(t.db, t.mixo, casio('https://mixoutlet.de/products/casio-2', 170), now); // aynı anahtar, ikinci Mixoutlet satırı
  ingestOffer(t.db, t.rival, casio('https://rakip.test/casio-1', 139), now);
  assert.equal(mixoSummary(t.db, now, 30, 100).coveredByMpn, 0);
  t.db.close();
});

test('MPN yolu: bayat rakip sayılmaz; aynı rakipte aynı anahtarlı 2 satır belirsizdir; stoksuz rakip karşılaştırmada yok', () => {
  const { db, mixo, rival, rival2 } = mpnSetup();
  const now = Date.now();
  const DAY = 86400000;
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 139), now - 40 * DAY); // maxAgeDays dışı
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 0);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 139), now - 2 * DAY);
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 1);
  // Aynı rakipte aynı anahtarı taşıyan ikinci satır (renk/ebat varyantı olabilir): en ucuzu seçmek başka ürünün
  // fiyatını gösterirdi, bu yüzden o rakip hiç eşleşmez.
  ingestOffer(db, rival, casio('https://rakip.test/casio-1b', 120), now);
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 0);
  assert.equal(mixoComparison(db, now, 30).total, 0);
  // Anahtarı tek satırla taşıyan başka rakip eşleşir; belirsiz rakip yine dışarıda kalır.
  ingestOffer(db, rival2, casio('https://rakip2.test/casio-1', 130), now);
  const s = mixoSummary(db, now, 30, 100);
  assert.equal(s.coveredByMpn, 1);
  assert.deepEqual(s.byShop, [{ name: 'Rakip2', n: 1 }]);
  assert.equal(mixoComparison(db, now, 30).items[0].best, 130);
  ingestOffer(db, rival2, { ...casio('https://rakip2.test/casio-1', 130), inStock: false }, now);
  assert.equal(mixoComparison(db, now, 30).total, 0); // stokta rakip kalmadı
  db.close();
});

test('Mixoutlet tarafı bayatsa (kaldırılmış ürün) karşılaştırılmaz: MPN ve EAN yolu', () => {
  const { db, mixo, rival } = mpnSetup();
  const now = Date.now();
  const DAY = 86400000;
  // MPN yolu: 400 gün önce görülen Mixoutlet satırı taze rakiple eşleşmez.
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now - 400 * DAY);
  ingestOffer(db, rival, casio('https://rakip.test/casio-1', 139), now);
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 0);
  assert.equal(mixoComparison(db, now, 30).total, 0);
  // yeniden görülünce (taze) eşleşir; 30 günlük yeniden kontrol aralığı payı içinde kalan satır da eşleşir
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/casio-1', 164.41), now - 34 * DAY);
  assert.equal(mixoSummary(db, now, 30, 100).coveredByMpn, 1);
  // EAN yolu: bayat Mixoutlet teklifi karşılaştırılmaz
  const row = (price, url) => ({
    ean: '4006381333931',
    title: 'Ürün',
    brand: 'X',
    price,
    url,
    inStock: true,
  });
  ingestOffer(db, mixo, row(100, 'https://mixoutlet.de/products/e'), now - 400 * DAY);
  ingestOffer(db, rival, row(80, 'https://rakip.test/e'), now);
  assert.equal(mixoSummary(db, now, 30, 100).coveredEan, 0);
  assert.equal(mixoComparison(db, now, 30).items.filter(i => i.matchType === 'ean').length, 0);
  ingestOffer(db, mixo, row(100, 'https://mixoutlet.de/products/e'), now);
  assert.equal(mixoSummary(db, now, 30, 100).coveredEan, 1);
  db.close();
});

test('mixoComparison: hazır list verilirse sorgu yeniden çalışmaz, sonuç aynı; sıralama ve sayfalama list üzerinde', async () => {
  const { mixoList } = await import('../db/mixo.mjs');
  const { db, mixo, rival } = mpnSetup();
  const now = Date.now();
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/c1', 164.41), now);
  ingestOffer(db, rival, casio('https://rakip.test/c1', 139), now);
  ingestOffer(db, mixo, casio('https://mixoutlet.de/products/c2', 100, 'SRPK99K1'), now);
  ingestOffer(db, rival, casio('https://rakip.test/c2', 120, 'SRPK99K1'), now);
  const list = mixoList(db, now, 30);
  assert.equal(list.length, 2);
  db.prepare('DELETE FROM unmatched').run(); // list hazırsa veritabanına bakılmaz
  const a = mixoComparison(db, now, 30, { list, sort: 'diff' });
  assert.equal(a.total, 2);
  assert.equal(a.items[0].id, 'mpn:casio|efb109d7avef'); // Mixoutlet en pahalı önce
  assert.equal(
    mixoComparison(db, now, 30, { list, sort: 'cheap', limit: 1, offset: 1 }).items[0].id,
    'mpn:casio|efb109d7avef',
  );
  db.close();
});

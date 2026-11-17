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

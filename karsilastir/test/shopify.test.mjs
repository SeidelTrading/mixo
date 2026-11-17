import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { createCrawler, mixoTargets, urlMatches } from '../crawler/crawler.mjs';

const product = (n, extra = {}) => ({
  id: n,
  handle: `p-${n}`,
  title: `Uhr ${n}`,
  vendor: 'Casio',
  product_type: 'Uhren',
  images: [{ src: 'https://cdn.test/i.jpg' }],
  variants: [{ id: n * 10, sku: `GA-${n}00`, price: '99.00', available: true, ...extra }],
});

function setup(pages) {
  const db = openDb(mkdtempSync(join(tmpdir(), 'shopify-')));
  const id = addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' });
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
    const page = Number(u.searchParams.get('page'));
    return new Response(JSON.stringify({ products: pages[page - 1] ?? [] }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };
  const limiter = { run: (_h, fn) => fn() };
  const crawler = createCrawler({ db, siteUrl: 'https://k.test', fetchImpl, limiter });
  return { db, id, crawler, calls };
}

test('Shopify döküm: sayfa sayfa ilerler, mpn ve barkod işlenir, ilerleme saklanır', async () => {
  const full = Array.from({ length: 250 }, (_, i) => product(i + 1));
  const { db, id, crawler } = setup([full, [product(900, { barcode: '4006381333931' })]]);
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
  const a = await crawler.importShopify(shop, { pages: 1 });
  assert.deepEqual([a.pages, a.products, a.done], [1, 250, false]);
  assert.equal(crawler.getState(`shopify:${id}`), '2');
  const b = await crawler.importShopify(shop, { pages: 5 });
  assert.equal(b.done, true);
  assert.equal(b.products, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM unmatched').get().n, 250);
  assert.equal(db.prepare('SELECT count(*) n FROM offers').get().n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM seeds WHERE source = 'catalog'").get().n, 251);
  assert.equal(db.prepare('SELECT mpn FROM unmatched WHERE url LIKE ?').get('%/p-7').mpn, 'GA-700');
  db.close();
});

test('hedefli tarama: URL parça numarası eşleşmesi ve hedef kümesi', async () => {
  const { db, id, crawler } = setup([[product(1)]]);
  await crawler.importShopify(db.prepare('SELECT * FROM shops WHERE id = ?').get(id));
  const t = mixoTargets(db);
  assert.ok(t.has('ga100'));
  assert.equal(urlMatches('https://r.test/casio-uhr-ga-100-schwarz', t), true);
  assert.equal(urlMatches('https://r.test/casio-uhr-ga-101', t), false);
  db.close();
});

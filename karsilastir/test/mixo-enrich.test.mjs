import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { mixoSummary } from '../db/mixo.mjs';
import { createCrawler } from '../crawler/crawler.mjs';
import { createMixoEnricher, enrichPriority, handlePriority } from '../crawler/mixoEnrich.mjs';
import { planRequests, readDemo, runTrial, sampleDemo } from '../scripts/mixo-trial.mjs';

const XML = { headers: { 'content-type': 'application/xml' } };
const JSONH = { headers: { 'content-type': 'application/json; charset=utf-8' } };
const index = urls =>
  `<?xml version="1.0"?><sitemapindex>${urls.map(u => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`;
const urlset = urls =>
  `<?xml version="1.0"?><urlset>${urls.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
const prod = (handle, extra = {}, v = {}) => ({
  id: 1,
  handle,
  title: extra.title ?? 'Digitus DA-90370 Standfuß',
  vendor: extra.vendor ?? 'Digitus',
  product_type: 'Kabel',
  body_html: extra.body_html ?? '',
  images: [{ src: 'https://cdn.test/i.jpg' }],
  variants: [{ id: 11, sku: 'BA-820009', price: '251.92', barcode: '4016032428589', ...v }],
});

/** Sahte Mixoutlet: robots, site haritası, ürün .json ve products.json. */
function setup({
  robots = 'User-agent: *\nAllow: /\n',
  json = {},
  maps,
  listing = [],
  now = () => Date.now(),
} = {}) {
  const db = openDb(mkdtempSync(join(tmpdir(), 'enrich-')));
  const id = addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' });
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
  const calls = [];
  const sitemaps = maps ?? {
    '/sitemap.xml': index([
      'https://mixoutlet.de/sitemap_products_1.xml?from=1&to=2',
      'https://mixoutlet.de/sitemap_pages_1.xml',
      'https://mixoutlet.de/sitemap_products_2.xml?from=3&to=3',
    ]),
    '/sitemap_products_1.xml': urlset([
      'https://mixoutlet.de/products/a-1',
      'https://mixoutlet.de/products/b-2',
    ]),
    '/sitemap_products_2.xml': urlset(['https://mixoutlet.de/products/c-3', 'https://mixoutlet.de/']),
  };
  const fetchImpl = async url => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === '/robots.txt')
      return new Response(robots, { headers: { 'content-type': 'text/plain' } });
    if (sitemaps[u.pathname]) return new Response(sitemaps[u.pathname], XML);
    if (u.pathname === '/products.json') {
      const page = Number(u.searchParams.get('page'));
      return new Response(JSON.stringify({ products: listing[page - 1] ?? [] }), JSONH);
    }
    const m = /^\/products\/(.+)\.json$/.exec(u.pathname);
    if (m) {
      const r = json[m[1]];
      if (r === undefined || r === 404) return new Response('{}', { status: 404, headers: JSONH.headers });
      if (typeof r === 'number') return new Response('x', { status: r });
      return new Response(JSON.stringify({ product: r }), JSONH);
    }
    return new Response('nope', { status: 404 });
  };
  const crawler = createCrawler({
    db,
    siteUrl: 'https://k.test',
    fetchImpl,
    limiter: { run: (_h, fn) => fn() },
    now,
  });
  const enricher = createMixoEnricher({ db, get: crawler.guardedGet, now, ownFast: true });
  const jsonCalls = () => calls.filter(c => c.endsWith('.json') && !c.includes('products.json'));
  return { db, shop, id, calls, crawler, enricher, jsonCalls };
}
const queue = (db, shopId, rows) =>
  rows.forEach(([h, prio = 1, price = null]) =>
    db
      .prepare('INSERT INTO mixo_enrich (handle, shopId, priority, price) VALUES (?, ?, ?, ?)')
      .run(h, shopId, prio, price),
  );
const state = (db, h) => ({
  ...db.prepare('SELECT status, ean, checkedAt FROM mixo_enrich WHERE handle = ?').get(h),
});

test('seedHandles: site haritası dizini ve alt haritalar okunur, handle yazılır, kopya olmaz', async () => {
  const { db, shop, enricher, calls } = setup();
  const a = await enricher.seedHandles(shop);
  assert.equal(a.total, 3);
  assert.equal(a.added, 3);
  assert.deepEqual(
    db
      .prepare('SELECT handle FROM mixo_enrich ORDER BY handle')
      .all()
      .map(r => r.handle),
    ['a-1', 'b-2', 'c-3'],
  );
  assert.ok(!calls.some(c => c.includes('sitemap_pages'))); // ürün olmayan harita istenmez
  const b = await enricher.seedHandles(shop);
  assert.equal(b.added, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM mixo_enrich').get().n, 3);
  db.close();
});

test('seedHandles: gone olan handle site haritasında yeniden görülürse sıfırlanır; günlük sınır seedDue', async () => {
  let t = 1_000_000_000_000;
  const { db, shop, enricher } = setup({ now: () => t });
  assert.equal(enricher.seedDue(shop), true);
  await enricher.seedHandles(shop);
  assert.equal(enricher.seedDue(shop), false);
  t += 25 * 3600 * 1000;
  assert.equal(enricher.seedDue(shop), true);
  db.prepare("UPDATE mixo_enrich SET status = 'gone', checkedAt = 5 WHERE handle = 'a-1'").run();
  db.prepare("UPDATE mixo_enrich SET status = 'ok', checkedAt = 5 WHERE handle = 'b-2'").run();
  await enricher.seedHandles(shop);
  assert.deepEqual(state(db, 'a-1'), { status: null, ean: null, checkedAt: null });
  assert.equal(state(db, 'b-2').status, 'ok'); // gone olmayana dokunulmaz
  db.close();
});

test("enrichBatch: barkodlu .json -> EAN'lı teklif, unmatched satırı silinir, withEan artar", async () => {
  const { db, shop, id, enricher } = setup({ json: { 'p-1': prod('p-1') } });
  queue(db, id, [['p-1']]);
  // importShopify'dan kalan EAN'sız satır (aynı URL)
  db.prepare(
    "INSERT INTO unmatched (shopId, title, price, currency, url, seenAt, brand, mpn) VALUES (?, 'x', 251.92, 'EUR', ?, 1, 'Digitus', 'DA-90370')",
  ).run(id, 'https://mixoutlet.de/products/p-1');
  assert.equal(mixoSummary(db, Date.now(), 30, 100).withEan, 0);
  const r = await enricher.enrichBatch(shop, { limit: 5 });
  assert.deepEqual([r.checked, r.ok, r.offers], [1, 1, 1]);
  const o = db.prepare('SELECT ean, price, url FROM offers WHERE shopId = ?').get(id);
  assert.deepEqual(
    { ...o },
    { ean: '4016032428589', price: 251.92, url: 'https://mixoutlet.de/products/p-1' },
  );
  assert.equal(db.prepare('SELECT count(*) n FROM unmatched WHERE shopId = ?').get(id).n, 0);
  assert.deepEqual(state(db, 'p-1').status, 'ok');
  assert.equal(state(db, 'p-1').ean, '11:4016032428589');
  assert.equal(db.prepare('SELECT mpn FROM products WHERE ean = ?').get('4016032428589').mpn, 'DA-90370');
  const s = mixoSummary(db, Date.now(), 30, 100);
  assert.equal(s.withEan, 1);
  assert.equal(s.known, 1);
  db.close();
});

test('enrichBatch: çok varyantlı üründe her barkod ayrı teklif (?variant=)', async () => {
  const p = prod('multi-1');
  p.variants = [
    { id: 21, sku: 'x', price: '10.00', barcode: '4006381333931' },
    { id: 22, sku: 'y', price: '12.00', barcode: '96385074' },
  ];
  const { db, shop, id, enricher } = setup({ json: { 'multi-1': p } });
  queue(db, id, [['multi-1']]);
  await enricher.enrichBatch(shop);
  assert.deepEqual(
    db
      .prepare('SELECT url FROM offers ORDER BY url')
      .all()
      .map(r => r.url),
    ['https://mixoutlet.de/products/multi-1?variant=21', 'https://mixoutlet.de/products/multi-1?variant=22'],
  );
  db.close();
});

test('enrichBatch: barkodsuz .json -> unmatched kalır, gerçek MPN yazılır, iç kod yazılmaz, status no-barcode', async () => {
  const f = prod(
    'casio-1',
    { title: 'Casio Edifice EFB-109D-7AVEF Herren-Armbanduhr', vendor: 'Casio' },
    { sku: 'UHREN1-EFB-109D-7AVEF', barcode: '', price: '164.41' },
  );
  const g = prod(
    'afnan-1',
    { title: 'Afnan 9 pm Rebel Eau de Parfum 100 ml', vendor: 'Afnan' },
    { sku: 'arp-17', barcode: null, price: '68.99' },
  );
  const { db, shop, id, enricher } = setup({ json: { 'casio-1': f, 'afnan-1': g } });
  queue(db, id, [['casio-1'], ['afnan-1']]);
  const r = await enricher.enrichBatch(shop);
  assert.deepEqual([r.noBarcode, r.ok, r.offers], [2, 0, 0]);
  assert.equal(state(db, 'casio-1').status, 'no-barcode');
  const u = db
    .prepare('SELECT url, mpn, mpnKey, sku FROM unmatched ORDER BY url')
    .all()
    .map(x => ({ ...x }));
  assert.deepEqual(u, [
    { url: 'https://mixoutlet.de/products/afnan-1', mpn: null, mpnKey: null, sku: 'arp-17' },
    {
      url: 'https://mixoutlet.de/products/casio-1',
      mpn: 'EFB-109D-7AVEF',
      mpnKey: 'casio|efb109d7avef',
      sku: 'UHREN1-EFB-109D-7AVEF',
    },
  ]);
  assert.equal(db.prepare('SELECT count(*) n FROM offers').get().n, 0);
  db.close();
});

test('enrichBatch: 404 -> gone ve bir daha denenmez; 5xx -> hata, ertesi gün yeniden', async () => {
  let t = 1_000_000_000_000;
  const { db, shop, id, enricher, jsonCalls } = setup({ json: { gone: 404, bad: 500 }, now: () => t });
  queue(db, id, [['gone'], ['bad']]);
  const r = await enricher.enrichBatch(shop);
  assert.deepEqual([r.gone, r.errors], [1, 1]);
  assert.equal(state(db, 'gone').status, 'gone');
  assert.equal(state(db, 'bad').status, 'http-500');
  assert.equal(jsonCalls().length, 2);
  assert.equal((await enricher.enrichBatch(shop)).checked, 0); // hata 1 gün dolmadan, gone hiç
  t += 25 * 3600 * 1000;
  const r2 = await enricher.enrichBatch(shop);
  assert.equal(r2.checked, 1); // yalnız hata alan; gone yok
  assert.equal(jsonCalls().filter(c => c.includes('/gone.json')).length, 1);
  db.close();
});

test('enrichBatch: yeniden kontrol aralıkları (ok 7 gün, no-barcode 30 gün)', async () => {
  let t = 1_000_000_000_000;
  const { db, shop, id, enricher } = setup({
    json: { a: prod('a'), b: prod('b', {}, { barcode: '' }) },
    now: () => t,
  });
  queue(db, id, [['a'], ['b']]);
  await enricher.enrichBatch(shop);
  assert.equal(state(db, 'a').status, 'ok');
  assert.equal(state(db, 'b').status, 'no-barcode');
  t += 6 * 24 * 3600 * 1000;
  assert.equal((await enricher.enrichBatch(shop)).checked, 0);
  t += 2 * 24 * 3600 * 1000; // 8 gün: ok yeniden, no-barcode değil
  const r = await enricher.enrichBatch(shop);
  assert.equal(r.checked, 1);
  assert.equal(r.ok, 1);
  t += 25 * 24 * 3600 * 1000; // 33 gün: no-barcode da yeniden
  assert.equal((await enricher.enrichBatch(shop)).checked, 2);
  db.close();
});

test('enrichBatch: robots /products/*.json yasaklarsa .json isteği atılmaz ve tur durur', async () => {
  const robots = 'User-agent: *\nDisallow: /products/*.json\n';
  const { db, shop, id, enricher, jsonCalls } = setup({
    robots,
    json: { 'p-1': prod('p-1'), 'p-2': prod('p-2') },
  });
  queue(db, id, [['p-1'], ['p-2']]);
  const r = await enricher.enrichBatch(shop);
  assert.equal(jsonCalls().length, 0);
  assert.equal(r.stopped, 'robots-disallowed');
  assert.equal(r.checked, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM offers').get().n, 0);
  db.close();
});

test('enrichBatch: 403 gelirse host bekletilir, tur durur, satır işaretlenmez', async () => {
  const { db, shop, id, enricher, jsonCalls } = setup({ json: { 'p-1': 403, 'p-2': prod('p-2') } });
  queue(db, id, [
    ['p-1', 3],
    ['p-2', 1],
  ]);
  const r = await enricher.enrichBatch(shop);
  assert.match(r.stopped, /^backoff/);
  assert.equal(jsonCalls().length, 1); // p-2'ye gidilmedi
  assert.equal(state(db, 'p-1').checkedAt, null);
  assert.equal(db.prepare('SELECT count(*) n FROM host_backoff').get().n, 1);
  db.close();
});

test("öncelik: BA- sku'lu BT markası önce; handle önekinden de tahmin edilir", async () => {
  assert.equal(enrichPriority('DeLOCK', 'BA-21150232'), 3);
  assert.equal(enrichPriority('Digitus', 'BA-1'), 3);
  assert.equal(enrichPriority('Papier GmbH', 'BA-1'), 2);
  assert.equal(enrichPriority('Festina', 'F20636-1'), 1);
  assert.equal(enrichPriority('Casio', 'UHREN1-EFB-109D-7AVEF'), 2);
  assert.equal(enrichPriority('3DPLady', 'BA-5'), 0);
  assert.ok(enrichPriority('DeLOCK', 'BA-1') > enrichPriority('Festina', 'F20636-1'));
  assert.equal(handlePriority('delock-kabel-1m'), 3);
  assert.equal(handlePriority('watch-972f3d74'), 2);
  assert.equal(handlePriority('festina-f20636-1-armbanduhr'), 1);
  const json = { fest: prod('fest'), del: prod('del'), cheap: prod('cheap'), dear: prod('dear') };
  const { db, shop, id, enricher, jsonCalls } = setup({ json });
  queue(db, id, [
    ['fest', enrichPriority('Festina', 'F1'), 500],
    ['cheap', 3, 5],
    ['del', enrichPriority('DeLOCK', 'BA-1'), 10],
    ['dear', 3, 900],
  ]);
  await enricher.enrichBatch(shop, { limit: 4 });
  assert.deepEqual(
    jsonCalls().map(c => c.split('/').pop()),
    ['dear.json', 'del.json', 'cheap.json', 'fest.json'],
  );
  db.close();
});

test('enrichBatch: limit ve devam, iki çağrıda 5+5 farklı ürün; varsayılan limit ownFast ile 140, değilse 25', async () => {
  const hs = Array.from({ length: 10 }, (_, i) => `h-${i}`);
  const { db, shop, id, enricher, jsonCalls, crawler } = setup({
    json: Object.fromEntries(hs.map(h => [h, prod(h, {}, { barcode: '' })])),
  });
  queue(
    db,
    id,
    hs.map(h => [h]),
  );
  assert.equal((await enricher.enrichBatch(shop, { limit: 5 })).checked, 5);
  assert.equal((await enricher.enrichBatch(shop, { limit: 5 })).checked, 5);
  assert.equal(new Set(jsonCalls()).size, 10);
  assert.equal((await enricher.enrichBatch(shop, { limit: 5 })).checked, 0);
  // varsayılan limit
  const slow = createMixoEnricher({ db, get: crawler.guardedGet, ownFast: false });
  db.prepare('UPDATE mixo_enrich SET status = NULL, checkedAt = NULL').run();
  for (let i = 0; i < 30; i++) queue(db, id, [[`x-${i}`]]);
  assert.equal((await slow.enrichBatch(shop)).checked, 25);
  db.close();
});

test('importListing: bilinen EAN ile ingest, bilinmeyen gerçek MPN ile unmatched + kuyruğa; catalog tohumu eklenmez', async () => {
  const known = prod('known-1', {}, { barcode: undefined });
  const fresh = prod(
    'casio-1',
    { title: 'Casio Edifice EFB-109D-7AVEF', vendor: 'Casio' },
    { id: 31, sku: 'UHREN1-EFB-109D-7AVEF', barcode: undefined, price: '164.41', available: true },
  );
  known.variants[0] = { id: 11, sku: 'BA-820009', price: '240.00', available: false };
  const { db, shop, id, enricher } = setup({ listing: [[known, fresh]] });
  queue(db, id, [['known-1']]);
  db.prepare(
    "UPDATE mixo_enrich SET status = 'ok', checkedAt = 1, ean = '11:4016032428589' WHERE handle = 'known-1'",
  ).run();
  const r = await enricher.importListing(shop, { pages: 3 });
  assert.deepEqual([r.pages, r.products, r.done], [1, 2, true]);
  const o = db.prepare('SELECT ean, price, inStock FROM offers WHERE shopId = ?').get(id);
  assert.deepEqual({ ...o }, { ean: '4016032428589', price: 240, inStock: 0 }); // fiyat ve stok tazelendi
  const u = db
    .prepare('SELECT url, mpn FROM unmatched WHERE shopId = ?')
    .all(id)
    .map(x => ({ ...x }));
  assert.deepEqual(u, [{ url: 'https://mixoutlet.de/products/casio-1', mpn: 'EFB-109D-7AVEF' }]); // bilinen için satır yok
  assert.equal(state(db, 'casio-1').status, null); // .json ile sorulacak
  assert.equal(db.prepare('SELECT count(*) n FROM seeds').get().n, 0);
  assert.equal(enricher.getState(`shopify:${id}`), '1');
  assert.ok(Number(enricher.getState(`shopify-done:${id}`)) > 0);
  db.close();
});

test('importListing: 100. sayfada biter (101. istenmez), ilerleme saklanır', async () => {
  const full = Array.from({ length: 250 }, (_, i) =>
    prod(`p-${i}`, {}, { id: i, barcode: undefined, sku: 'x' }),
  );
  const listing = [full, full];
  listing[99] = full; // 100. sayfa dolu: 101. sayfa hiç istenmez (ölçüldü: boş döner)
  const { db, shop, id, enricher, calls } = setup({ listing });
  const a = await enricher.importListing(shop, { pages: 1 });
  assert.deepEqual([a.pages, a.done], [1, false]);
  assert.equal(enricher.getState(`shopify:${id}`), '2');
  db.prepare(
    "INSERT INTO crawl_state (key, value, updatedAt) VALUES (?, '100', 1) ON CONFLICT(key) DO UPDATE SET value = '100'",
  ).run(`shopify:${id}`);
  const b = await enricher.importListing(shop, { pages: 5 });
  assert.deepEqual([b.pages, b.done], [1, true]);
  assert.equal(enricher.getState(`shopify:${id}`), '1');
  assert.ok(Number(enricher.getState(`shopify-done:${id}`)) > 0);
  assert.ok(calls.some(c => c.includes('page=100')));
  assert.ok(!calls.some(c => c.includes('page=101')));
  db.close();
});

// ---- scripts/mixo-trial.mjs ----
/** Geçerli (kontrol haneli) 13 haneli EAN üretir. */
function ean13(n) {
  const d = `400638${String(n).padStart(6, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (sum % 10)) % 10);
}

function demoDir() {
  const dir = mkdtempSync(join(tmpdir(), 'demo-'));
  const rows = [];
  const mk = (brand, title, n, k) => {
    for (let i = 0; i < n; i++)
      rows.push([
        `${brand.toLowerCase()}-${k}-${i}`,
        `${brand} ${title} ${i}`,
        brand,
        10 + i,
        0,
        'x.jpg',
        0,
        0,
      ]);
  };
  mk('DeLOCK', 'Kabel', 40, 'a');
  mk('EFB Elektronik', 'Patchkabel', 20, 'b');
  mk('Epson', 'Tinte T346', 15, 'c');
  mk('Festina', 'Armbanduhr', 12, 'd');
  mk('Lattafa', 'Eau de Parfum', 10, 'e');
  mk('Ünbekannt', 'Ding', 30, 'f');
  const half = Math.ceil(rows.length / 2);
  mkdirSync(join(dir, 'x'), { recursive: true });
  writeFileSync(join(dir, 'all-0.js'), `MXC("all",0,${JSON.stringify(rows.slice(0, half))})`);
  writeFileSync(join(dir, 'all-1.js'), `MXC("all",1,${JSON.stringify(rows.slice(half))})`);
  writeFileSync(join(dir, 'chunks.js'), 'MXC("x",0,[])'); // all-N olmayan dosya yok sayılır
  return dir;
}

test('mixo-trial: tohumlu katmanlı 40 ürünlük örneklem, aynı tohum aynı sonuç; --dry-run ağ isteği atmaz', async () => {
  const dir = demoDir();
  const rows = readDemo(dir);
  assert.equal(rows.length, 127);
  const a = sampleDemo(rows, { n: 40, seed: 42 });
  const b = sampleDemo(rows, { n: 40, seed: 42 });
  const c = sampleDemo(rows, { n: 40, seed: 7 });
  assert.equal(a.length, 40);
  assert.deepEqual(
    a.map(r => r.handle),
    b.map(r => r.handle),
  );
  assert.notDeepEqual(
    a.map(r => r.handle),
    c.map(r => r.handle),
  );
  assert.equal(new Set(a.map(r => r.handle)).size, 40);
  const g = {};
  for (const r of a) g[r.group] = (g[r.group] ?? 0) + 1;
  assert.deepEqual(g, { bt: 22, printer: 8, watch: 6, perfume: 4 });
  let fetched = 0;
  const res = await runTrial({
    demo: dir,
    n: 40,
    seed: 42,
    shops: ['reichelt.de', 'alternate.de'],
    dryRun: true,
    fetchImpl: () => (fetched++, Promise.reject(new Error('ağ yok'))),
  });
  assert.equal(fetched, 0);
  assert.equal(res.dryRun, true);
  assert.equal(res.n, 40);
  assert.equal(res.plan.mixoEnrich.requests, 41);
  assert.ok(res.plan.total > 41);
  assert.equal(planRequests({ sample: a, shops: [] }).total, 41);
});

test('mixo-trial: sahte fetch ile sayımlar doğru raporlanır', async () => {
  const dir = demoDir();
  const out = join(mkdtempSync(join(tmpdir(), 'trial-')), 'sonuc.json');
  const dbd = mkdtempSync(join(tmpdir(), 'trialdb-'));
  let seq = 0;
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
    const m = /^\/products\/(.+)\.json$/.exec(u.pathname);
    if (m) {
      const hasBarcode = m[1].startsWith('delock');
      return new Response(
        JSON.stringify({
          product: prod(
            m[1],
            { title: `Delock Kabel DA-9${m[1].length}0`, vendor: 'DeLOCK' },
            { barcode: hasBarcode ? ean13(++seq) : '' },
          ),
        }),
        JSONH,
      );
    }
    return new Response('x', { status: 404 });
  };
  const res = await runTrial({
    demo: dir,
    n: 20,
    seed: 42,
    shops: [],
    dbDir: dbd,
    out,
    fetchImpl,
    ownIntervalMs: 0,
    log: () => {},
  });
  assert.equal(res.n, 20);
  assert.equal(res.enrich.checked, 20);
  const delock = res.groups.bt; // örneklemde DeLOCK + EFB BT grubundadır
  assert.ok(delock > 0);
  assert.ok(res.withEan > 0 && res.withEan <= 20);
  assert.equal(res.withEan + res.enrich.noBarcode + res.enrich.errors + res.enrich.gone, 20);
  assert.equal(res.mpn, 20); // başlıkta DA-9nn0 var: hepsinden MPN çıkar (barkodlu da barkodsuz da)
  assert.equal(res.covered, 0);
  assert.equal(res.requestsByHost['mixoutlet.de'], 21); // robots + 20 .json
  assert.ok(!calls.some(c => !c.startsWith('https://mixoutlet.de/')));
  const saved = JSON.parse(readFileSyncSafe(out));
  assert.equal(saved.withEan, res.withEan);
});
import { readFileSync } from 'node:fs';
const readFileSyncSafe = p => readFileSync(p, 'utf8');

test('enrichBatch: 404 (gone) ürünün bayat unmatched ve EAN teklifleri silinir; başka ürüne dokunulmaz', async () => {
  const { db, shop, id, enricher } = setup({ json: { 'old-1': 404, 'live-1': prod('live-1') } });
  queue(db, id, [['old-1'], ['live-1']]);
  const ins = (url, ean) => {
    db.prepare("INSERT OR IGNORE INTO products (ean, title, createdAt) VALUES (?, 'p', 1)").run(ean);
    db.prepare(
      `INSERT INTO offers (shopId, ean, price, currency, shipping, url, inStock, seenAt) VALUES (?, ?, 10, 'EUR', 0, ?, 1, 1)`,
    ).run(id, ean, url);
  };
  ins('https://mixoutlet.de/products/old-1', '4006381333931');
  ins('https://mixoutlet.de/products/old-1?variant=7', '4006381333948');
  ins('https://mixoutlet.de/products/old-10', '4006381333955'); // ön ek benzeri başka ürün
  db.prepare(
    `INSERT INTO unmatched (shopId, title, price, currency, shipping, url, inStock, seenAt) VALUES (?, 'x', 5, 'EUR', 0, 'https://mixoutlet.de/products/old-1', 1, 1)`,
  ).run(id);
  const r = await enricher.enrichBatch(shop);
  assert.equal(r.gone, 1);
  assert.deepEqual(
    db
      .prepare('SELECT url FROM offers WHERE url LIKE ? ORDER BY url')
      .all('%/old-%')
      .map(x => x.url),
    ['https://mixoutlet.de/products/old-10'],
  );
  assert.equal(db.prepare("SELECT count(*) n FROM unmatched WHERE url LIKE '%/old-1'").get().n, 0);
  db.close();
});

test('enrichBatch: barkodsuz çok varyantlı üründe her turda aynı (ilk) varyant; başlık MPN anahtara yazılmaz', async () => {
  const p = prod(
    'lattafa-1',
    { title: 'Lattafa Parfüm', vendor: 'Lattafa', body_html: 'Herstellernummer: LKH12345' },
    { sku: 'arp-1', barcode: '', price: '19.90' },
  );
  p.variants.push({ id: 12, sku: 'arp-2', price: '39.90', barcode: '', available: true });
  const { db, shop, id, enricher } = setup({ json: { 'lattafa-1': p }, listing: [[p]] });
  queue(db, id, [['lattafa-1']]);
  const row = () => ({ ...db.prepare('SELECT price, mpn, mpnKey FROM unmatched').get() });
  await enricher.enrichBatch(shop); // .json: 'available' yok
  assert.deepEqual(row(), { price: 19.9, mpn: null, mpnKey: null });
  await enricher.importListing(shop, { pages: 1 }); // products.json: 'available' var, 2. varyant stokta
  assert.deepEqual(row(), { price: 19.9, mpn: null, mpnKey: null });
  db.close();
});

test('enrichBatch: crawl-delay nedeniyle tur satır işaretlemeden durur', async () => {
  const { db, shop, id, enricher } = setup({
    robots: 'User-agent: *\nCrawl-delay: 9999\nAllow: /\n',
    json: { a: prod('a') },
  });
  queue(db, id, [['a'], ['b'], ['c']]);
  const r = await enricher.enrichBatch(shop);
  assert.equal(r.stopped, 'crawl-delay');
  assert.equal(r.checked, 0);
  assert.equal(state(db, 'a').status, null);
  db.close();
});

test('seedHandles: boş harita sonrası 1 saat yeniden denenmez (seedDue), sonra yeniden denenir', async () => {
  let t = 1_000_000_000_000;
  const { db, shop, enricher } = setup({ maps: {}, now: () => t });
  assert.equal(enricher.seedDue(shop), true);
  await enricher.seedHandles(shop);
  assert.equal(enricher.seedDue(shop), false);
  t += 61 * 60 * 1000;
  assert.equal(enricher.seedDue(shop), true);
  db.close();
});

test("enrichBatch: vendor 'uhren2' gibi iç kodsa marka başlığın ilk sözcüğü olur (mpnKey gerçek markayla)", async () => {
  // deneme 2026-11-18: "uhren1|f205931" anahtarı rakipte hiç eşleşmiyordu
  const g = prod(
    'guess-1',
    { title: 'Guess Spec GW0490G3 Herren-Armbanduhr – Quarz, 44 mm', vendor: 'uhren2' },
    { sku: 'UHREN2-GW0490G3', barcode: '', price: '181.67' },
  );
  const { db, shop, id, enricher } = setup({ json: { 'guess-1': g } });
  queue(db, id, [['guess-1']]);
  await enricher.enrichBatch(shop);
  const u = { ...db.prepare('SELECT brand, mpn, mpnKey FROM unmatched').get() };
  assert.deepEqual(u, { brand: 'Guess', mpn: 'GW0490G3', mpnKey: 'guess|gw0490g3' });
  db.close();
});

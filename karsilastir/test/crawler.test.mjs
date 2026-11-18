import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { createCrawler, BOT_TOKEN } from '../crawler/crawler.mjs';
import { RateLimiter } from '../crawler/limiter.mjs';
import { extractProducts } from '../crawler/jsonld.mjs';
import { normalizeEan } from '../lib/ean.mjs';

// Yalnızca yerel test sunucusu: gerçek ağ isteği yok.
const hits = [];
const ld = (name, ean, price) =>
  `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, gtin13: ean, offers: { '@type': 'Offer', price, priceCurrency: 'EUR' } })}</script></html>`;
const server = createServer((req, res) => {
  hits.push({ path: req.url, ua: req.headers['user-agent'], cookie: req.headers.cookie });
  const send = (status, body, type = 'text/html') => (
    res.writeHead(status, { 'content-type': type }),
    res.end(body)
  );
  switch (req.url.split('?')[0]) {
    case '/robots.txt':
      return send(
        200,
        `User-agent: *\nDisallow: /secret/\nSitemap: http://${req.headers.host}/sitemap.xml\n`,
        'text/plain',
      );
    case '/sitemap.xml':
      return send(
        200,
        `<urlset><url><loc>http://${req.headers.host}/p/1</loc></url><url><loc>http://evil.test/x</loc></url></urlset>`,
        'application/xml',
      );
    case '/p/1':
      return send(200, ld('Kulaklık', '4006381333931', '12,50'));
    case '/p/noean':
      return send(200, ld('Eanlı değil', '', '7.00'));
    case '/p/plain':
      return send(200, '<html><span class="price">9,99</span></html>');
    case '/secret/a':
      return send(200, ld('Gizli', '4006381333931', '1'));
    case '/p/limited':
      return send(429, 'slow down');
    case '/p/after':
      return send(200, ld('Sonra', '4006381333931', '1'));
    default:
      return send(404, 'nope');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const host = `127.0.0.1:${server.address().port}`;
const base = `http://${host}`;
const dir = mkdtempSync(join(tmpdir(), 'kb-crawl-'));
after(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const db = openDb(mkdtempSync(join(dir, 'd-')));
  const shopId = addShop(db, { market: 'de', name: 'Local', domain: '127.0.0.1' });
  let t = Date.parse('2026-11-17T10:00:00Z');
  const sleeps = [];
  const now = () => t;
  const limiter = new RateLimiter({
    minIntervalMs: 10_000,
    maxConcurrent: 2,
    now,
    sleep: async ms => {
      sleeps.push(ms);
      t += ms;
    },
  });
  const crawler = createCrawler({ db, siteUrl: 'https://kb.example', now, limiter, allowPrivateHosts: true });
  const seed = path =>
    Number(
      db.prepare('INSERT INTO seeds (shopId, url) VALUES (?, ?)').run(shopId, base + path).lastInsertRowid,
    );
  const row = id => db.prepare('SELECT * FROM seeds WHERE id = ?').get(id);
  return { db, shopId, crawler, seed, row, sleeps, advance: ms => (t += ms) };
}

test('tarama: UA kimliği, robots.txt, JSON-LD -> teklif; EAN yoksa unmatched; çerez gönderilmez', async () => {
  hits.length = 0;
  const s = setup();
  const r1 = await s.crawler.crawlSeed(s.row(s.seed('/p/1')));
  assert.equal(r1.offer, 1);
  const offer = s.db.prepare('SELECT price, currency FROM offers').get();
  assert.deepEqual({ ...offer }, { price: 12.5, currency: 'EUR' });
  const r2 = await s.crawler.crawlSeed(s.row(s.seed('/p/noean')));
  assert.equal(r2.unmatched, 1);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM unmatched').get().n, 1);
  assert.equal(hits[0].path, '/robots.txt'); // önce robots.txt
  assert.ok(hits.every(h => h.ua === `${BOT_TOKEN}/0.1 (+https://kb.example/bot)` && !h.cookie));
  assert.equal(hits.filter(h => h.path === '/robots.txt').length, 1); // 24 saat önbellek
  assert.ok(s.sleeps.every(ms => ms >= 1) && s.sleeps.reduce((a, b) => a + b, 0) >= 20_000); // 3 istek -> en az 20 sn bekleme
});

test('robots.txt yasaklı yol çekilmez; schema.org olmayan sayfadan fiyat okunmaz', async () => {
  hits.length = 0;
  const s = setup();
  const r1 = await s.crawler.crawlSeed(s.row(s.seed('/secret/a')));
  assert.equal(r1.reason, 'robots-disallowed');
  assert.ok(!hits.some(h => h.path === '/secret/a'));
  const r2 = await s.crawler.crawlSeed(s.row(s.seed('/p/plain')));
  assert.equal(r2.reason, 'no-schema-org-product');
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM offers').get().n, 0);
});

test('www ve çıplak alan adı aynı beklemeyi paylaşır: www 503 sonrası çıplak adrese robots isteği gitmez', async () => {
  hits.length = 0;
  const s = setup();
  s.db
    .prepare('INSERT INTO host_backoff (host, until, reason) VALUES (?, ?, ?)')
    .run(`www.${host}`, Date.parse('2026-11-17T10:00:00Z') + 3600_000, 'HTTP 503');
  const r = await s.crawler.crawlSeed(s.row(s.seed('/p/1')));
  assert.ok(!r.offer);
  assert.equal(hits.length, 0); // robots.txt dahil ağa hiç gidilmedi
});

test('429 -> host 24 saat bekletilir, yeniden deneme yok; süre dolunca tekrar denenir', async () => {
  hits.length = 0;
  const s = setup();
  const r1 = await s.crawler.crawlSeed(s.row(s.seed('/p/limited')));
  assert.equal(r1.reason, 'backoff-429');
  const before = hits.length;
  const r2 = await s.crawler.crawlSeed(s.row(s.seed('/p/after')));
  assert.equal(r2.reason, 'backoff');
  assert.equal(hits.length, before); // ağa hiç gidilmedi
  s.advance(24 * 3600 * 1000 + 1000);
  const r3 = await s.crawler.crawlSeed(s.row(s.seed('/p/1')));
  assert.equal(r3.offer, 1);
});

test('blocked bayrağı ve opt-out anında geçerli', async () => {
  hits.length = 0;
  const s = setup();
  const id = s.seed('/p/1');
  s.db.prepare('UPDATE shops SET blocked = 1 WHERE id = ?').run(s.shopId);
  assert.equal((await s.crawler.crawlSeed(s.row(id))).reason, 'shop-blocked');
  s.db.prepare('UPDATE shops SET blocked = 0 WHERE id = ?').run(s.shopId);
  s.db.prepare('INSERT INTO optouts (domain, addedAt) VALUES (?, 0)').run('127.0.0.1');
  assert.equal((await s.crawler.crawlSeed(s.row(id))).reason, 'opt-out');
  assert.equal(hits.length, 0);
  s.db.prepare('DELETE FROM optouts').run();
  assert.equal((await s.crawler.crawlSeed(s.row(id))).offer, 1);
});

test('tohum keşfi: robots.txt site haritası, başka host URL eklenmez', async () => {
  const s = setup();
  const shop = s.db.prepare('SELECT * FROM shops WHERE id = ?').get(s.shopId);
  assert.equal(await s.crawler.discoverSeeds(shop, base), 1);
  assert.deepEqual(
    s.db
      .prepare('SELECT url, source FROM seeds')
      .all()
      .map(r => ({ ...r })),
    [{ url: `${base}/p/1`, source: 'sitemap' }],
  );
});

test('özel/yerel adres varsayılan olarak reddedilir (SSRF)', async () => {
  hits.length = 0;
  const s = setup();
  const strict = createCrawler({
    db: s.db,
    siteUrl: 'https://kb.example',
    limiter: new RateLimiter({ minIntervalMs: 10_000 }),
  });
  const r = await strict.crawlSeed(s.row(s.seed('/p/1')));
  assert.equal(r.reason, 'private-host');
  assert.equal(hits.length, 0);
});

test('JSON-LD: metne gömülü HTML varlıkları çözülür', async () => {
  const { extractProducts } = await import('../crawler/jsonld.mjs');
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'CASIO S&#x130;YAH &amp; Beyaz',
    offers: { '@type': 'Offer', price: '10', priceCurrency: 'TRY' },
  })}</script>`;
  assert.equal(extractProducts(html)[0].name, 'CASIO SİYAH & Beyaz');
});

test('site haritası keşfi (sahte fetch): gzip, dizin önceliği, URL süzgeci, robots bir kez, ≥10 sn aralık', async () => {
  const { gzipSync } = await import('node:zlib');
  const { rankSitemaps, looksLikeProductUrl } = await import('../crawler/crawler.mjs');
  const O = 'https://shop.example';
  const urlset = locs =>
    `<?xml version="1.0"?><urlset>${locs.map(l => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;
  const files = {
    '/robots.txt': [
      'text/plain',
      `User-agent: *\nDisallow: /p/gizli\nSitemap: ${O}/sitemap_index.xml\nSitemap: https://other.example/s.xml\n`,
    ],
    '/sitemap_index.xml': [
      'application/xml',
      `<sitemapindex><sitemap><loc>${O}/sitemap-brands.xml</loc></sitemap><sitemap><loc>${O}/sitemap-blog.xml</loc></sitemap>` +
        `<sitemap><loc>${O}/sitemap-misc.xml</loc></sitemap><sitemap><loc>${O}/sitemap-products-1.xml.gz</loc></sitemap></sitemapindex>`,
    ],
    '/sitemap-products-1.xml.gz': [
      'application/x-gzip',
      gzipSync(
        urlset([
          `${O}/`,
          `${O}/p/kulaklik-123`,
          `${O}/marka/sony`,
          `${O}/tr/kategori/ses`,
          `${O}/blog/yazi`,
          `${O}/p/gizli-1`,
          `https://other.example/p/1`,
          `${O}/urun/mouse-9?renk=siyah&amp;x=1`,
        ]),
      ),
    ],
    '/sitemap-misc.xml': ['application/octet-stream', gzipSync(urlset([`${O}/p/laptop-5`]))], // uzantısız gzip: sihirli bayt
  };
  const calls = [];
  let t = Date.parse('2026-11-17T10:00:00Z');
  const fetchImpl = async (href, init) => {
    const { pathname } = new URL(href);
    calls.push({ path: pathname, at: t, ua: init.headers['user-agent'] });
    const f = files[pathname];
    return f
      ? new Response(f[1], { status: 200, headers: { 'content-type': f[0] } })
      : new Response('x', { status: 404 });
  };
  const now = () => t;
  const limiter = new RateLimiter({ minIntervalMs: 10_000, now, sleep: async ms => void (t += ms) });
  const db = openDb(mkdtempSync(join(dir, 'd-')));
  const shopId = addShop(db, { market: 'tr', name: 'Örnek', domain: 'shop.example' });
  const crawler = createCrawler({ db, siteUrl: 'https://kb.example', fetchImpl, now, limiter });
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
  const stats = {};
  assert.equal(await crawler.discoverSeeds(shop, O, { stats }), 3);
  assert.deepEqual(
    db
      .prepare('SELECT url FROM seeds ORDER BY id')
      .all()
      .map(r => r.url),
    [`${O}/p/kulaklik-123`, `${O}/urun/mouse-9?renk=siyah&x=1`, `${O}/p/laptop-5`],
  );
  // robots bir kez; ürün haritası önce; marka/blog haritası ve başka host hiç istenmez
  assert.deepEqual(
    calls.map(c => c.path),
    ['/robots.txt', '/sitemap_index.xml', '/sitemap-products-1.xml.gz', '/sitemap-misc.xml'],
  );
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 10_000);
  assert.ok(calls.every(c => c.ua === `${BOT_TOKEN}/0.1 (+https://kb.example/bot)`));
  // yardımcılar
  assert.deepEqual(
    rankSitemaps([`${O}/s-category.xml`, `${O}/s-other.xml`, `${O}/s-urun-1.xml`, `${O}/s-page.xml`]),
    [`${O}/s-urun-1.xml`, `${O}/s-other.xml`],
  );
  assert.equal(looksLikeProductUrl(`${O}/`), false);
  assert.equal(looksLikeProductUrl(`${O}/de/marken/sony`), false);
  assert.equal(looksLikeProductUrl(`${O}/search?q=x`), false);
  assert.equal(looksLikeProductUrl(`${O}/Sony/WH-1000XM5/html/product/123`), true);
  db.close();
});

test('site haritası: 403 alınırsa host bekletilir; sıkıştırma bombası sınırda kesilir', async () => {
  const { gzipSync } = await import('node:zlib');
  const O = 'https://shop.example';
  const bomb = gzipSync(Buffer.alloc(60 * 1024 * 1024, 0x20));
  const files = {
    '/robots.txt': ['text/plain', `Sitemap: ${O}/big.xml.gz\nSitemap: ${O}/s2.xml\n`],
    '/big.xml.gz': ['application/gzip', bomb],
  };
  const paths = [];
  let t = 0;
  const fetchImpl = async href => {
    const p = new URL(href).pathname;
    paths.push(p);
    if (p === '/s2.xml') return new Response('no', { status: 403 });
    const f = files[p];
    return f
      ? new Response(f[1], { status: 200, headers: { 'content-type': f[0] } })
      : new Response('x', { status: 404 });
  };
  const now = () => t;
  const limiter = new RateLimiter({ minIntervalMs: 10_000, now, sleep: async ms => void (t += ms) });
  const db = openDb(mkdtempSync(join(dir, 'd-')));
  const shop = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'X', domain: 'shop.example' }));
  const crawler = createCrawler({ db, siteUrl: 'https://kb.example', fetchImpl, now, limiter });
  const stats = {};
  assert.equal(await crawler.discoverSeeds(shop, O, { stats }), 0);
  // 60 MB açılan bomba 50 MB'ta kesilir; <loc> yok -> tohum yok
  assert.deepEqual(
    { result: stats.maps[0].result, locs: stats.maps[0].locs, truncated: stats.maps[0].truncated },
    { result: 'ok', locs: 0, truncated: true },
  );
  assert.equal(stats.maps[1].result, 'backoff-403');
  assert.ok(db.prepare('SELECT until FROM host_backoff WHERE host = ?').get('shop.example'));
  db.close();
});

test('runCycle: mağazalar arasında sırayla seçer (ilk eklenen mağaza kuyruğu doldurmaz); engelli mağaza atlanır', async () => {
  const s = setup();
  const other = addShop(s.db, { market: 'de', name: 'Other', domain: 'localhost' });
  const blocked = addShop(s.db, { market: 'de', name: 'Blocked', domain: 'localhost' });
  s.db.prepare('UPDATE shops SET blocked = 1 WHERE id = ?').run(blocked);
  for (const p of ['/p/1', '/p/2', '/p/3']) s.seed(p);
  const add = (shop, p) =>
    s.db
      .prepare('INSERT INTO seeds (shopId, url) VALUES (?, ?)')
      .run(shop, base.replace('127.0.0.1', 'localhost') + p);
  add(other, '/p/1');
  add(blocked, '/p/2');
  const r = await s.crawler.runCycle({ limit: 2 });
  assert.equal(r.seeds, 2);
  const crawled = s.db
    .prepare('SELECT shopId FROM seeds WHERE lastCrawledAt IS NOT NULL ORDER BY shopId')
    .all();
  assert.deepEqual(
    crawled.map(c => c.shopId),
    [s.shopId, other],
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Sayfa çıkarıcı uyarlamaları, tur önceliği, host paralelliği, Crawl-delay. Gerçek ağ YOK: sahte fetch + sahte saat.
// ---------------------------------------------------------------------------------------------------------------
const fixture = n => readFileSync(new URL(`./fixtures/${n}.html`, import.meta.url), 'utf8');
const LD = (name, price, extra = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, ...extra, offers: { '@type': 'Offer', price, priceCurrency: 'EUR' } })}</script>`;

/** files: tam href -> [content-type, gövde, durum?] | (href) => Response. Saat sahte; kayıt: calls ({ href, at }). */
function fake(files, { domains = ['shop.test'], market = 'de', ...crawlerOpts } = {}) {
  let t = Date.parse('2026-11-18T10:00:00Z');
  const calls = [];
  const stat = { inflight: new Map(), maxHost: 0, now: 0, maxGlobal: 0 };
  const fetchImpl = async href => {
    const host = new URL(href).host;
    calls.push({ href, at: t });
    const n = (stat.inflight.get(host) ?? 0) + 1;
    stat.inflight.set(host, n);
    stat.maxHost = Math.max(stat.maxHost, n);
    stat.now++;
    stat.maxGlobal = Math.max(stat.maxGlobal, stat.now);
    await new Promise(r => setTimeout(r, 3)); // yanıt süresi: paralel istek varsa örtüşme görülür
    stat.inflight.set(host, n - 1);
    stat.now--;
    const f = files[href];
    if (typeof f === 'function') return f(href);
    return f
      ? new Response(f[1], { status: f[2] || 200, headers: { 'content-type': f[0], ...(f[3] || {}) } })
      : new Response('yok', { status: 404 });
  };
  const now = () => t;
  const limiter = new RateLimiter({
    minIntervalMs: 10_000,
    maxConcurrent: 4,
    now,
    sleep: async ms => void (t += ms),
  });
  const db = openDb(mkdtempSync(join(dir, 'f-')));
  const shops = domains.map(d =>
    db.prepare('SELECT * FROM shops WHERE id = ?').get(addShop(db, { market, name: d, domain: d })),
  );
  const crawler = createCrawler({
    db,
    siteUrl: 'https://kb.example',
    fetchImpl,
    now,
    limiter,
    ...crawlerOpts,
  });
  const seed = (shop, url, source = 'sitemap') =>
    db.prepare('INSERT INTO seeds (shopId, url, source) VALUES (?, ?, ?)').run(shop.id, url, source);
  return { db, shops, crawler, calls, seed, stat, now };
}

test('çıplak -> www robots yönlendirmesi de 10 sn host aralığına tabi (iki ayrı host sayılmaz)', async () => {
  const f = fake(
    {
      'https://hop.test/robots.txt': () =>
        new Response('', { status: 301, headers: { location: 'https://www.hop.test/robots.txt' } }),
      'https://www.hop.test/robots.txt': ['text/plain', 'User-agent: *\nAllow: /\n'],
      'https://www.hop.test/p': ['text/html', '<html><title>x</title></html>'],
    },
    { domains: ['hop.test'] },
  );
  await f.crawler.guardedGet(f.shops[0], 'https://hop.test/p');
  assert.ok(f.calls.length >= 2);
  for (let i = 1; i < f.calls.length; i++)
    assert.ok(f.calls[i].at - f.calls[i - 1].at >= 10_000, f.calls[i].href);
});

test('microdata: reichelt gtin13/mpn meta, jacob meta itemprop, mindfactory gtin8 alanındaki EAN-13', () => {
  const [r] = extractProducts(fixture('reichelt-microdata'));
  assert.deepEqual(
    { ean: r.ean, mpn: r.mpn, brand: r.brand, price: r.offers[0].price, stock: r.offers[0].inStock },
    { ean: '4003619665567', mpn: '66556', brand: 'DeLOCK', price: 12.49, stock: true },
  );
  const [j] = extractProducts(fixture('jacob-meta'));
  assert.deepEqual(
    { ean: j.ean, mpn: j.mpn, name: j.name, price: j.offers[0].price, stock: j.offers[0].inStock },
    {
      ean: '4977766771146',
      mpn: 'TN-248VAL',
      name: 'Brother TN-248VAL Toner Multipack',
      price: 159.34,
      stock: false,
    },
  );
  const [m] = extractProducts(fixture('mindfactory-gtin8'));
  assert.equal(m.ean, '8806097379355'); // gtin8 alanında 13 hane: EAN-13 olarak kabul
  assert.equal(normalizeEan(m.ean), '8806097379355');
  assert.equal(m.offers[0].price, 329);
});

test('eanFromText ve priceNet: office-partner net 23,77 -> 28,29; kapalı mağazada metindeki EAN kullanılmaz', () => {
  const stores = [
    { market: 'de', domain: 'office.test', crawl: true, priceNet: true, eanFromText: true },
    { market: 'de', domain: 'plain.test', crawl: true },
  ];
  const f = fake({}, { domains: ['office.test', 'plain.test'], stores });
  const [office, plain] = f.shops;
  const html = fixture('office-partner');
  const o = f.crawler.ingestPage(office, 'https://office.test/samsung-s-pen-40535095', html);
  assert.equal(o.offer, 1);
  assert.deepEqual(
    { ...f.db.prepare('SELECT ean, price FROM offers WHERE shopId = ?').get(office.id) },
    { ean: '8806097379355', price: 28.29 },
  );
  // eanFromText kapalı: JSON-LD'si olmayan sayfadan hiçbir şey okunmaz
  const p = f.crawler.ingestPage(plain, 'https://plain.test/x-1', html);
  assert.equal(p.reason, 'no-schema-org-product');
  assert.equal(f.db.prepare('SELECT count(*) n FROM offers WHERE shopId = ?').get(plain.id).n, 0);
  // JSON-LD var ama gtin yok + metinde EAN: yalnız eanFromText'li mağazada EAN olur, diğerinde unmatched
  const ld = `<h1>Ürün</h1>${LD('Samsung S Pen', '10.00')}<p>EAN: 8806097379355</p>`;
  assert.equal(f.crawler.ingestPage(plain, 'https://plain.test/ld-1', ld).unmatched, 1);
  assert.equal(f.crawler.ingestPage(office, 'https://office.test/ld-1', ld).offer, 1);
  assert.equal(
    f.db.prepare('SELECT price FROM offers WHERE shopId = ? AND url LIKE ?').get(office.id, '%ld-1').price,
    11.9,
  );
  // sayfada iki farklı EAN: hiçbiri alınmaz
  assert.equal(extractProducts(fixture('office-partner-two-eans'), { eanFromText: true }).length, 0);
  assert.equal(
    extractProducts(`${LD('A', '5')}<p>EAN: 8806097379355 / EAN: 4977766771146</p>`, { eanFromText: true })[0]
      .ean,
    '',
  );
  // sağlama toplamı tutmayan EAN alınmaz
  assert.equal(extractProducts(`${LD('A', '5')}<p>EAN: 8806097379350</p>`, { eanFromText: true })[0].ean, '');
});

const seedHost = (f, shop, source, n, prefix = 'p') =>
  Array.from({ length: n }, (_, i) =>
    f.seed(shop, `https://${shop.domain}/produkt/${prefix}-${source}-${i + 100000}`, source),
  );

test('runCycle: targeted ve search tohumlar önce, targeted-title sonra, rastgele tohum mağaza başına en çok 3', async () => {
  const f = fake({});
  const [shop] = f.shops;
  seedHost(f, shop, 'sitemap', 10);
  seedHost(f, shop, 'targeted', 3);
  seedHost(f, shop, 'search', 2);
  seedHost(f, shop, 'targeted-title', 2);
  const r = await f.crawler.runCycle({ limit: 7 });
  assert.equal(r.seeds, 7);
  const done = src =>
    f.db.prepare('SELECT count(*) n FROM seeds WHERE source = ? AND lastCrawledAt IS NOT NULL').get(src).n;
  assert.deepEqual([done('targeted'), done('search'), done('targeted-title'), done('sitemap')], [3, 2, 2, 0]);
  const r2 = await f.crawler.runCycle({ limit: 50 }); // kalanlar: yalnız 3 rastgele
  assert.equal(r2.seeds, 3);
  assert.equal(done('sitemap'), 3);
});

test('runCycle: Mixoutlet tohumları (catalog her turda, tümü normal turda) taranmaz, silinmez', async () => {
  const f = fake({}, { domains: ['mixoutlet.de', 'shop.test'], ownDomains: ['mixoutlet.de'] });
  const [mixo, shop] = f.shops;
  f.seed(mixo, 'https://mixoutlet.de/products/a', 'catalog');
  f.seed(mixo, 'https://mixoutlet.de/products/b', 'targeted');
  f.seed(shop, 'https://shop.test/produkt/x-100000', 'sitemap');
  const r = await f.crawler.runCycle({ limit: 50 });
  assert.equal(r.seeds, 1);
  assert.ok(!f.calls.some(c => c.href.includes('mixoutlet.de')));
  const own = await f.crawler.runCycle({ limit: 50, ownOnly: true }); // kendi sitem turu: catalog yine atlanır
  assert.equal(own.seeds, 1);
  assert.ok(f.calls.some(c => c.href === 'https://mixoutlet.de/products/b'));
  assert.ok(!f.calls.some(c => c.href === 'https://mixoutlet.de/products/a'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM seeds WHERE shopId = ?').get(mixo.id).n, 2);
  // OWN_DOMAINS yokken de normal turda Mixoutlet taranmaz
  const g = fake({}, { domains: ['mixoutlet.de'] });
  g.seed(g.shops[0], 'https://mixoutlet.de/products/c', 'targeted');
  assert.equal((await g.crawler.runCycle()).seeds, 0);
});

test('4 işçi: farklı host paralel, aynı host asla paralel değil ve ardışık istekler >= 10 sn', async () => {
  const hosts = ['a.test', 'b.test', 'c.test', 'd.test'];
  const f = fake({}, { domains: hosts });
  for (const shop of f.shops) seedHost(f, shop, 'targeted', 3);
  const r = await f.crawler.runCycle({ limit: 100 });
  assert.equal(r.seeds, 12);
  assert.equal(f.stat.maxGlobal, 4); // varsayılan maxConcurrent 4
  assert.equal(f.stat.maxHost, 1); // aynı host'a asla paralel istek yok
  for (const h of hosts) {
    const at = f.calls.filter(c => new URL(c.href).host === h).map(c => c.at);
    assert.equal(at.length, 4); // robots.txt + 3 sayfa
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 10_000, `${h}: ${at}`);
  }
});

test('limiter: yanıt aralıktan uzun sürse bile aynı host isteği öncekinin bitmesini bekler', async () => {
  const lim = new RateLimiter({ minIntervalMs: 5, maxConcurrent: 4 });
  const ev = [];
  const job = id => async () => {
    ev.push('+' + id);
    await new Promise(r => setTimeout(r, 40));
    ev.push('-' + id);
  };
  await Promise.all([lim.run('h', job(1)), lim.run('h', job(2)), lim.run('x', job(3))]);
  assert.ok(ev.indexOf('-1') < ev.indexOf('+2'), ev.join(' '));
  assert.ok(ev.indexOf('+3') < ev.indexOf('-1')); // farklı host beklemez
});

test('robots Crawl-delay: aralıktan büyükse o uygulanır (15 sn), yoksa 10 sn', async () => {
  // Her host kendi sahte saatinde: ortak saatte bir host'un beklemesi öbürünün zaman damgasını oynatır.
  const gapFor = async (host, delay) => {
    const files = {
      [`https://${host}/robots.txt`]: ['text/plain', `User-agent: *\nCrawl-delay: ${delay}\n`],
      [`https://${host}/produkt/a-100001`]: ['text/html', LD('A', '1')],
      [`https://${host}/produkt/b-100002`]: ['text/html', LD('B', '1')],
    };
    const f = fake(files, { domains: [host] });
    for (const p of ['a-100001', 'b-100002']) f.seed(f.shops[0], `https://${host}/produkt/${p}`, 'targeted');
    await f.crawler.runCycle();
    const at = f.calls.filter(c => c.href.includes('/produkt/')).map(c => c.at);
    assert.equal(at.length, 2);
    return at[1] - at[0];
  };
  assert.equal(await gapFor('slow.test', 15), 15_000);
  assert.equal(await gapFor('fast.test', 3), 10_000); // Crawl-delay 3 < 10: host aralığı korunur
  // aşırı büyük Crawl-delay: host taranmaz
  const g = fake(
    { 'https://huge.test/robots.txt': ['text/plain', 'User-agent: *\nCrawl-delay: 86400\n'] },
    { domains: ['huge.test'] },
  );
  assert.equal(
    (await g.crawler.guardedGet(g.shops[0], 'https://huge.test/produkt/a-100001')).reason,
    'crawl-delay',
  );
});

test('runCycle: skipMixo ile kendi-site turu Mixoutlet dışındaki kendi mağazaları tarar, Mixoutlet atlanır', async () => {
  const f = fake({}, { domains: ['mixoutlet.de', 'own.test'], ownDomains: ['mixoutlet.de', 'own.test'] });
  const [mixo, own] = f.shops;
  f.seed(mixo, 'https://mixoutlet.de/products/b', 'targeted');
  f.seed(own, 'https://own.test/produkt/x-100000', 'targeted');
  const r = await f.crawler.runCycle({ limit: 50, ownOnly: true, skipMixo: true });
  assert.equal(r.seeds, 1);
  assert.ok(f.calls.some(c => c.href === 'https://own.test/produkt/x-100000'));
  assert.ok(!f.calls.some(c => c.href.includes('mixoutlet.de/products')));
  // normal tur kendi mağazaları hiç taramaz (ayrı turda taranırlar)
  assert.equal((await f.crawler.runCycle({ limit: 50 })).seeds, 0);
});

test('limiter: yavaş gövde bitmeden aynı host a ikinci istek başlamaz (gövde yuva içinde okunur); site haritası akışı release e kadar yuvayı tutar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-lim-'));
  const db = openDb(dir);
  try {
    const id = addShop(db, { market: 'de', name: 'L', domain: 'lim.test' });
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    const log = [];
    const slowBody = (text, ms, tag) =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(text.slice(0, 5)));
          setTimeout(() => {
            c.enqueue(new TextEncoder().encode(text.slice(5)));
            c.close();
            log.push('end ' + tag);
          }, ms);
        },
      });
    const fetchImpl = async url => {
      const p = new URL(url).pathname;
      log.push('start ' + p);
      if (p === '/robots.txt')
        return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
      if (p === '/slow')
        return new Response(slowBody('<html>slow</html>', 150, '/slow'), {
          headers: { 'content-type': 'text/html' },
        });
      if (p === '/map.xml')
        return new Response(
          slowBody('<urlset><url><loc>https://lim.test/p/1</loc></url></urlset>', 150, '/map.xml'),
          { headers: { 'content-type': 'application/xml' } },
        );
      return new Response('<html>a</html>', { headers: { 'content-type': 'text/html' } });
    };
    const limiter = new RateLimiter({ minIntervalMs: 5, maxConcurrent: 4 });
    const c = createCrawler({ db, siteUrl: 'https://k.test', fetchImpl, limiter });
    await c.guardedGet(shop, 'https://lim.test/'); // robots önbelleğe alınsın
    log.length = 0;
    await Promise.all([
      c.guardedGet(shop, 'https://lim.test/slow'),
      c.guardedGet(shop, 'https://lim.test/a'),
    ]);
    assert.ok(log.indexOf('end /slow') < log.indexOf('start /a'), log.join(' | '));
    log.length = 0;
    await Promise.all([
      c.guardedGet(shop, 'https://lim.test/map.xml', { sitemap: true }),
      c.guardedGet(shop, 'https://lim.test/b'),
    ]);
    assert.ok(log.indexOf('end /map.xml') < log.indexOf('start /b'), log.join(' | '));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

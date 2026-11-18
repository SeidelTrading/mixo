import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { createCrawler } from '../crawler/crawler.mjs';
import { RateLimiter } from '../crawler/limiter.mjs';
import { ingestOffer } from '../lib/ingest.mjs';

// EAN / MPN araması (crawler.searchTargeted). Gerçek ağ YOK: sahte fetch + sahte saat.
const dir = mkdtempSync(join(tmpdir(), 'kb-search-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const EANS = [
  '4003619665567',
  '4016032428589',
  '4977766771146',
  '8806097379355',
  '4000000000013',
  '4000000000020',
];
const O = 'https://shop.test';
const STORE = { market: 'de', domain: 'shop.test', crawl: true, search: '/suche?q={q}', brands: ['delock'] };
const LD = (name, gtin, price, extra = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, gtin13: gtin, ...extra, offers: { '@type': 'Offer', price, priceCurrency: 'EUR' } })}</script>`;
const searchUrl = q => `${O}/suche?q=${encodeURIComponent(q)}`;
const ROBOTS = 'User-agent: *\nDisallow: /konto/\n';

/** files: href -> [type, gövde, durum?, başlıklar?] | () => Response. Mixoutlet'te EAN'lı `n` ürün ve isteğe bağlı EAN'sız MPN'liler. */
function setup(files, { n = 3, mpnRows = [], store = STORE, crawlerOpts = {} } = {}) {
  let t = Date.parse('2026-11-18T10:00:00Z');
  const calls = [];
  const fetchImpl = async href => {
    calls.push(href);
    const f = files[href];
    if (typeof f === 'function') return f(href);
    return f
      ? new Response(f[1], { status: f[2] || 200, headers: { 'content-type': f[0], ...(f[3] || {}) } })
      : new Response('yok', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  const now = () => t;
  const limiter = new RateLimiter({ minIntervalMs: 10_000, now, sleep: async ms => void (t += ms) });
  const db = openDb(mkdtempSync(join(dir, 'd-')));
  const mixo = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' }));
  const shop = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'Shop', domain: 'shop.test' }));
  EANS.slice(0, n).forEach((ean, i) =>
    ingestOffer(db, mixo, {
      ean,
      brand: i === 0 ? 'DeLOCK' : 'Marke',
      title: `Ürün ${i}`,
      price: 10 + i, // sonraki ürün daha pahalı (marka ipucu dışında sıra)
      url: `https://mixoutlet.de/products/p-${i}`,
    }),
  );
  mpnRows.forEach((r, i) =>
    ingestOffer(db, mixo, {
      title: `MPN ürün ${i}`,
      price: 5,
      url: `https://mixoutlet.de/products/m-${i}`,
      ...r,
    }),
  );
  const crawler = createCrawler({
    db,
    siteUrl: 'https://kb.example',
    fetchImpl,
    now,
    limiter,
    stores: [store],
    ...crawlerOpts,
  });
  const searched = () => calls.filter(c => c.startsWith(`${O}/suche`));
  return { db, mixo, shop, crawler, calls, searched, advance: ms => (t += ms) };
}

test('arama 302 ile ürün sayfasına gider: gtin eşleşir, teklif oluşur, lookups yazılır', async () => {
  const ean = EANS[0];
  const files = {
    [`${O}/robots.txt`]: ['text/plain', ROBOTS],
    [searchUrl(ean)]: ['text/html', '', 302, { location: '/produkt/delock-adapter-66556' }],
    [`${O}/produkt/delock-adapter-66556`]: [
      'text/html',
      LD('DeLOCK Adapter', ean, '12,49', { brand: 'DeLOCK' }),
    ],
  };
  const s = setup(files, { n: 1 });
  const r = await s.crawler.searchTargeted({ perShop: 5 });
  assert.deepEqual(r, { searches: 1, offers: 1, seeds: 0 });
  const o = s.db.prepare('SELECT ean, price, url FROM offers WHERE shopId = ?').get(s.shop.id);
  assert.deepEqual({ ...o }, { ean, price: 12.49, url: `${O}/produkt/delock-adapter-66556` });
  assert.ok(s.db.prepare('SELECT 1 FROM lookups WHERE shopId = ? AND ean = ?').get(s.shop.id, ean));
});

test('sonuç listesi: en çok 3 ürün bağlantısı search tohumu olur, başka host ve arama sayfası alınmaz', async () => {
  const ean = EANS[0];
  const links = Array.from(
    { length: 5 },
    (_, i) => `<a href="/produkt/adapter-${i}-${100000 + i}">x</a>`,
  ).join('');
  const html = `<html>${links}<a href="https://evil.test/produkt/x-100009">e</a><a href="/suche?q=${ean}&amp;page=2">2</a><a href="/konto/login">k</a></html>`;
  const files = { [`${O}/robots.txt`]: ['text/plain', ROBOTS], [searchUrl(ean)]: ['text/html', html] };
  const s = setup(files, { n: 1 });
  const r = await s.crawler.searchTargeted({ perShop: 5 });
  assert.equal(r.seeds, 3);
  const seeds = s.db.prepare('SELECT url, source FROM seeds ORDER BY id').all();
  assert.equal(seeds.length, 3);
  assert.ok(seeds.every(x => x.source === 'search' && x.url.startsWith(`${O}/produkt/`)));
  assert.ok(s.db.prepare('SELECT 1 FROM lookups WHERE shopId = ? AND ean = ?').get(s.shop.id, ean));
});

test('robots arama yolunu yasaklarsa sıfır arama isteği atılır ve mağazada tur biter', async () => {
  const files = { [`${O}/robots.txt`]: ['text/plain', 'User-agent: *\nDisallow: /suche\n'] };
  const s = setup(files, { n: 4 });
  const r = await s.crawler.searchTargeted({ perShop: 5 });
  assert.equal(s.searched().length, 0);
  assert.equal(r.offers + r.seeds, 0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM lookups').get().n, 0);
  assert.equal(s.calls.filter(c => c.endsWith('/robots.txt')).length, 1);
});

test('aynı EAN 14 gün içinde tekrar sorulmaz; süre dolunca yeniden sorulur', async () => {
  const files = { [`${O}/robots.txt`]: ['text/plain', ROBOTS] }; // arama 404: sonuç yok
  const s = setup(files, { n: 2 });
  assert.equal((await s.crawler.searchTargeted({ perShop: 10 })).searches, 2);
  assert.equal((await s.crawler.searchTargeted({ perShop: 10 })).searches, 0);
  s.advance(13 * 24 * 3600 * 1000);
  assert.equal((await s.crawler.searchTargeted({ perShop: 10 })).searches, 0);
  s.advance(2 * 24 * 3600 * 1000);
  assert.equal((await s.crawler.searchTargeted({ perShop: 10 })).searches, 2);
});

test("sayfadaki gtin farklıysa teklif ingest edilir ama Mixoutlet EAN'ına bağlanmaz", async () => {
  const ean = EANS[0];
  const other = EANS[2];
  const files = {
    [`${O}/robots.txt`]: ['text/plain', ROBOTS],
    [searchUrl(ean)]: ['text/html', LD('Başka ürün', other, '9.99')],
  };
  const s = setup(files, { n: 1 });
  const r = await s.crawler.searchTargeted();
  assert.equal(r.offers, 1);
  assert.equal(
    s.db.prepare('SELECT count(*) n FROM offers WHERE shopId = ? AND ean = ?').get(s.shop.id, ean).n,
    0,
  );
  assert.equal(
    s.db.prepare('SELECT count(*) n FROM offers WHERE shopId = ? AND ean = ?').get(s.shop.id, other).n,
    1,
  );
});

test('perShop sınırı, marka ipucu sırası, günlük tavan; 403 sonrası backoff ile tur kesilir', async () => {
  const files = { [`${O}/robots.txt`]: ['text/plain', ROBOTS] };
  const s = setup(files, { n: 6 });
  const r1 = await s.crawler.searchTargeted({ perShop: 2, dailyCap: 3 });
  assert.equal(r1.searches, 2);
  // marka ipucu (delock) olan ürün önce sorulur
  assert.equal(decodeURIComponent(s.searched()[0].split('q=')[1]), EANS[0]);
  const r2 = await s.crawler.searchTargeted({ perShop: 2, dailyCap: 3 });
  assert.equal(r2.searches, 1); // günlük tavan: 3 - 2
  assert.equal((await s.crawler.searchTargeted({ perShop: 2, dailyCap: 3 })).searches, 0);
  s.advance(24 * 3600 * 1000); // ertesi gün sayaç sıfırlanır
  assert.equal((await s.crawler.searchTargeted({ perShop: 2, dailyCap: 3 })).searches, 2);

  const forbidden = setup(
    { [`${O}/robots.txt`]: ['text/plain', ROBOTS], [searchUrl(EANS[0])]: ['text/html', 'yasak', 403] },
    { n: 4 },
  );
  assert.equal((await forbidden.crawler.searchTargeted({ perShop: 10 })).searches, 1); // ilk 403: tur biter
  assert.ok(forbidden.db.prepare('SELECT until FROM host_backoff WHERE host = ?').get('shop.test'));
  const again = forbidden.searched().length;
  await forbidden.crawler.searchTargeted({ perShop: 10 });
  assert.equal(forbidden.searched().length, again); // host 24 saat bekletilir: ağa gidilmez
});

test('MPN araması: yalnız gerçek MPN (iç kod değil), sayfada MPN doğrulanırsa teklif yazılır', async () => {
  const mpnRows = [
    { brand: 'Digitus', mpn: 'DA-90370', sku: 'BA-820009' },
    { brand: 'Zzz', mpn: 'BA-21150232', sku: 'BA-21150232' }, // iç kod: aranmaz
  ];
  const q = 'Digitus DA-90370';
  const good = `${O}/produkt/digitus-da-90370-100001`;
  const files = {
    [`${O}/robots.txt`]: ['text/plain', ROBOTS],
    [searchUrl(q)]: ['text/html', '', 302, { location: good }],
    [good]: ['text/html', LD('Digitus Kabel', EANS[3], '7.50', { brand: 'Digitus', mpn: 'DA-90370' })],
  };
  const s = setup(files, { n: 0, mpnRows });
  const r = await s.crawler.searchTargeted({ perShop: 8 });
  assert.equal(r.searches, 1);
  assert.equal(s.searched()[0], searchUrl(q));
  assert.equal(s.db.prepare('SELECT count(*) n FROM offers WHERE shopId = ?').get(s.shop.id).n, 1);
  assert.ok(
    s.db.prepare('SELECT 1 FROM lookups WHERE shopId = ? AND ean = ?').get(s.shop.id, 'mpn:digitus|da90370'),
  );

  // sayfadaki MPN farklı: doğrulanmaz, teklif yazılmaz
  const bad = setup(
    {
      ...files,
      [good]: ['text/html', LD('Digitus Başka', EANS[3], '7.50', { brand: 'Digitus', mpn: 'DA-11111' })],
    },
    { n: 0, mpnRows },
  );
  const r2 = await bad.crawler.searchTargeted({ perShop: 8 });
  assert.equal(r2.offers, 0);
  assert.equal(bad.db.prepare('SELECT count(*) n FROM offers WHERE shopId = ?').get(bad.shop.id).n, 0);
  assert.equal(bad.db.prepare('SELECT count(*) n FROM unmatched WHERE shopId = ?').get(bad.shop.id).n, 0);
});

test('arama şablonu olmayan mağaza ve Mixoutlet aranmaz; guardedGet ve ingestPage dışa açık', async () => {
  const s = setup(
    { [`${O}/robots.txt`]: ['text/plain', ROBOTS] },
    { store: { ...STORE, search: undefined } },
  );
  assert.equal((await s.crawler.searchTargeted()).searches, 0);
  assert.equal(typeof s.crawler.guardedGet, 'function');
  assert.equal(typeof s.crawler.ingestPage, 'function');
  assert.equal(s.calls.length, 0);
});

test("çıplak alan adı www'ya yönlendiriyorsa ilk yanıttan sonra doğrudan www'ya gidilir (arama başına tek istek)", async () => {
  // deneme 2026-11-18: secomp.de ve pieper.de her aramada 301 + gerçek istek (iki istek) harcıyordu
  const html = () => new Response('<html>sonuç yok</html>', { headers: { 'content-type': 'text/html' } });
  const files = new Proxy(
    {},
    {
      get: (_t, href) => {
        const u = new URL(href);
        if (u.pathname === '/robots.txt')
          return () => new Response(ROBOTS, { headers: { 'content-type': 'text/plain' } });
        if (u.host === 'shop.test')
          return () =>
            new Response('', {
              status: 301,
              headers: { location: `https://www.shop.test${u.pathname}${u.search}` },
            });
        return html;
      },
    },
  );
  const f = setup(files, { n: 3 });
  const r = await f.crawler.searchTargeted({ perShop: 3 });
  assert.equal(r.searches, 3);
  const bare = f.calls.filter(c => new URL(c).host === 'shop.test' && c.includes('/suche'));
  const www = f.calls.filter(c => new URL(c).host === 'www.shop.test' && c.includes('/suche'));
  assert.equal(bare.length, 1); // yalnız ilk arama çıplak host'a gider
  assert.equal(www.length, 3);
  f.db.close();
});

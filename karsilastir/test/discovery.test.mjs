import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import {
  ACCEPT,
  createCrawler,
  looksLikeProductUrl,
  productUrlScore,
  rankSitemaps,
  readSitemap,
} from '../crawler/crawler.mjs';
import { RateLimiter } from '../crawler/limiter.mjs';
import { isAllowed, parseRobots } from '../crawler/robots.mjs';

// Tohum keşfi düzeltmeleri (2026-11-17 yoklaması). Gerçek ağ YOK: tüm yanıtlar sahte fetch'ten gelir.
const dir = mkdtempSync(join(tmpdir(), 'kb-disc-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const urlset = locs =>
  `<?xml version="1.0"?><urlset>${locs.map(l => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;
const index = locs =>
  `<?xml version="1.0"?><sitemapindex>${locs.map(l => `<sitemap><loc>${l}</loc></sitemap>`).join('')}</sitemapindex>`;

/** files: tam href -> [content-type, gövde] | (init) => Response. Saat sahte; her istek kaydedilir. */
function setup(domain, files) {
  const calls = [];
  let t = Date.parse('2026-11-17T10:00:00Z');
  const fetchImpl = async (href, init) => {
    calls.push({ href, accept: init.headers.accept, at: t });
    const f = files[href];
    if (typeof f === 'function') return f(init);
    return f
      ? new Response(f[1], { status: f[2] || 200, headers: { 'content-type': f[0], ...(f[3] || {}) } })
      : new Response('x', { status: 404 });
  };
  const now = () => t;
  const limiter = new RateLimiter({ minIntervalMs: 10_000, now, sleep: async ms => void (t += ms) });
  const db = openDb(mkdtempSync(join(dir, 'd-')));
  const shop = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'X', domain }));
  const crawler = createCrawler({ db, siteUrl: 'https://kb.example', fetchImpl, now, limiter });
  const seeds = () =>
    db
      .prepare('SELECT url FROM seeds ORDER BY id')
      .all()
      .map(r => r.url);
  return { db, shop, crawler, calls, seeds };
}

test('robots.txt: yalnız CR satır sonu da ayrıştırılır (uhren4you.de)', () => {
  const r = parseRobots(
    'User-agent: *\rAllow: /\rDisallow: /cart/\rSitemap: https://shop.example/sitemap.xml\r',
  );
  assert.deepEqual(r.sitemaps, ['https://shop.example/sitemap.xml']);
  assert.equal(isAllowed(r, 'KarsilastirBot', '/cart/x'), false);
  assert.equal(isAllowed(r, 'KarsilastirBot', '/products/uhr-1'), true);
});

test('Accept başlığı standart ve */* içerir (informatique.nl / paradigit.nl 406)', async () => {
  assert.equal(ACCEPT, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  const O = 'https://www.shop.example';
  // Sunucu text/xml sunar; Accept bunu kapsamıyorsa 406 döner (gerçek davranış).
  const strict = (type, body) => init =>
    /\*\/\*|text\/xml/.test(init.headers.accept)
      ? new Response(body, { status: 200, headers: { 'content-type': type } })
      : new Response('Not Acceptable', { status: 406 });
  const { crawler, shop, seeds, calls } = setup('www.shop.example', {
    [`${O}/robots.txt`]: strict('text/plain', `User-agent: *\nDisallow:\nSitemap: ${O}/sitemap.xml\n`),
    [`${O}/sitemap.xml`]: strict('text/xml', urlset([`${O}/tv-55/20954715/product`])),
  });
  assert.equal(await crawler.discoverSeeds(shop), 1);
  assert.deepEqual(seeds(), [`${O}/tv-55/20954715/product`]);
  assert.ok(calls.every(c => c.accept === ACCEPT));
});

test('".xml.gz" adlı ama düz XML sunan harita çift açılmaz (otto.de); gerçek gzip de açılır', async () => {
  const O = 'https://www.shop.example';
  const { crawler, shop, seeds } = setup('www.shop.example', {
    [`${O}/robots.txt`]: ['text/plain', `Sitemap: ${O}/products-sitemap/index.xml\n`],
    [`${O}/products-sitemap/index.xml`]: [
      'text/xml',
      index([`${O}/products-sitemap/a_1.xml.gz`, `${O}/products-sitemap/b_1.xml.gz`]),
    ],
    [`${O}/products-sitemap/a_1.xml.gz`]: ['text/xml; charset=utf-8', urlset([`${O}/p/stuhl-CS02KJ0O1/`])],
    [`${O}/products-sitemap/b_1.xml.gz`]: [
      'application/x-gzip',
      gzipSync(urlset([`${O}/p/tisch-CS03DX0M5/`])),
    ],
  });
  const stats = {};
  assert.equal(await crawler.discoverSeeds(shop, undefined, { stats }), 2);
  assert.deepEqual(seeds(), [`${O}/p/stuhl-CS02KJ0O1/`, `${O}/p/tisch-CS03DX0M5/`]);
  assert.ok(stats.maps.every(m => m.result === 'ok'));
});

test('dev harita akışla okunur: 500 güçlü aday bulununca okuma durur (parfumdreams.de / koctas.com.tr)', async () => {
  const O = 'https://www.shop.example';
  // ~12 MB'lık (10 MB ham sınırının üstünde) urlset; parça parça üretilir, kaç parça çekildiği sayılır.
  const N = 120_000;
  let pulled = 0;
  const big = () => {
    let i = 0;
    const enc = new TextEncoder();
    return new ReadableStream({
      pull(c) {
        pulled++;
        if (i === 0) c.enqueue(enc.encode('<?xml version="1.0"?><urlset>'));
        const part = [];
        for (let k = 0; k < 1000 && i < N; k++, i++)
          part.push(
            `<url><loc>${O}/Shiseido/Linie/Duft-${i}/index_${10000 + i}.aspx</loc><lastmod>2026-11-17</lastmod></url>`,
          );
        c.enqueue(enc.encode(part.join('')));
        if (i >= N) {
          c.enqueue(enc.encode('</urlset>'));
          c.close();
        }
      },
    });
  };
  const { crawler, shop, seeds } = setup('www.shop.example', {
    [`${O}/robots.txt`]: ['text/plain', `Sitemap: ${O}/Sitemaps/sitemap.de.xml\n`],
    [`${O}/Sitemaps/sitemap.de.xml`]: [
      'text/xml',
      index([
        `${O}/Sitemaps/StaticPages.de1.xml`,
        `${O}/Sitemaps/Blog.de1.xml`,
        `${O}/Sitemaps/Articles.de1.xml`,
      ]),
    ],
    [`${O}/Sitemaps/Articles.de1.xml`]: () =>
      new Response(big(), { status: 200, headers: { 'content-type': 'text/xml' } }),
  });
  const stats = {};
  await crawler.discoverSeeds(shop, undefined, { stats });
  assert.equal(seeds().length, 500);
  assert.equal(seeds()[0], `${O}/Shiseido/Linie/Duft-0/index_10000.aspx`);
  assert.deepEqual(
    stats.maps.map(m => [m.url.slice(O.length), m.result, m.truncated]),
    [
      ['/Sitemaps/sitemap.de.xml', 'ok', false],
      ['/Sitemaps/Articles.de1.xml', 'ok', true], // StaticPages/Blog hiç istenmez
    ],
  );
  assert.ok(pulled < 10, `yalnızca baştaki parçalar okunmalı, okunan: ${pulled}`);
});

test('readSitemap: 10 MB ham sınırı aşan düz harita kısmi sonuç verir, bozuk gzip hata verir', async () => {
  const pad = 'x'.repeat(1000); // resim/çeviri uzantıları gibi <loc> dışı içerik
  const one = `<url><loc>https://s.example/p/1234567</loc><image:caption>${pad}</image:caption></url>`;
  const body = Buffer.from('<urlset>' + one.repeat(Math.ceil((11 * 1024 * 1024) / one.length)));
  const chunks = async function* () {
    for (let i = 0; i < body.length; i += 64 * 1024) yield body.subarray(i, i + 64 * 1024);
  };
  const r = await readSitemap(chunks(), { want: Infinity });
  assert.equal(r.index, false);
  assert.equal(r.truncated, true);
  // ham 10 MB'ta durur: ~10 000 <loc>, 11 MB'ın tamamı (~11 000) değil
  assert.ok(r.locs.length > 9_000 && r.locs.length < 10_600, String(r.locs.length));
  const bad = async function* () {
    yield Buffer.from([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  };
  await assert.rejects(readSitemap(bad()));
});

test('ürün harita sıralaması: productdetailspages tutulur, marka/kampanya/içerik sayfaları atlanır (MediaMarkt/Saturn)', () => {
  const O = 'https://www.saturn.example/sitemaps';
  assert.deepEqual(
    rankSitemaps([
      `${O}/sitemap-brandpages.xml`,
      `${O}/sitemap-campaignpages.xml`,
      `${O}/sitemap-contentpages.xml`,
      `${O}/sitemap-marketpages.xml`,
      `${O}/sitemap-productdetailspages-000.xml`,
      `${O}/sitemap-productdetailspages-001.xml`,
      `${O}/sitemap-index.xml`,
    ]),
    [
      `${O}/sitemap-productdetailspages-000.xml`,
      `${O}/sitemap-productdetailspages-001.xml`,
      `${O}/sitemap-index.xml`,
    ],
  );
  const B = 'https://sitemap.boyner.example/bynsitemap';
  assert.deepEqual(
    rankSitemaps([`${B}/category.xml`, `${B}/brand.xml`, `${B}/product.xml`, `${B}/StaticPages.de1.xml`]),
    [`${B}/product.xml`],
  );
  assert.deepEqual(rankSitemaps([`${B}/Blog.de1.xml`, `${B}/Articles.de1.xml`]), [`${B}/Articles.de1.xml`]);
});

test('ürün URL puanı: güçlü işaretli URL önce, hizmet/giriş sayfaları atlanır (paradigit.nl)', () => {
  const O = 'https://www.paradigit.example';
  assert.equal(productUrlScore(`${O}/seagate-ironwolf-8-tb/20954715/product`), 2);
  assert.equal(productUrlScore(`${O}/de/product/_akku-lenovo-83527367.html`), 2);
  assert.equal(productUrlScore(`${O}/oje/flormar-oje-fc04-p-10035979`), 2);
  assert.equal(productUrlScore(`${O}/gpd-banyo-bataryasi/p/1000065417`), 2);
  assert.equal(productUrlScore(`${O}/products/hermle-30466-002100`), 2);
  assert.equal(productUrlScore(`${O}/Shiseido/Eye-Cream/index_87115.aspx`), 2);
  assert.equal(productUrlScore(`${O}/acer-monitor-24`), 1);
  assert.equal(productUrlScore(`${O}/klantenservice/winkelen/levertijden/`), 0);
  assert.equal(productUrlScore(`${O}/inloggen`), 0);
  assert.equal(looksLikeProductUrl(`${O}/`), false);
});

test('karışık haritada güçlü ürün URLleri önce alınır; robots.txt aynı haritayı iki kez listelese de bir kez istenir', async () => {
  const O = 'https://www.shop.example';
  const prods = Array.from({ length: 600 }, (_, i) => `${O}/tv-${i}/${20000000 + i}/product`);
  const { crawler, shop, seeds, calls } = setup('www.shop.example', {
    [`${O}/robots.txt`]: ['text/plain', `Sitemap: ${O}/sitemap.xml\nSitemap: ${O}/sitemap.xml\n`],
    [`${O}/sitemap.xml`]: ['text/xml', urlset([`${O}/`, `${O}/over-ons`, `${O}/klantenservice/x`, ...prods])],
  });
  assert.equal(await crawler.discoverSeeds(shop), 500);
  assert.deepEqual(seeds().slice(0, 2), prods.slice(0, 2));
  assert.ok(!seeds().includes(`${O}/over-ons`));
  assert.deepEqual(
    calls.map(c => c.href),
    [`${O}/robots.txt`, `${O}/sitemap.xml`],
  );
});

test('www -> çıplak alan adı robots.txt yönlendirmesi izlenir (mixoutlet.de); başka siteye yönlendirme izlenmez', async () => {
  const W = 'https://www.shop.example';
  const A = 'https://shop.example';
  const { crawler, shop, seeds, calls } = setup('www.shop.example', {
    [`${W}/robots.txt`]: ['text/html', '', 301, { location: `${A}/robots.txt` }],
    [`${A}/robots.txt`]: ['text/plain', `User-agent: *\nDisallow: /checkout\nSitemap: ${A}/sitemap.xml\n`],
    [`${A}/sitemap.xml`]: ['application/xml', urlset([`${A}/products/uhr-1`, `${A}/checkout/products/x`])],
    [`${A}/products/uhr-1`]: [
      'text/html',
      '<script type="application/ld+json">{"@type":"Product","name":"Uhr","gtin13":"4006381333931","offers":{"price":"10","priceCurrency":"EUR"}}</script>',
    ],
  });
  assert.equal(await crawler.discoverSeeds(shop), 1);
  assert.deepEqual(seeds(), [`${A}/products/uhr-1`]);
  // çıplak alan adının robots.txt'i önbellekten gelir: yeniden istenmez
  assert.deepEqual(
    calls.map(c => c.href),
    [`${W}/robots.txt`, `${A}/robots.txt`, `${A}/sitemap.xml`],
  );
  const page = await crawler.guardedGet(shop, `${W}/products/uhr-1`.replace(W, A));
  assert.equal(page.ok, true);

  const o = setup('www.other.example', {
    'https://www.other.example/robots.txt': [
      'text/html',
      '',
      301,
      { location: 'https://evil.example/robots.txt' },
    ],
  });
  assert.equal(await o.crawler.discoverSeeds(o.shop), 0);
  assert.deepEqual(
    o.calls.map(c => c.href),
    ['https://www.other.example/robots.txt'],
  );
  assert.equal((await o.crawler.guardedGet(o.shop, 'https://evil.example/p/1')).reason, 'host-mismatch');
  assert.equal((await o.crawler.guardedGet(o.shop, 'https://notother.example/p/1')).reason, 'host-mismatch');
});

test('alt alan adındaki site haritası (sitemap.boyner.com.tr) kendi robots.txt denetimiyle okunur; harita listeleyen urlset dizin sayılır', async () => {
  const W = 'https://www.shop.example';
  const S = 'https://sitemap.shop.example';
  const { crawler, shop, seeds, calls } = setup('www.shop.example', {
    [`${W}/robots.txt`]: [
      'text/plain',
      `User-agent: *\nDisallow: /sepet\nSitemap: ${S}/bynsitemap/sitemap.xml\n`,
    ],
    [`${S}/robots.txt`]: ['text/plain', 'User-agent: *\nDisallow:\n'],
    [`${S}/bynsitemap/sitemap.xml`]: [
      'application/xml',
      urlset([`${S}/bynsitemap/category.xml`, `${S}/bynsitemap/brand.xml`, `${S}/bynsitemap/product.xml`]),
    ],
    [`${S}/bynsitemap/product.xml`]: [
      'application/xml',
      urlset([`${W}/ayakkabi/marka-sneaker-p-1234567`, 'https://evil.example/p-1', `${W}/sepet/p-1234568`]),
    ],
  });
  assert.equal(await crawler.discoverSeeds(shop), 1);
  assert.deepEqual(seeds(), [`${W}/ayakkabi/marka-sneaker-p-1234567`]);
  assert.deepEqual(
    calls.map(c => c.href),
    [`${W}/robots.txt`, `${S}/robots.txt`, `${S}/bynsitemap/sitemap.xml`, `${S}/bynsitemap/product.xml`],
  );
  // host başına 10 sn kuralı: aynı host'a ardışık istekler arasında en az 10 sn
  const byHost = {};
  for (const c of calls) {
    const h = new URL(c.href).host;
    if (byHost[h] !== undefined) assert.ok(c.at - byHost[h] >= 10_000);
    byHost[h] = c.at;
  }
});

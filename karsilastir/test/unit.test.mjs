import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProducts, bestOffer } from '../crawler/jsonld.mjs';
import { isAllowed, parseRobots } from '../crawler/robots.mjs';
import { RateLimiter } from '../crawler/limiter.mjs';
import { normalizeEan, gtinChecksumOk } from '../lib/ean.mjs';
import { parsePrice, parseShipping } from '../lib/price.mjs';
import { sortOffers, totalPrice } from '../lib/pricing.mjs';
import { mapCsvRows, parseCsv } from '../feeds/csv.mjs';
import { parseXmlFeed } from '../feeds/xml.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop, categoriesFor, priceDrops } from '../db/repo.mjs';
import { ingestOffer } from '../lib/ingest.mjs';

const ld = json => `<html><script type="application/ld+json">${json}</script></html>`;

test('JSON-LD: tek ürün, sayı fiyat, GTIN', () => {
  const [p] = extractProducts(
    ld(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Kulaklık',
        gtin13: '4006381333931',
        offers: {
          '@type': 'Offer',
          price: 19.9,
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
      }),
    ),
  );
  assert.equal(p.name, 'Kulaklık');
  assert.equal(p.ean, '4006381333931');
  assert.deepEqual([p.offers[0].price, p.offers[0].currency, p.offers[0].inStock], [19.9, 'EUR', true]);
});

test('JSON-LD: virgüllü ondalık metin fiyat ve stok yok', () => {
  const [p] = extractProducts(
    ld(
      JSON.stringify({
        '@type': 'Product',
        name: 'X',
        offers: { price: '1.299,90', priceCurrency: 'TRY', availability: 'OutOfStock' },
      }),
    ),
  );
  assert.equal(p.offers[0].price, 1299.9);
  assert.equal(p.offers[0].inStock, false);
});

test('JSON-LD: bozuk JSON atlanır, sonraki blok okunur', () => {
  const html =
    ld('{ bozuk json,,') +
    ld(JSON.stringify({ '@type': 'Product', name: 'Y', offers: { price: '5,50', priceCurrency: 'EUR' } }));
  const r = extractProducts(html);
  assert.equal(r.length, 1);
  assert.equal(r[0].offers[0].price, 5.5);
  assert.deepEqual(extractProducts(ld('{ bozuk')), []);
});

test('JSON-LD: birden çok teklif, AggregateOffer, @graph ve en ucuz stoklu seçimi', () => {
  const data = {
    '@graph': [
      { '@type': 'WebSite' },
      {
        '@type': ['Product'],
        name: 'Z',
        gtin: '4006381333931',
        offers: [
          { '@type': 'Offer', price: '30', priceCurrency: 'EUR' },
          { '@type': 'Offer', price: '10', priceCurrency: 'EUR', availability: 'SoldOut' },
          { '@type': 'AggregateOffer', lowPrice: '20,00', priceCurrency: 'EUR' },
        ],
      },
    ],
  };
  const [p] = extractProducts(ld(JSON.stringify(data)));
  assert.equal(p.offers.length, 3);
  assert.equal(bestOffer(p).price, 20);
});

test('microdata Product/Offer okunur; Product olmayan sayfa boş döner', () => {
  const html = `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Mikro</span><meta itemprop="gtin13" content="4006381333931">
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="EUR"><span itemprop="price" content="12.50">12,50 €</span><link itemprop="availability" href="https://schema.org/InStock"></div></div>`;
  const [p] = extractProducts(html);
  assert.deepEqual(
    [p.name, p.ean, p.offers[0].price, p.offers[0].currency],
    ['Mikro', '4006381333931', 12.5, 'EUR'],
  );
  assert.deepEqual(extractProducts('<html><body><span class="price">9,99</span></body></html>'), []);
});

const ROBOTS = `User-agent: *
Disallow: /private/
Disallow: /*.pdf$
Allow: /private/ok
Sitemap: https://a.test/sitemap.xml

User-agent: KarsilastirBot
Disallow: /blocked
Crawl-delay: 20 # yorum
`;

test('robots.txt: grup seçimi, joker, $, Allow önceliği, sitemap', () => {
  const r = parseRobots(ROBOTS);
  assert.deepEqual(r.sitemaps, ['https://a.test/sitemap.xml']);
  assert.equal(isAllowed(r, 'KarsilastirBot', '/blocked/x'), false);
  assert.equal(isAllowed(r, 'KarsilastirBot', '/private/x'), true); // özel grup varsa '*' uygulanmaz
  assert.equal(isAllowed(r, 'OtherBot', '/private/x'), false);
  assert.equal(isAllowed(r, 'OtherBot', '/private/ok/1'), true); // daha uzun Allow kazanır
  assert.equal(isAllowed(r, 'OtherBot', '/a/file.pdf'), false);
  assert.equal(isAllowed(r, 'OtherBot', '/a/file.pdf?x=1'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /'), 'KarsilastirBot', '/x'), false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), 'KarsilastirBot', '/x'), true);
  assert.equal(isAllowed(parseRobots(''), 'KarsilastirBot', '/x'), true);
});

test('hız sınırlayıcı: aynı host aralıklı, farklı host paralel, eşzamanlılık sınırı', async () => {
  const lim = new RateLimiter({ minIntervalMs: 60, maxConcurrent: 5 });
  const starts = [];
  const t0 = Date.now();
  await Promise.all([1, 2, 3].map(() => lim.run('a.test', async () => starts.push(Date.now() - t0))));
  assert.ok(starts[1] - starts[0] >= 55 && starts[2] - starts[1] >= 55, String(starts));
  const t1 = Date.now();
  await Promise.all(['x', 'y', 'z'].map(h => lim.run(h, async () => {})));
  assert.ok(Date.now() - t1 < 50); // farklı hostlar birbirini beklemez

  // rezervasyon mantığı sahte saatle: 3 ardışık çağrı -> 0, 10, 20 sn slotları
  let t = 1_000_000;
  const slots = [];
  const fake = new RateLimiter({ minIntervalMs: 10_000, now: () => t, sleep: async ms => slots.push(ms) });
  for (let i = 0; i < 3; i++) await fake.run('h', async () => {});
  assert.deepEqual(slots, [10_000, 20_000]); // saat ilerlemediği için 2. ve 3. istek 10/20 sn bekler
  t += 100_000;
  slots.length = 0;
  await fake.run('h', async () => {});
  assert.deepEqual(slots, []); // süre geçti, bekleme yok

  const real = new RateLimiter({ minIntervalMs: 0, maxConcurrent: 2 });
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      real.run('h' + i, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
      }),
    ),
  );
  assert.equal(peak, 2);
});

test('EAN doğrulama ve normalleştirme', () => {
  assert.equal(gtinChecksumOk('4006381333931'), true);
  assert.equal(gtinChecksumOk('4006381333932'), false);
  assert.equal(gtinChecksumOk('96385074'), true);
  assert.equal(normalizeEan(' 4006-3813 33931 '), '4006381333931');
  assert.equal(normalizeEan('4006381333931.0'), '4006381333931');
  assert.equal(normalizeEan('036000291452'), '0036000291452'); // UPC-A -> 13
  assert.equal(normalizeEan('00036000291452'), '0036000291452'); // GTIN-14 (0 önekli) -> 13
  for (const bad of ['', null, undefined, 'abc', '12345', '4006381333932', '40063813339311'])
    assert.equal(normalizeEan(bad), null);
});

test('fiyat çözümleme', () => {
  const cases = [
    ['1.299,90 TL', 1299.9],
    ['1,299.90', 1299.9],
    ['129,90', 129.9],
    ['€ 12.5', 12.5],
    [12.5, 12.5],
    ['1.299', 1299],
    ['2.499.000,00', 2499000],
    ['0', null],
    ['-5', null],
    ['abc', null],
    [null, null],
  ];
  for (const [input, want] of cases) assert.equal(parsePrice(input), want, String(input));
  assert.equal(parseShipping('0'), 0);
  assert.equal(parseShipping('Ücretsiz'), 0);
  assert.equal(parseShipping('4,95'), 4.95);
  assert.equal(parseShipping(''), null);
});

test('toplam fiyata göre sıralama: kargo dahil, stoksuz sona, eşitlikte ucuz ürün fiyatı', () => {
  const offers = [
    { id: 1, shopName: 'A', price: 100, shipping: 20, inStock: 1 }, // 120
    { id: 2, shopName: 'B', price: 110, shipping: 0, inStock: 1 }, // 110
    { id: 3, shopName: 'C', price: 50, shipping: 0, inStock: 0 }, // stoksuz
    { id: 4, shopName: 'D', price: 90, shipping: 20, inStock: 1 }, // 110 (ürün fiyatı daha düşük)
  ];
  const sorted = sortOffers(offers);
  assert.deepEqual(
    sorted.map(o => o.id),
    [4, 2, 1, 3],
  );
  assert.equal(sorted[0].total, 110);
  assert.equal(totalPrice({ price: 0.1, shipping: 0.2 }), 0.3);
  assert.equal(offers[0].total, undefined); // girdi değişmez
});

test('CSV besleme eşlemesi: ; ayırıcı, tırnaklı alan, özel sütun adları, stok metni', () => {
  const csv =
    'gtin;name;product_url;fiyat;stok\n4006381333931;"Kulaklık; Pro ""X""";https://s.test/1;1.299,90;in stock\n96385074;Kalem;https://s.test/2;5,50;yok\n';
  const rows = mapCsvRows(parseCsv(csv), {
    ean: 'gtin',
    title: 'name',
    url: 'product_url',
    price: 'fiyat',
    inStock: 'stok',
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    [rows[0].ean, rows[0].title, rows[0].price, rows[0].inStock],
    ['4006381333931', 'Kulaklık; Pro "X"', '1.299,90', true],
  );
  assert.equal(rows[1].inStock, false);
  assert.equal(parseCsv('a,b\r\n1,"x\ny"\r\n').length, 2);
  assert.deepEqual(mapCsvRows(parseCsv('a,b\n'), {}), []);
});

test('XML besleme eşlemesi (CDATA, varlıklar, g: öneki)', () => {
  const xml = `<rss><channel><item><g:gtin>4006381333931</g:gtin><title><![CDATA[Tee & Co]]></title><link>https://s.test/1</link><g:price>9,90 EUR</g:price><g:availability>out of stock</g:availability></item></channel></rss>`;
  const [r] = parseXmlFeed(xml, { ean: 'g:gtin', price: 'g:price', inStock: 'g:availability' });
  assert.deepEqual(
    [r.ean, r.title, r.url, r.price, r.inStock],
    ['4006381333931', 'Tee & Co', 'https://s.test/1', '9,90 EUR', false],
  );
});

test('repo: kategoriler ve fiyatı düşenler (salt okunur sorgular)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-unit-'));
  const db = openDb(dir);
  try {
    const id = addShop(db, { market: 'de', name: 'S', domain: 's.test', shippingDefault: 0 });
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    const now = Date.now();
    const row = (ean, price, category) => ({
      ean,
      title: 'P' + ean,
      price,
      category,
      currency: 'EUR',
      url: `https://s.test/${ean}`,
    });
    ingestOffer(db, shop, row('4006381333931', '20,00', 'A'), now - 86400000);
    ingestOffer(db, shop, row('4006381333931', '15,00', 'A'), now);
    ingestOffer(db, shop, row('96385074', '10,00', 'B'), now - 86400000);
    ingestOffer(db, shop, row('96385074', '12,00', 'B'), now); // zam: düşen değil
    ingestOffer(db, shop, row('5901234123457', '9,00', undefined), now);
    assert.deepEqual(categoriesFor(db, 'de', now, 30), ['A', 'B']);
    assert.deepEqual(categoriesFor(db, 'tr', now, 30), []);
    const drops = priceDrops(db, 'de', now, 30);
    assert.deepEqual(
      drops.map(d => [d.ean, d.prev, d.price, d.pct]),
      [['4006381333931', 20, 15, 25]],
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arama Türkçe ve Almanca harflerde büyük/küçük ve aksan duyarsız', async () => {
  const { openDb, fold } = await import('../db.mjs');
  const { addShop, searchProducts } = await import('../db/repo.mjs');
  const { ingestOffer } = await import('../lib/ingest.mjs');
  assert.equal(fold('Örnek İŞLEMCİ Größe ılık'), 'ornek islemci grosse ilik');
  const dir = mkdtempSync(join(tmpdir(), 'kb-fold-'));
  const db = openDb(dir);
  try {
    const shop = db
      .prepare('SELECT * FROM shops WHERE id = ?')
      .get(addShop(db, { market: 'tr', name: 'S', domain: 's.test', shippingDefault: 0 }));
    const now = Date.now();
    ingestOffer(
      db,
      shop,
      {
        ean: '4006381333931',
        title: 'Örnek Şarjlı Süpürge',
        brand: 'İnci',
        currency: 'TRY',
        price: '100',
        url: 'https://s.test/1',
      },
      now,
    );
    for (const q of ['Örnek', 'örnek', 'ORNEK', 'şarjlı', 'sarjli', 'inci', 'İNCİ'])
      assert.equal(searchProducts(db, 'tr', q, now, 7).length, 1, q);
    assert.equal(searchProducts(db, 'tr', 'yok', now, 7).length, 0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('marka+mpn eşleştirme: tek eşleşme teklif, belirsiz/markasız unmatched, normalizasyon', async () => {
  const { mpnKey } = await import('../lib/ingest.mjs');
  assert.equal(mpnKey('Logitech', 'MX-Master 3S'), mpnKey(' LOGITECH ', 'mxmaster3s'));
  assert.equal(mpnKey('', 'ABC123'), null);
  assert.equal(mpnKey('Acme', 'A-1'), null); // mpn 3 karakterden kısa
  const dir = mkdtempSync(join(tmpdir(), 'kb-mpn-'));
  const db = openDb(dir);
  try {
    const shopA = db
      .prepare('SELECT * FROM shops WHERE id = ?')
      .get(addShop(db, { market: 'de', name: 'A', domain: 'a.test', shippingDefault: 0 }));
    const shopB = db
      .prepare('SELECT * FROM shops WHERE id = ?')
      .get(addShop(db, { market: 'de', name: 'B', domain: 'b.test', shippingDefault: 0 }));
    const now = Date.now();
    const base = { price: '10,00', currency: 'EUR' };
    // EAN + mpn'li ürün: mpnKey yazılır
    assert.equal(
      ingestOffer(
        db,
        shopA,
        {
          ...base,
          ean: '4006381333931',
          title: 'Mouse',
          brand: 'Logitech',
          mpn: '910-006559',
          url: 'https://a.test/1',
        },
        now,
      ),
      'offer',
    );
    const p = db.prepare('SELECT mpn, mpnKey FROM products WHERE ean = ?').get('4006381333931');
    assert.deepEqual({ ...p }, { mpn: '910-006559', mpnKey: mpnKey('Logitech', '910-006559') });
    // EAN'sız, marka+mpn tek ürüne denk geliyor (büyük/küçük harf, boşluk, tire farkı) -> teklif
    assert.equal(
      ingestOffer(
        db,
        shopB,
        { ...base, title: 'Logi Mouse', brand: 'LOGITECH', mpn: '910 006559', url: 'https://b.test/1' },
        now,
      ),
      'offer',
    );
    assert.equal(db.prepare('SELECT ean FROM offers WHERE shopId = ?').get(shopB.id).ean, '4006381333931');
    // Marka yok -> unmatched; mpn/sku unmatched'a yazılır
    assert.equal(
      ingestOffer(
        db,
        shopB,
        { ...base, title: 'Mouse', mpn: '910-006559', sku: 'SKU-9', url: 'https://b.test/2' },
        now,
      ),
      'unmatched',
    );
    const u = db.prepare('SELECT mpn, sku FROM unmatched WHERE url = ?').get('https://b.test/2');
    assert.deepEqual({ ...u }, { mpn: '910-006559', sku: 'SKU-9' });
    // Aynı anahtarlı ikinci ürün -> belirsiz -> unmatched
    ingestOffer(
      db,
      shopA,
      {
        ...base,
        ean: '96385074',
        title: 'Mouse 2',
        brand: 'logitech',
        mpn: '910006559',
        url: 'https://a.test/2',
      },
      now,
    );
    assert.equal(
      ingestOffer(
        db,
        shopB,
        { ...base, title: 'Mouse', brand: 'Logitech', mpn: '910-006559', url: 'https://b.test/3' },
        now,
      ),
      'unmatched',
    );
    // Bilinmeyen mpn -> unmatched (bulanık başlık eşleştirmesi yok)
    assert.equal(
      ingestOffer(
        db,
        shopB,
        { ...base, title: 'Mouse', brand: 'Logitech', mpn: 'ZZZ999', url: 'https://b.test/4' },
        now,
      ),
      'unmatched',
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Gerçek mağaza sayfalarından (2026-11-17) alınmış JSON-LD kalıpları ----
import { readFileSync } from 'node:fs';
import { extractProducts as extractFx } from '../crawler/jsonld.mjs';
const fx = n => extractFx(readFileSync(new URL(`./fixtures/${n}.html`, import.meta.url), 'utf8'));

test('JSON-LD: Product/Offer/Brand ayrı bloklarda @id ile bağlı (voelkner.de)', () => {
  const [p] = fx('voelkner');
  assert.equal(p.ean, '2050004913187');
  assert.equal(p.brand, 'TRU COMPONENTS');
  assert.equal(p.offers[0].price, 0.02);
  assert.equal(p.offers[0].currency, 'EUR');
  assert.equal(p.offers[0].inStock, true);
});

test('JSON-LD: ProductGroup + hasVariant, her varyant kendi GTIN/fiyatıyla (parfumdreams.de)', () => {
  const ps = fx('parfumdreams');
  assert.ok(ps.length >= 2);
  for (const p of ps) {
    assert.match(p.ean, /^\d{13}$/);
    assert.equal(p.brand, 'CLARINS');
    assert.equal(p.offers[0].currency, 'EUR');
    assert.ok(p.offers[0].price > 0);
  }
  assert.equal(new Set(ps.map(p => p.ean)).size, ps.length);
});

test("JSON-LD: TR mağaza sayfaları (dr.com.tr EAN'lı, flo.com.tr EAN'sız)", () => {
  const [d] = fx('dr-com-tr');
  assert.equal(d.ean, '8684990960036');
  assert.equal(d.offers[0].currency, 'TRY');
  const [f] = fx('flo');
  assert.equal(f.ean, '');
  assert.equal(f.offers[0].currency, 'TRY');
});

// ---- MPN anahtarı, v4 göçü ve promoteUnmatched ----
test('mpnKey: ayırıcı ve marka yazım farkları aynı anahtarı verir, güvensiz değerler null', async () => {
  const { mpnKey } = await import('../lib/ingest.mjs');
  assert.equal(mpnKey('Festina', 'F20636/1'), mpnKey('Festina', 'F20636-1'));
  assert.equal(mpnKey('Festina', 'F20636.1'), mpnKey('FESTINA', 'f20636 1'));
  assert.equal(mpnKey('Good Connections', 'K8104GN'), mpnKey('GoodConnections', 'k8104gn'));
  assert.equal(mpnKey('Synergy 21', 'S215413'), mpnKey('Synergy21', 'S215413'));
  assert.equal(mpnKey('EFB Elektronik', 'K8104GN'), mpnKey('EFB-Elektronik', 'K8104GN'));
  assert.equal(mpnKey('Festina', 'F20636-1'), 'festina|f206361');
  assert.equal(mpnKey('Acme', 'A-12'), null); // 5 karakterden kısa
  assert.equal(mpnKey('Acme', 'ABCDEF'), null); // rakam yok
  assert.equal(mpnKey('Acme', '4006381333931'), null); // barkod
  for (const iç of ['BA-21150232', 'arp-17', 'OT-12345', 'UHREN1-EFB-109D-7AVEF'])
    assert.equal(mpnKey('Casio', iç), null, iç);
});

test('ingestOffer: iç kod mpn olarak saklanmaz; eşleşmeyen satıra mpnKey yazılır', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-mpn4-'));
  const db = openDb(dir);
  try {
    const shop = db
      .prepare('SELECT * FROM shops WHERE id = ?')
      .get(addShop(db, { market: 'de', name: 'M', domain: 'mixoutlet.de' }));
    const base = { price: '10,00', currency: 'EUR', title: 'Casio Edifice EFB-109D-7AVEF', brand: 'Casio' };
    assert.equal(
      ingestOffer(db, shop, { ...base, mpn: 'UHREN1-EFB-109D-7AVEF', url: 'https://m.test/a' }, Date.now()),
      'unmatched',
    );
    const a = db.prepare('SELECT mpn, mpnKey FROM unmatched WHERE url = ?').get('https://m.test/a');
    assert.deepEqual({ ...a }, { mpn: null, mpnKey: null });
    assert.equal(
      ingestOffer(db, shop, { ...base, mpn: 'EFB-109D-7AVEF', url: 'https://m.test/b' }, Date.now()),
      'unmatched',
    );
    const b = db.prepare('SELECT mpn, mpnKey FROM unmatched WHERE url = ?').get('https://m.test/b');
    assert.deepEqual({ ...b }, { mpn: 'EFB-109D-7AVEF', mpnKey: 'casio|efb109d7avef' });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate v4: eski anahtarlar yeniden hesaplanır, iç kodlar temizlenir', async () => {
  const { migrate } = await import('../db/schema.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kb-v4-'));
  const db = openDb(dir);
  try {
    const sid = addShop(db, { market: 'de', name: 'M', domain: 'mixoutlet.de' });
    db.prepare(
      'INSERT INTO products (ean, title, brand, createdAt, mpn, mpnKey) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('4006381333931', 'Uhr', 'Festina', 1, 'F20636/1', 'festina|f20636/1');
    db.prepare(
      'INSERT INTO products (ean, title, brand, createdAt, mpn, mpnKey) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('96385074', 'Kabel', 'DeLOCK', 1, 'BA-21150232', 'delock|ba21150232');
    const ins = db.prepare(
      "INSERT INTO unmatched (shopId, title, price, currency, url, seenAt, brand, mpn, sku, mpnKey) VALUES (?, ?, 10, 'EUR', ?, 1, ?, ?, ?, ?)",
    );
    ins.run(
      sid,
      'Casio Edifice EFB-109D-7AVEF Uhr',
      'https://m.test/1',
      'Casio',
      'UHREN1-EFB-109D-7AVEF',
      'UHREN1-EFB-109D-7AVEF',
      'casio|uhren1efb109d7avef',
    );
    ins.run(
      sid,
      'Delock Kabel',
      'https://m.test/2',
      'DeLOCK',
      'BA-21150232',
      'BA-21150232',
      'delock|ba21150232',
    );
    ins.run(sid, 'Good Kabel', 'https://m.test/3', 'Good Connections', 'K8104GN', null, null);
    db.exec('PRAGMA user_version = 3');
    migrate(db);
    const p = db
      .prepare('SELECT ean, mpn, mpnKey FROM products ORDER BY ean')
      .all()
      .map(r => ({ ...r }));
    assert.deepEqual(p, [
      { ean: '4006381333931', mpn: 'F20636/1', mpnKey: 'festina|f206361' },
      { ean: '96385074', mpn: null, mpnKey: null },
    ]);
    const u = db
      .prepare('SELECT url, mpn, mpnKey FROM unmatched ORDER BY url')
      .all()
      .map(r => ({ ...r }));
    assert.deepEqual(u, [
      { url: 'https://m.test/1', mpn: 'EFB-109D-7AVEF', mpnKey: 'casio|efb109d7avef' },
      { url: 'https://m.test/2', mpn: null, mpnKey: null },
      { url: 'https://m.test/3', mpn: 'K8104GN', mpnKey: 'goodconnections|k8104gn' },
    ]);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'unmatched_mpnKey'")
      .get();
    assert.ok(idx);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'mixo_enrich'").get());
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate v4: elle kurulmuş v3 veritabanı (mpnKey sütunu ve mixo_enrich yok), ikinci çalıştırma veriyi bozmaz', async () => {
  const { migrate } = await import('../db/schema.mjs');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE products (ean TEXT PRIMARY KEY, title TEXT NOT NULL, brand TEXT, category TEXT, image TEXT, createdAt INTEGER NOT NULL, mpn TEXT, mpnKey TEXT);
      CREATE TABLE shops (id INTEGER PRIMARY KEY AUTOINCREMENT, market TEXT NOT NULL, name TEXT NOT NULL, domain TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, blocked INTEGER NOT NULL DEFAULT 0, network TEXT, networkMerchantId TEXT);
      CREATE TABLE offers (id INTEGER PRIMARY KEY AUTOINCREMENT, shopId INTEGER NOT NULL, ean TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, url TEXT NOT NULL, seenAt INTEGER NOT NULL, deepLink TEXT);
      CREATE TABLE unmatched (id INTEGER PRIMARY KEY AUTOINCREMENT, shopId INTEGER NOT NULL, title TEXT, rawEan TEXT, price REAL NOT NULL, currency TEXT NOT NULL, url TEXT NOT NULL, seenAt INTEGER NOT NULL, brand TEXT, mpn TEXT, sku TEXT, deepLink TEXT, UNIQUE (shopId, url));
      INSERT INTO shops (market, name, domain) VALUES ('de', 'M', 'mixoutlet.de');
      INSERT INTO products (ean, title, brand, createdAt, mpn, mpnKey) VALUES ('4006381333931', 'Uhr', 'Festina', 1, 'F20636/1', 'festina|f20636/1');
      INSERT INTO products (ean, title, brand, createdAt, mpn, mpnKey) VALUES ('96385074', 'Kabel', 'DeLOCK', 1, 'BA-21150232', 'delock|ba21150232');
      INSERT INTO unmatched (shopId, title, price, currency, url, seenAt, brand, mpn, sku) VALUES (1, 'Casio Edifice EFB-109D-7AVEF Uhr', 10, 'EUR', 'https://m.test/1', 1, 'Casio', 'UHREN1-EFB-109D-7AVEF', 'UHREN1-EFB-109D-7AVEF');
      INSERT INTO unmatched (shopId, title, price, currency, url, seenAt, brand, mpn, sku) VALUES (1, 'Delock Kabel', 10, 'EUR', 'https://m.test/2', 1, 'DeLOCK', 'BA-21150232', 'BA-21150232');
      INSERT INTO unmatched (shopId, title, price, currency, url, seenAt, brand, mpn, sku) VALUES (1, 'Good Kabel', 10, 'EUR', 'https://m.test/3', 1, 'Good Connections', 'K8104GN', NULL);
      PRAGMA user_version = 3;
    `);
    const snap = () => ({
      p: db
        .prepare('SELECT ean, mpn, mpnKey FROM products ORDER BY ean')
        .all()
        .map(r => ({ ...r })),
      u: db
        .prepare('SELECT url, mpn, mpnKey FROM unmatched ORDER BY url')
        .all()
        .map(r => ({ ...r })),
    });
    migrate(db);
    const first = snap();
    assert.deepEqual(first.p, [
      { ean: '4006381333931', mpn: 'F20636/1', mpnKey: 'festina|f206361' },
      { ean: '96385074', mpn: null, mpnKey: null },
    ]);
    assert.deepEqual(first.u, [
      { url: 'https://m.test/1', mpn: 'EFB-109D-7AVEF', mpnKey: 'casio|efb109d7avef' },
      { url: 'https://m.test/2', mpn: null, mpnKey: null },
      { url: 'https://m.test/3', mpn: 'K8104GN', mpnKey: 'goodconnections|k8104gn' },
    ]);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'unmatched_mpnKey'").get());
    migrate(db);
    assert.deepEqual(snap(), first);
    assert.equal(db.prepare('SELECT count(*) n FROM unmatched').get().n, 3);
  } finally {
    db.close();
  }
});

test("promoteUnmatched: Mixoutlet önce, EAN'lı rakip sonra gelince satır offers'a taşınır; belirsiz anahtara dokunulmaz", async () => {
  const { promoteUnmatched } = await import('../lib/ingest.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kb-promote-'));
  const db = openDb(dir);
  try {
    const row = id => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    const mixo = row(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' }));
    const rival = row(addShop(db, { market: 'de', name: 'Rakip', domain: 'rakip.test', shippingDefault: 4 }));
    const now = Date.now();
    const m = { price: '164,41', currency: 'EUR', brand: 'Casio' };
    ingestOffer(
      db,
      mixo,
      { ...m, title: 'Casio EFB-109D-7AVEF', mpn: 'EFB-109D-7AVEF', url: 'https://mixo.test/p1' },
      now - 5000,
    );
    ingestOffer(
      db,
      mixo,
      { ...m, title: 'Casio ABC-12345', mpn: 'ABC-12345', url: 'https://mixo.test/p2' },
      now,
    );
    assert.equal(promoteUnmatched(db, now), 0); // henüz ürün yok
    // rakip EAN'lı ürünü getirir
    ingestOffer(
      db,
      rival,
      {
        ean: '4006381333931',
        title: 'Casio Edifice',
        brand: 'Casio',
        mpn: 'EFB 109D 7AVEF',
        price: '139,00',
        url: 'https://rakip.test/1',
      },
      now,
    );
    assert.equal(promoteUnmatched(db, now), 1);
    const o = db.prepare('SELECT ean, price, seenAt FROM offers WHERE shopId = ?').get(mixo.id);
    assert.deepEqual({ ...o }, { ean: '4006381333931', price: 164.41, seenAt: now - 5000 }); // tazelik korunur
    assert.equal(db.prepare('SELECT count(*) n FROM unmatched WHERE shopId = ?').get(mixo.id).n, 1);
    // belirsiz: aynı anahtar iki farklı EAN'lı üründe
    for (const ean of ['96385074', '5901234123457'])
      ingestOffer(
        db,
        rival,
        {
          ean,
          title: 'Casio ABC',
          brand: 'Casio',
          mpn: 'ABC-12345',
          price: '10',
          url: 'https://rakip.test/' + ean,
        },
        now,
      );
    assert.equal(promoteUnmatched(db, now), 0);
    assert.equal(db.prepare('SELECT count(*) n FROM unmatched WHERE shopId = ?').get(mixo.id).n, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MPN bağı: aynı mağazanın başka adresli teklifi olan EAN'a bağlanmaz (paket/renk aynı MPN'i paylaşsa da fiyat ezilmez)", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-mpn-conflict-'));
  const db = openDb(dir);
  try {
    const row = id => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    const mixo = row(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' }));
    const now = Date.now();
    const toner = { brand: 'Brother', mpn: 'TN-2420', currency: 'EUR' };
    // Barkodlu tekli toner: kendi EAN'ı ve Mixoutlet teklifi
    assert.equal(
      ingestOffer(
        db,
        mixo,
        {
          ...toner,
          ean: '4977766779494',
          title: 'Brother TN-2420 Toner',
          price: '60',
          url: 'https://mixoutlet.de/products/a',
        },
        now,
      ),
      'offer',
    );
    // Aynı MPN'li barkodsuz 2'li paket: tekli ürünün teklifini ezmemeli, eşleşmemiş kalmalı
    assert.equal(
      ingestOffer(
        db,
        mixo,
        {
          ...toner,
          title: 'Brother TN-2420 Toner 2er Pack',
          price: '115',
          url: 'https://mixoutlet.de/products/b',
        },
        now,
      ),
      'unmatched',
    );
    const offers = db.prepare('SELECT price, url FROM offers WHERE shopId = ?').all(mixo.id);
    assert.deepEqual(
      offers.map(o => ({ ...o })),
      [{ price: 60, url: 'https://mixoutlet.de/products/a' }],
    );
    // Aynı adresin yeniden işlenmesi (güncelleme) engellenmez
    assert.equal(
      ingestOffer(
        db,
        mixo,
        { ...toner, title: 'Brother TN-2420 Toner', price: '58', url: 'https://mixoutlet.de/products/a' },
        now,
      ),
      'offer',
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('promoteUnmatched: aynı mağazada aynı anahtarlı 2 eşleşmemiş satır (renk varyantı) terfi etmez', async () => {
  const { promoteUnmatched } = await import('../lib/ingest.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kb-promote-amb-'));
  const db = openDb(dir);
  try {
    const row = id => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    const mixo = row(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' }));
    const rival = row(addShop(db, { market: 'de', name: 'Rakip', domain: 'rakip.test' }));
    const now = Date.now();
    const hp = { brand: 'HP', mpn: '305XL', currency: 'EUR' };
    ingestOffer(
      db,
      mixo,
      { ...hp, title: 'HP 305XL schwarz', price: '30', url: 'https://mixoutlet.de/products/s' },
      now,
    );
    ingestOffer(
      db,
      mixo,
      { ...hp, title: 'HP 305XL farbig', price: '45', url: 'https://mixoutlet.de/products/f' },
      now,
    );
    ingestOffer(
      db,
      rival,
      { ...hp, ean: '4006381333931', title: 'HP 305XL Tinte', price: '25', url: 'https://rakip.test/hp' },
      now,
    );
    assert.equal(promoteUnmatched(db, now), 0);
    assert.equal(db.prepare('SELECT count(*) n FROM unmatched WHERE shopId = ?').get(mixo.id).n, 2);
    assert.equal(db.prepare('SELECT count(*) n FROM offers WHERE shopId = ?').get(mixo.id).n, 0);
    // Biri kalkınca (tek satır) terfi eder
    db.prepare("DELETE FROM unmatched WHERE url LIKE '%/f'").run();
    assert.equal(promoteUnmatched(db, now), 1);
    assert.equal(db.prepare('SELECT price FROM offers WHERE shopId = ?').get(mixo.id).price, 30);
    // Mixoutlet'in aynı EAN'da başka adresli teklifi varken ikinci ürün terfi etmez
    ingestOffer(
      db,
      mixo,
      { ...hp, title: 'HP 305XL 2er', price: '99', url: 'https://mixoutlet.de/products/x' },
      now,
    );
    assert.equal(promoteUnmatched(db, now), 0);
    assert.equal(db.prepare('SELECT price FROM offers WHERE shopId = ?').get(mixo.id).price, 30);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: SEARCH_DAILY_CAP 0 geçerli (aramayı kapatır), geçersiz değer varsayılana (1000) düşer', async () => {
  const { loadConfig } = await import('../lib/config.mjs');
  assert.equal(loadConfig({}).searchDailyCap, 1000);
  assert.equal(loadConfig({ SEARCH_DAILY_CAP: '0' }).searchDailyCap, 0);
  assert.equal(loadConfig({ SEARCH_DAILY_CAP: '250' }).searchDailyCap, 250);
  assert.equal(loadConfig({ SEARCH_DAILY_CAP: 'abc' }).searchDailyCap, 1000);
  assert.equal(loadConfig({ SEARCH_DAILY_CAP: '-5' }).searchDailyCap, 1000);
  assert.equal(loadConfig({ SEARCH_DAILY_CAP: '' }).searchDailyCap, 1000);
});

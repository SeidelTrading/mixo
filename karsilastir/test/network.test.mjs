import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { createCsvParser } from '../feeds/csv.mjs';
import { csvGetter, mapNetworkRow, resolvePreset } from '../feeds/networks.mjs';
import { redactUrl, rowMarket, runNetworkFeed, runDueNetworkFeeds } from '../feeds/network.mjs';
import { decompress, textChunks } from '../feeds/stream.mjs';
import { createXmlItemSplitter, xmlValue } from '../feeds/xml.mjs';

/** EAN-13 kontrol basamağını ekler. */
const ean13 = d12 => {
  const s = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return d12 + ((10 - (s % 10)) % 10);
};
const E1 = ean13('400638133390');
const E2 = ean13('871234567890');
const E3 = ean13('869000000001');

/** Bayt dizisini n baytlık parçalara bölen async iterable. */
async function* chunked(buf, n) {
  for (let i = 0; i < buf.length; i += n) yield buf.subarray(i, i + n);
}
const collect = async it => {
  const out = [];
  for await (const c of it) out.push(Buffer.from(c));
  return Buffer.concat(out);
};
const collectText = async it => {
  let s = '';
  for await (const t of it) s += t;
  return s;
};

/** Tek dosyalı zip (yerel başlık + veri [+ veri tanımlayıcı] + merkez dizin taklidi). */
function zipOf(name, content, { method = 8, descriptor = false } = {}) {
  const data = method === 8 ? deflateRawSync(content) : Buffer.from(content);
  const n = Buffer.from(name);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(descriptor ? 0x08 : 0, 6);
  h.writeUInt16LE(method, 8);
  h.writeUInt32LE(descriptor ? 0 : data.length, 18);
  h.writeUInt32LE(descriptor ? 0 : Buffer.byteLength(content), 22);
  h.writeUInt16LE(n.length, 26);
  h.writeUInt16LE(0, 28);
  const tail = Buffer.from('PK\x01\x02 central directory, ignored', 'latin1');
  return Buffer.concat([h, n, data, descriptor ? Buffer.alloc(16) : Buffer.alloc(0), tail]);
}

test('decompress: gzip, zip (deflate/stored/descriptor), düz; 1-7 baytlık parça sınırları', async () => {
  const text = 'ean;title\n' + 'x'.repeat(5000) + ';Größe ölçü 測試\n';
  const src = Buffer.from(text);
  for (const n of [1, 3, 7, 4096]) {
    assert.equal((await collect(decompress(chunked(gzipSync(src), n)))).toString(), text, `gzip/${n}`);
    assert.equal((await collect(decompress(chunked(zipOf('f.csv', text), n)))).toString(), text, `zip/${n}`);
    assert.equal(
      (await collect(decompress(chunked(zipOf('f.csv', text, { method: 0 }), n)))).toString(),
      text,
      `zip stored/${n}`,
    );
    assert.equal(
      (await collect(decompress(chunked(zipOf('f.csv', text, { descriptor: true }), n)))).toString(),
      text,
      `zip descriptor/${n}`,
    );
    assert.equal((await collect(decompress(chunked(src, n)))).toString(), text, `plain/${n}`);
    // çok baytlı UTF-8 karakterleri parça sınırında bölünmez
    assert.equal(await collectText(textChunks(decompress(chunked(gzipSync(src), n)))), text);
  }
  await assert.rejects(
    collect(decompress(chunked(gzipSync(Buffer.alloc(100000)), 512), { maxBytes: 1000 })),
    /sınır/,
  );
  await assert.rejects(collect(decompress(chunked(zipOf('f', 'a', { method: 0, descriptor: true }), 4)))); // boyutsuz stored
  const bom = await collectText(textChunks(chunked(Buffer.from('﻿a;b\n'), 1)));
  assert.equal(bom, 'a;b\n'); // TextDecoder BOM'u atar
});

test('Awin ön ayarı: sütunlar, alternatifler, boş in_stock = stokta yok', () => {
  const csv = `aw_deep_link,product_name,merchant_id,merchant_name,merchant_deep_link,store_price,currency,product_GTIN,brand_name,delivery_cost,merchant_category,in_stock,aw_image_url
https://www.awin1.com/pclick.php?p=1&a=2,Kulaklık X,77,Shop TR,https://shop-tr.example/p/1,"1.299,90",try,${E1},Acme,0,Ses,1,https://img.example/1.jpg
https://www.awin1.com/pclick.php?p=2&a=2,Kopfhörer Y,88,Shop DE,https://www.shop-de.example/p/2,19.90,EUR,,Acme,4.90,Audio,,
`;
  const p = createCsvParser();
  const rows = [...p.push(csv), ...p.end()];
  const get = csvGetter(rows[0]);
  const preset = resolvePreset('awin');
  const a = mapNetworkRow(get(rows[1]), preset);
  assert.deepEqual(a, {
    ean: E1,
    title: 'Kulaklık X',
    brand: 'Acme',
    price: '1.299,90',
    shipping: '0',
    currency: 'TRY',
    url: 'https://shop-tr.example/p/1',
    deepLink: 'https://www.awin1.com/pclick.php?p=1&a=2',
    image: 'https://img.example/1.jpg',
    category: 'Ses',
    inStock: true,
    merchantId: '77',
    merchantName: 'Shop TR',
  });
  const b = mapNetworkRow(get(rows[2]), preset);
  assert.equal(b.inStock, false); // Awin: boş = stokta yok
  assert.equal(b.ean, undefined);
  assert.equal(b.shipping, '4.90');
  // mapping ile ezme
  const o = resolvePreset('awin', { price: 'delivery_cost', _blankOutOfStock: false });
  assert.equal(mapNetworkRow(get(rows[2]), o).price, '4.90');
  assert.equal(mapNetworkRow(get(rows[2]), o).inStock, true);
  assert.throws(() => resolvePreset('awin', { nope: 'x' }), /bilinmeyen alan/);
  assert.throws(() => resolvePreset('awin', { ean: 5 }), /metin/);
  assert.throws(() => resolvePreset('zanox'), /bilinmeyen ağ/);
});

test('Daisycon ön ayarı', () => {
  const csv = `ean;title;brand;price;price_shipping;currency;link;image_default;category;in_stock;program_id;program_name
${E2};Koptelefoon;Acme;24,95;0;EUR;https://ds1.nl/c/?si=1&li=2;https://img.example/d.jpg;Audio;false;123;Winkel NL`;
  const p = createCsvParser();
  const rows = [...p.push(csv), ...p.end()];
  const r = mapNetworkRow(csvGetter(rows[0])(rows[1]), resolvePreset('daisycon'));
  assert.equal(r.ean, E2);
  assert.equal(r.price, '24,95');
  assert.equal(r.shipping, '0');
  assert.equal(r.deepLink, 'https://ds1.nl/c/?si=1&li=2');
  assert.equal(r.url, undefined); // Daisycon'da ayrı mağaza adresi yok -> ingestOffer deepLink'e düşer
  assert.equal(r.inStock, false);
  assert.equal(r.merchantId, '123');
  assert.equal(r.merchantName, 'Winkel NL');
});

const TD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:productsResult xmlns:ns2="urn:com:tradedoubler:pf:model:xml:output">
<ns2:products>
<ns2:product>
  <ns2:name>Hoofdtelefoon &amp; Co</ns2:name>
  <ns2:productImage><ns2:url>https://img.example/td.jpg</ns2:url></ns2:productImage>
  <ns2:productUrl>https://clk.tradedoubler.com/click?p=1&amp;a=2</ns2:productUrl>
  <ns2:price><ns2:value>39.99</ns2:value><ns2:currency>EUR</ns2:currency></ns2:price>
  <ns2:categories><ns2:category name="Audio"/></ns2:categories>
  <ns2:identifiers><ns2:ean>${E2}</ns2:ean><ns2:sku>S1</ns2:sku></ns2:identifiers>
  <ns2:brand>Acme</ns2:brand><ns2:shippingCost>2.95</ns2:shippingCost><ns2:inStock>0</ns2:inStock>
  <ns2:sourceProductUrl>https://shop-nl.example/p/9</ns2:sourceProductUrl>
  <ns2:programName>Winkel TD</ns2:programName><ns2:programId>555</ns2:programId>
</ns2:product>
<ns2:product><ns2:name>Zonder prijsvaluta</ns2:name><ns2:price>10.00</ns2:price><ns2:feedId>9</ns2:feedId><ns2:availability>in stock</ns2:availability></ns2:product>
</ns2:products></ns2:productsResult>`;

test('Tradedoubler ön ayarı: ns2 öneki, iç içe yollar, öznitelik, varsayılan para birimi', () => {
  const sp = createXmlItemSplitter({ itemTag: 'product' });
  const blocks = [];
  for (let i = 0; i < TD_XML.length; i += 13) blocks.push(...sp.push(TD_XML.slice(i, i + 13)));
  blocks.push(...sp.end());
  assert.equal(blocks.length, 2);
  const preset = resolvePreset('tradedoubler', { _currency: 'eur' });
  const a = mapNetworkRow(c => xmlValue(blocks[0], c), preset);
  assert.deepEqual(a, {
    ean: E2,
    title: 'Hoofdtelefoon & Co',
    brand: 'Acme',
    price: '39.99',
    shipping: '2.95',
    currency: 'EUR',
    url: 'https://shop-nl.example/p/9',
    deepLink: 'https://clk.tradedoubler.com/click?p=1&a=2',
    image: 'https://img.example/td.jpg',
    category: 'Audio',
    inStock: false,
    merchantId: '555',
    merchantName: 'Winkel TD',
  });
  const b = mapNetworkRow(c => xmlValue(blocks[1], c), preset);
  assert.equal(b.price, '10.00');
  assert.equal(b.currency, 'EUR'); // _currency
  assert.equal(b.merchantId, '9'); // feedId alternatifi
  assert.equal(b.inStock, true);
});

test('rowMarket ve redactUrl', () => {
  const feed = { market: 'nl' };
  assert.deepEqual(rowMarket({ currency: 'TRY' }, feed), { market: 'tr' });
  assert.deepEqual(rowMarket({ currency: 'EUR' }, feed), { market: 'nl' });
  assert.deepEqual(rowMarket({ currency: 'EUR' }, { market: 'tr' }), { skip: 'currency' });
  assert.deepEqual(rowMarket({ currency: 'USD' }, feed), { skip: 'currency' });
  assert.deepEqual(rowMarket({ country: 'DE', currency: 'EUR' }, feed), { market: 'de' });
  assert.deepEqual(rowMarket({ country: 'de', currency: 'TRY' }, feed), { skip: 'currency' });
  assert.deepEqual(rowMarket({ country: 'FR', currency: 'EUR' }, feed), { skip: 'country' });
  assert.deepEqual(rowMarket({}, feed), { market: 'nl' });
  assert.equal(
    redactUrl('https://x.example/a.xml;fid=1?token=abc123&apikey=zz&x=1'),
    'https://x.example/a.xml;fid=1?token=***&apikey=***&x=1',
  );
  assert.equal(redactUrl('https://x.example/?key={key}'), 'https://x.example/?key={key}');
});

const AWIN_CSV = `aw_deep_link,product_name,merchant_id,merchant_name,merchant_deep_link,search_price,currency,ean,in_stock
https://www.awin1.com/c?m=1&p=a,Ürün A,1,Mağaza Bir,https://www.bir.example/a,"100,00",TRY,${E1},1
https://www.awin1.com/c?m=1&p=b,Produkt A,1,Mağaza Bir,https://www.bir.example/a-de,9.99,EUR,${E1},1
https://www.awin1.com/c?m=2&p=c,Produkt B,2,Zwei,https://zwei.example/b,5.00,EUR,${E2},1
https://www.awin1.com/c?m=2&p=d,Ohne EAN,2,Zwei,https://zwei.example/x,5.00,EUR,,1
https://www.awin1.com/c?m=3&p=e,Dollar,3,Usd,https://usd.example/x,5.00,USD,${E3},1
https://www.awin1.com/c?m=2&p=f,Kein Preis,2,Zwei,https://zwei.example/y,,EUR,${E3},1
`;

const gzResponse = (text, n = 50) =>
  new Response(
    new ReadableStream({
      start(c) {
        const gz = gzipSync(Buffer.from(text));
        for (let i = 0; i < gz.length; i += n) c.enqueue(gz.subarray(i, i + n));
        c.close();
      },
    }),
  );

function withDb(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-net-'));
    const db = openDb(dir);
    try {
      await fn(db);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

const addFeed = (db, f) => {
  const r = db
    .prepare(
      `INSERT INTO network_feeds (network, name, url, format, secretEnv, secret, market, mapping, rowLimit, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      f.network ?? 'awin',
      f.name ?? 'Awin DE',
      f.url,
      f.format ?? null,
      f.secretEnv ?? null,
      f.secret ?? null,
      f.market ?? 'de',
      f.mapping ?? null,
      f.rowLimit ?? 500000,
      0,
    );
  return db.prepare('SELECT * FROM network_feeds WHERE id = ?').get(Number(r.lastInsertRowid));
};

test(
  'runNetworkFeed: çok mağazalı dosya pazar başına mağaza açar, engelli mağazayı atlar, özet yazar',
  withDb(async db => {
    const urls = [];
    const fetchImpl = async u => (urls.push(u), gzResponse(AWIN_CSV, 17));
    const feed = addFeed(db, {
      url: 'https://feeds.awin.example/feed.csv.gz?apikey={key}',
      secret: 's3cr3t-KEY',
    });
    const r = await runNetworkFeed(db, feed, { fetchImpl, now: () => 1000 });
    assert.equal(r.ok, true, r.error);
    assert.equal(urls[0], 'https://feeds.awin.example/feed.csv.gz?apikey=s3cr3t-KEY');
    assert.equal(r.rows, 6);
    assert.equal(r.matched, 3);
    assert.equal(r.unmatched, 1);
    assert.deepEqual(r.skipped, { currency: 1, invalid: 1 });
    assert.equal(r.shopsCreated, 3); // (1,tr) (1,de) (2,de)
    assert.equal(r.merchants, 3);
    assert.equal(r.truncated, false);
    const shops = db.prepare('SELECT * FROM shops ORDER BY id').all();
    assert.deepEqual(
      shops.map(s => [s.network, s.networkMerchantId, s.market, s.name, s.domain]),
      [
        ['awin', '1', 'tr', 'Mağaza Bir', 'bir.example'],
        ['awin', '1', 'de', 'Mağaza Bir', 'bir.example'],
        ['awin', '2', 'de', 'Zwei', 'zwei.example'],
      ],
    );
    const offer = db.prepare('SELECT * FROM offers WHERE shopId = ?').get(shops[0].id);
    assert.equal(offer.price, 100);
    assert.equal(offer.deepLink, 'https://www.awin1.com/c?m=1&p=a');
    assert.equal(offer.url, 'https://www.bir.example/a');
    const saved = JSON.parse(
      db.prepare('SELECT lastResult FROM network_feeds WHERE id = ?').get(feed.id).lastResult,
    );
    assert.equal(saved.matched, 3);

    // ikinci çalıştırma: mağaza yeniden açılmaz; engelli mağaza atlanır
    db.prepare('UPDATE shops SET blocked = 1 WHERE id = ?').run(shops[2].id);
    const r2 = await runNetworkFeed(db, feed, { fetchImpl, now: () => 2000 });
    assert.equal(r2.shopsCreated, 0);
    assert.equal(r2.skipped.shopInactive, 3); // mağaza 2'nin 3 satırı
    assert.equal(r2.matched, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM shops').get().n, 3);
  }),
);

test(
  'runNetworkFeed: tek mağazalı dosya besleme adına mağaza; satır sınırı; env anahtar; özel adres; gizli anahtar sızmaz',
  withDb(async db => {
    const csv = `aw_deep_link,product_name,search_price,currency,ean\n${[1, 2, 3, 4, 5]
      .map(i => `https://a.example/${i},P${i},${i}.00,EUR,${ean13(String(400000000000 + i))}`)
      .join('\n')}\n`;
    const feed = addFeed(db, {
      name: 'Einzelshop',
      url: 'https://feeds.example/f?token={key}',
      secretEnv: 'FEED_TEST_KEY',
      rowLimit: 3,
    });
    const r = await runNetworkFeed(db, feed, {
      fetchImpl: async () => gzResponse(csv),
      env: { FEED_TEST_KEY: 'envsecret' },
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.rows, 3);
    assert.equal(r.truncated, true);
    const shop = db.prepare('SELECT * FROM shops').get();
    assert.equal(shop.name, 'Einzelshop');
    assert.equal(shop.networkMerchantId, `feed:${feed.id}`);
    assert.equal(shop.domain, '');

    const missing = await runNetworkFeed(db, feed, { fetchImpl: async () => gzResponse(csv), env: {} });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /anahtar/);

    const local = addFeed(db, { url: 'http://127.0.0.1:9/f?token={key}', secret: 'x' });
    assert.match((await runNetworkFeed(db, local, { fetchImpl: async () => gzResponse(csv) })).error, /özel/);

    const leaky = addFeed(db, { url: 'https://feeds.example/f?token={key}', secret: 'TOPSECRET' });
    const err = await runNetworkFeed(db, leaky, {
      fetchImpl: async u => {
        throw new Error(`fetch failed for ${u}`);
      },
    });
    assert.equal(err.ok, false);
    assert.ok(!JSON.stringify(err).includes('TOPSECRET'), JSON.stringify(err));
    assert.ok(
      !db
        .prepare('SELECT lastResult FROM network_feeds WHERE id = ?')
        .get(leaky.id)
        .lastResult.includes('TOPSECRET'),
    );

    const badEnv = addFeed(db, { url: 'https://feeds.example/f?token={key}', secretEnv: 'PATH' });
    assert.match(
      (await runNetworkFeed(db, badEnv, { fetchImpl: async () => gzResponse(csv) })).error,
      /FEED_/,
    );
  }),
);

test(
  'runNetworkFeed: aynı besleme aynı anda iki kez çalışmaz; zaman aşımı; runDueNetworkFeeds',
  withDb(async db => {
    const feed = addFeed(db, { url: 'https://feeds.example/f.csv' });
    let release;
    const gate = new Promise(r => (release = r));
    const slow = async () => {
      await gate;
      return gzResponse(AWIN_CSV);
    };
    const first = runNetworkFeed(db, feed, { fetchImpl: slow });
    const second = await runNetworkFeed(db, feed, { fetchImpl: slow });
    assert.equal(second.error, 'already running');
    release();
    assert.equal((await first).ok, true);

    const hang = addFeed(db, { url: 'https://feeds.example/hang.csv' });
    const t = await runNetworkFeed(db, hang, {
      timeoutMs: 50,
      fetchImpl: (_u, { signal }) =>
        new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason))),
    });
    assert.equal(t.ok, false);
    assert.match(t.error, /zaman aşımı/);

    db.prepare('UPDATE network_feeds SET lastRunAt = NULL, active = 0 WHERE id = ?').run(hang.id);
    const n = await runDueNetworkFeeds(db, {
      now: () => Date.now() + 25 * 3600000,
      fetchImpl: async () => gzResponse(AWIN_CSV),
    });
    assert.equal(n, 1); // yalnız etkin besleme
  }),
);

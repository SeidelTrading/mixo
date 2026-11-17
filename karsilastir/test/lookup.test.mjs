import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { CONNECTORS, ebay, signV4 } from '../lookup/connectors.mjs';
import { runLookups } from '../lookup/run.mjs';
import { NETWORKS, resolvePreset } from '../feeds/networks.mjs';

const EAN = '4006381333931';

test('bağlayıcılar anahtar yokken kapalı, anahtarla açık; ağ ön ayarları geçerli', () => {
  for (const c of CONNECTORS) assert.equal(c.enabled({}), false, c.id);
  assert.equal(ebay.enabled({ EBAY_CLIENT_ID: 'a', EBAY_CLIENT_SECRET: 'b' }), true);
  for (const n of ['webgains', 'tradetracker', 'adcell', 'belboon', 'cj']) {
    assert.ok(NETWORKS[n]);
    assert.ok(resolvePreset(n).columns.price.length);
  }
});

test('anahtar yokken runLookups hiçbir istek atmaz', async () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'lk-')));
  let calls = 0;
  const r = await runLookups(db, { env: {}, fetchImpl: async () => (calls++, new Response('{}')) });
  assert.deepEqual(r, {});
  assert.equal(calls, 0);
  db.close();
});

test('eBay bağlayıcı: GTIN ile en ucuz yeni teklif Mixoutlet ürününe rakip teklif olarak işlenir', async () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'lk-')));
  const mixo = db
    .prepare('SELECT * FROM shops WHERE id = ?')
    .get(addShop(db, { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de' }));
  ingestOffer(db, mixo, {
    ean: EAN,
    title: 'Ürün',
    brand: 'X',
    price: 100,
    url: 'https://mixoutlet.de/products/p',
  });
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(String(url));
    if (String(url).includes('oauth2/token')) return Response.json({ access_token: 't', expires_in: 7200 });
    assert.match(String(url), new RegExp(`gtin=${EAN}`));
    assert.equal(init.headers['x-ebay-c-marketplace-id'], 'EBAY_DE');
    return Response.json({
      itemSummaries: [
        {
          price: { value: '90.00', currency: 'EUR' },
          itemWebUrl: 'https://ebay.de/itm/1',
          title: 'a',
          shippingOptions: [{ shippingCost: { value: '5.00' } }],
        },
        { price: { value: '88.00', currency: 'EUR' }, itemWebUrl: 'https://ebay.de/itm/2', title: 'b' },
      ],
    });
  };
  const env = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 's' };
  const r = await runLookups(db, { env, fetchImpl, connectors: [ebay], sleep: async () => {} });
  assert.deepEqual(r.ebay, { asked: 1, found: 1, error: null });
  const o = db
    .prepare("SELECT o.price, o.url FROM offers o JOIN shops s ON s.id = o.shopId WHERE s.domain = 'ebay.de'")
    .get();
  assert.equal(o.price, 88);
  // ikinci tur: aynı EAN 7 gün içinde yeniden sorulmaz
  const again = await runLookups(db, { env, fetchImpl, connectors: [ebay], sleep: async () => {} });
  assert.equal(again.ebay.asked, 0);
  db.close();
});

test('SigV4 imzası biçimi (PA-API 5)', () => {
  const h = signV4({
    host: 'webservices.amazon.de',
    path: '/paapi5/searchitems',
    region: 'eu-west-1',
    service: 'ProductAdvertisingAPI',
    target: 'x',
    body: '{}',
    accessKey: 'AK',
    secretKey: 'SK',
    date: new Date('2026-11-17T10:00:00Z'),
  });
  assert.match(
    h.authorization,
    /^AWS4-HMAC-SHA256 Credential=AK\/20261117\/eu-west-1\/ProductAdvertisingAPI\/aws4_request, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/,
  );
  assert.equal(h['x-amz-date'], '20261117T100000Z');
});

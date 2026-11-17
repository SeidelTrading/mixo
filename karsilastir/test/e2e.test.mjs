import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { ingestOffer } from '../lib/ingest.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EAN = '4006381333931';
const dataDir = mkdtempSync(join(tmpdir(), 'kb-e2e-'));
const PASSWORD = 'e2e-test-password';
let child;
let base;

before(async () => {
  // Sunucu başlamadan önce 2 mağaza + teklifler tohumlanır (aynı DATA_DIR).
  const db = openDb(dataDir);
  const now = Date.now();
  const a = addShop(db, { market: 'de', name: 'ShopA', domain: 'shop-a.test', shippingDefault: 4.9 });
  const b = addShop(db, { market: 'de', name: 'ShopB', domain: 'shop-b.test', shippingDefault: 0 });
  const tr = addShop(db, { market: 'tr', name: 'TrShop', domain: 'tr-shop.test', shippingDefault: 0 });
  const base0 = {
    ean: EAN,
    title: 'Testkopfhörer <Pro>',
    brand: 'Acme',
    category: 'Kopfhörer',
    currency: 'EUR',
  };
  ingestOffer(
    db,
    db.prepare('SELECT * FROM shops WHERE id = ?').get(a),
    { ...base0, price: '19,90', url: 'https://shop-a.test/p/1' },
    now - 86400000,
  ); // 24,80 toplam, dün
  ingestOffer(
    db,
    db.prepare('SELECT * FROM shops WHERE id = ?').get(a),
    { ...base0, price: '19,90', url: 'https://shop-a.test/p/1' },
    now,
  );
  ingestOffer(
    db,
    db.prepare('SELECT * FROM shops WHERE id = ?').get(b),
    { ...base0, price: '22,00', url: 'https://shop-b.test/p/9' },
    now,
  ); // 22,00 toplam -> ilk sırada
  ingestOffer(
    db,
    db.prepare('SELECT * FROM shops WHERE id = ?').get(tr),
    { ean: EAN, title: 'Kulaklık', currency: 'TRY', price: '999,90', url: 'https://tr-shop.test/u/1' },
    now,
  );
  ingestOffer(
    db,
    db.prepare('SELECT * FROM shops WHERE id = ?').get(a),
    { title: 'Ohne EAN', price: '5', url: 'https://shop-a.test/p/x' },
    now,
  );
  db.close();

  child = spawn(process.execPath, ['--no-warnings', join(ROOT, 'server.mjs')], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: '0',
      ADMIN_PASSWORD: PASSWORD,
      SCHEDULER: '0',
      CRAWLER_ENABLED: '0',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  base = await new Promise((resolve, reject) => {
    child.once('exit', c => reject(new Error('sunucu çıktı ' + c)));
    child.stdout.on('data', d => {
      const m = String(d).match(/listening (http:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
  });
});

after(() => {
  child?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const get = (path, opts = {}) => fetch(base + path, { redirect: 'manual', ...opts });

test('pazar öneki: /tr /de /nl çalışır, bilinmeyen önek 404, kök seçici sayfa', async () => {
  for (const [m, lang] of [
    ['tr', 'tr'],
    ['de', 'de'],
    ['nl', 'nl'],
  ]) {
    const r = await get(`/${m}/`);
    assert.equal(r.status, 200);
    const h = await r.text();
    assert.match(h, new RegExp(`<html lang="${lang}"`));
    assert.match(h, new RegExp(`action="/${m}/search"`));
  }
  assert.equal((await get('/xx/')).status, 404);
  assert.equal((await get('/')).status, 200);
  assert.match(await (await get('/tr/')).text(), /Ara/);
  // yeni arayüz: başlıkta arama kutusu (etiketli), kategori çubuğu, düşen fiyatlar, alt bilgi
  const home = await (await get('/de/')).text();
  assert.match(
    home,
    /<header class="top">[\s\S]*<form class="search" action="\/de\/search" method="get" role="search">[\s\S]*<label class="sr" for="q">/,
  );
  assert.match(home, /<nav class="cats"[\s\S]*href="\/de\/search\?cat=Kopfh%C3%B6rer"/);
  assert.match(home, /Preis gesunken/);
  assert.match(home, /class="badge drop">−11 %/);
  assert.match(home, /<footer>[\s\S]*\/de\/legal\/imprint[\s\S]*href="\/bot"/);
  assert.match(await (await get('/nl/')).text(), /Nog geen producten/);
  assert.match(await (await get('/de/')).text(), /Suchen/);
  assert.match(await (await get('/nl/')).text(), /Zoeken/);
});

test('arama: ad, marka ve EAN ile bulur; yalnızca pazarın teklifleri; HTML kaçırılır', async () => {
  const byName = await (await get('/de/search?q=testkopfh%C3%B6rer')).text();
  assert.match(byName, new RegExp(`/de/product/${EAN}`));
  assert.match(byName, /Testkopfhörer &lt;Pro&gt;/);
  assert.ok(!byName.includes('<Pro>'));
  assert.match(await (await get('/de/search?q=acme')).text(), new RegExp(EAN));
  assert.match(await (await get(`/de/search?q=${EAN}`)).text(), new RegExp(EAN));
  const card = await (await get('/de/search?q=acme')).text();
  assert.match(card, /in 2 Shops · <span class="cheap">günstigster: ShopB<\/span>/);
  const cat = await (await get('/de/search?cat=Kopfh%C3%B6rer')).text();
  assert.match(cat, new RegExp(EAN));
  assert.ok(!(await (await get('/de/search?q=acme&brand=Nope')).text()).includes(`/de/product/${EAN}`));
  assert.ok(!(await (await get('/de/search?q=acme&min=23')).text()).includes(`/de/product/${EAN}`));
  assert.match(await (await get('/de/search?q=acme&max=23&stock=1&sort=cheap')).text(), new RegExp(EAN));
  assert.match(await (await get('/de/search?q=acme')).text(), /<details>/); // süzgeç mobilde kapalı <details>
  assert.match(await (await get('/nl/search?q=acme')).text(), /Geen resultaten/); // NL'de teklif yok
  assert.match(await (await get('/de/search?q=Ohne%20EAN')).text(), /Keine Ergebnisse/); // eşleşmemiş ürün yayınlanmaz
  const xss = await (await get('/de/search?q=%3Cscript%3Ealert(1)%3C/script%3E')).text();
  assert.ok(!xss.includes('<script>alert'));
});

test('ürün sayfası: toplam fiyata göre sıra, JSON-LD, hreflang, grafik, /go bağlantıları', async () => {
  const r = await get(`/de/product/${EAN}`);
  assert.equal(r.status, 200);
  const h = await r.text();
  assert.ok(
    h.indexOf('ShopB') < h.indexOf('ShopA'),
    'ShopB (22,00 toplam) ShopA (24,80 toplam) önünde olmalı',
  );
  assert.ok(!h.includes('TrShop')); // başka pazarın teklifi görünmez
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.gtin13, EAN);
  assert.equal(ld.offers['@type'], 'AggregateOffer');
  assert.deepEqual(
    [ld.offers.lowPrice, ld.offers.highPrice, ld.offers.priceCurrency, ld.offers.offerCount],
    [22, 24.8, 'EUR', 2],
  );
  assert.match(h, new RegExp(`hreflang="de" href="[^"]*/de/product/${EAN}"`));
  assert.match(h, new RegExp(`hreflang="tr" href="[^"]*/tr/product/${EAN}"`));
  assert.ok(!h.includes('rel="alternate" hreflang="nl"'));
  assert.match(h, /class="chart"[^>]*data-points="\[\[&quot;\d{4}-\d{2}-\d{2}&quot;,24\.8\]/); // fiyat geçmişi dünden
  assert.match(h, /href="\/go\/\d+"/);
  assert.match(h, /<nav class="crumbs"/);
  assert.match(
    h,
    /<tr class="best"><th scope="row" class="shopcell">ShopB <span class="badge cheap">Günstigster<\/span>/,
  );
  assert.equal(h.split('badge cheap').length - 1, 1); // rozet yalnızca ilk satırda
  assert.match(h, /class="pbig"[^>]*>[\s\S]*22,00/);
  assert.equal((await get('/nl/product/' + EAN)).status, 200); // başka pazarda teklif var -> sayfa var, teklifsiz
  assert.equal((await get('/de/product/4006381333932')).status, 404); // geçersiz EAN
  assert.equal((await get('/de/product/0000000000000')).status, 404);
  assert.match(await (await get(`/tr/product/${EAN}`)).text(), /999,90/);
  assert.equal((await (await get('/static/chart.js')).text()).includes('createElementNS'), true);
});

test('/go/<id>: 302 ile mağazaya yönlendirir, yalnızca gün+teklif sayılır', async () => {
  const h = await (await get(`/de/product/${EAN}`)).text();
  const id = h.match(/href="\/go\/(\d+)"/)[1];
  const r = await get(`/go/${id}`, { headers: { 'x-forwarded-for': '203.0.113.9', cookie: 'a=b' } });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^https:\/\/shop-b\.test\/p\/9$/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await get('/go/999999')).status, 404);
  assert.equal((await get('/go/abc')).status, 404);
  await get(`/go/${id}`);
  const db = openDb(dataDir);
  const rows = db.prepare('SELECT * FROM clicks').all();
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'day', 'offerId']);
  assert.equal(rows[0].count, 2);
  assert.match(rows[0].day, /^\d{4}-\d{2}-\d{2}$/);
  db.close();
});

test('yasal sayfalar, /bot, robots.txt, sitemap', async () => {
  assert.match(await (await get('/de/legal/imprint')).text(), /TODO/);
  assert.match(await (await get('/tr/legal/kvkk')).text(), /TODO/);
  assert.equal((await get('/de/legal/kvkk')).status, 404);
  const bot = await (await get('/bot')).text();
  assert.match(bot, /KarsilastirBot\/0\.1 \(\+http:\/\/localhost:\d+\/bot\)/);
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \/go\//);
  assert.match(await (await get('/sitemap.xml')).text(), new RegExp(`/de/product/${EAN}`));
});

test('admin: parola gerekir, oturum çerezi HttpOnly+SameSite, eşleşmemiş teklif atama', async () => {
  assert.equal((await get('/admin')).status, 401);
  const bad = await get('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=wrong',
  });
  assert.equal(bad.status, 401);
  const ok = await get('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `password=${PASSWORD}`,
  });
  assert.equal(ok.status, 303);
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  const auth = { cookie };
  assert.equal((await get('/admin', { headers: auth })).status, 200);

  const form = { 'content-type': 'application/x-www-form-urlencoded', cookie };
  assert.equal(
    (
      await get('/admin/shops', {
        method: 'POST',
        headers: { ...form, origin: 'http://evil.test' },
        body: 'market=de&name=X&domain=x.test',
      })
    ).status,
    403,
  ); // CSRF
  const add = await get('/admin/shops', {
    method: 'POST',
    headers: form,
    body: 'market=nl&name=NlShop&domain=nl-shop.test&shippingDefault=2,5',
  });
  assert.equal(add.status, 303);
  assert.match(await (await get('/admin/shops', { headers: auth })).text(), /NlShop/);

  const page = await (await get('/admin/unmatched', { headers: auth })).text();
  assert.match(page, /Ohne EAN/);
  const id = page.match(/\/admin\/unmatched\/(\d+)\/assign/)[1];
  const badAssign = await get(`/admin/unmatched/${id}/assign`, {
    method: 'POST',
    headers: form,
    body: 'ean=4006381333932',
  });
  assert.equal(badAssign.status, 400);
  const assign = await get(`/admin/unmatched/${id}/assign`, {
    method: 'POST',
    headers: form,
    body: 'ean=96385074',
  });
  assert.equal(assign.status, 303);
  assert.match(await (await get('/de/search?q=96385074')).text(), /Ohne EAN/);
  assert.equal(
    (
      await get('/admin/seeds', {
        method: 'POST',
        headers: form,
        body: 'shopId=1&url=https%3A%2F%2Fother.test%2Fx',
      })
    ).status,
    400,
  ); // mağaza alanı dışı tohum reddedilir
  assert.equal(
    (
      await get('/admin/seeds', {
        method: 'POST',
        headers: form,
        body: 'shopId=1&url=https%3A%2F%2Fshop-a.test%2Fp%2F2',
      })
    ).status,
    303,
  );
  await get('/admin/logout', { method: 'POST', headers: form });
  assert.equal((await get('/admin', { headers: auth })).status, 401);
});

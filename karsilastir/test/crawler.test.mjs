import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { addShop } from '../db/repo.mjs';
import { createCrawler, BOT_TOKEN } from '../crawler/crawler.mjs';
import { RateLimiter } from '../crawler/limiter.mjs';

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

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const dataDir = mkdtempSync(join(tmpdir(), 'kb-net-e2e-'));
const PASSWORD = 'e2e-net-password';
const SECRET = 'Sup3rSecretFeedToken';
const EAN = '4006381333931';
const CSV = `aw_deep_link,product_name,merchant_id,merchant_name,merchant_deep_link,search_price,currency,ean,brand_name,in_stock
https://www.awin1.example/pclick.php?p=42&a=7,Netzkopfhörer,10,Netzshop,https://netzshop.example/p/1,"29,90",EUR,${EAN},Acme,1
https://www.awin1.example/pclick.php?p=43&a=7,Ağ Kulaklık,11,Ağ Mağaza,https://ag.example/p/1,"499,00",TRY,${EAN},Acme,1
`;
let child;
let feedServer;
let feedBase;
let base;
let hits = 0;

before(async () => {
  feedServer = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('token') !== SECRET) return res.writeHead(403).end('bad token');
    hits++;
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(gzipSync(Buffer.from(CSV)));
  });
  await new Promise(r => feedServer.listen(0, '127.0.0.1', r));
  feedBase = `http://127.0.0.1:${feedServer.address().port}`;

  child = spawn(process.execPath, ['--no-warnings', join(ROOT, 'server.mjs')], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: '0',
      ADMIN_PASSWORD: PASSWORD,
      SCHEDULER: '0',
      CRAWLER_ENABLED: '0',
      ALLOW_PRIVATE_HOSTS: '1',
      FEED_E2E_KEY: SECRET,
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
  feedServer?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const get = (path, opts = {}) => fetch(base + path, { redirect: 'manual', ...opts });

test('admin: ağ beslemesi ekle, arka planda çalıştır, özet görünür, gizli anahtar sızmaz, /go deep link', async () => {
  const login = await get('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `password=${PASSWORD}`,
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const form = { 'content-type': 'application/x-www-form-urlencoded', cookie };
  const add = body =>
    get('/admin/networks', { method: 'POST', headers: form, body: new URLSearchParams(body) });

  // doğrulama: {key} var ama anahtar yok; geçersiz env adı; geçersiz mapping
  const url = `${feedBase}/feed.csv.gz?token={key}`;
  assert.equal((await add({ network: 'awin', name: 'A', url, market: 'de' })).status, 400);
  assert.equal((await add({ network: 'awin', name: 'A', url, market: 'de', secretEnv: 'PATH' })).status, 400);
  assert.equal(
    (await add({ network: 'awin', name: 'A', url, market: 'de', secret: 'x', mapping: '{"nope":"x"}' }))
      .status,
    400,
  );

  assert.equal(
    (await add({ network: 'awin', name: 'Awin stored', url, market: 'de', secret: SECRET })).status,
    303,
  );
  assert.equal(
    (await add({ network: 'awin', name: 'Awin env', url, market: 'nl', secretEnv: 'FEED_E2E_KEY' })).status,
    303,
  );

  let page = await (await get('/admin/networks', { headers: { cookie } })).text();
  assert.match(page, /Awin stored/);
  assert.match(page, /••••oken/); // son 4 karakter
  assert.match(page, /env:FEED_E2E_KEY \(set\)/);
  assert.match(page, /never run/);
  assert.ok(!page.includes(SECRET), 'gizli anahtar HTML’de olmamalı');
  const ids = [...page.matchAll(/\/admin\/networks\/(\d+)\/run/g)].map(m => m[1]);
  assert.equal(ids.length, 2);

  for (const id of ids) {
    const r = await get(`/admin/networks/${id}/run`, { method: 'POST', headers: form, body: '' });
    assert.equal(r.status, 303);
  }
  for (let i = 0; i < 100; i++) {
    page = await (await get('/admin/networks', { headers: { cookie } })).text();
    if ((page.match(/matched 2/g) || []).length === 2) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal((page.match(/matched 2/g) || []).length, 2, page);
  assert.match(page, /rows 2, merchants 2, shops created 2/);
  assert.match(page, /shops created 1/); // ikinci besleme: TRY mağazası zaten var, NL için yeni mağaza
  assert.ok(!page.includes(SECRET));
  assert.equal(hits, 2);

  const shops = await (await get('/admin/shops', { headers: { cookie } })).text();
  assert.match(shops, /via awin #10/);
  assert.match(shops, /Netzshop/);
  assert.ok(!shops.includes(SECRET));

  // /go: affiliate deep link'e yönlendirir
  const prod = await (await get(`/de/product/${EAN}`)).text();
  assert.match(prod, /Netzshop/);
  const id = prod.match(/href="\/go\/(\d+)"/)[1];
  const go = await get(`/go/${id}`);
  assert.equal(go.status, 302);
  assert.equal(go.headers.get('location'), 'https://www.awin1.example/pclick.php?p=42&a=7');
  assert.match(await (await get(`/tr/product/${EAN}`)).text(), /499,00/);

  // silme
  assert.equal(
    (await get(`/admin/networks/${ids[0]}/delete`, { method: 'POST', headers: form, body: '' })).status,
    303,
  );
  page = await (await get('/admin/networks', { headers: { cookie } })).text();
  assert.ok(!page.includes('Awin stored'));
});

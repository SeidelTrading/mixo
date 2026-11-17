// Feed denetimi ve toplu yükleme birim testleri. Çalıştır: node --test test/unit-feed.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const pool = await import('../services/pool.mjs');
const feed = await import('../services/feed.mjs');
const { store } = await import('../lib/store.mjs');

const LEGAL = { representative: 'Acme GmbH', address: 'Hauptstr. 1, Berlin', taxId: 'DE123456789' };
const full = (ref, extra = {}) => ({
  src: 'fd',
  ref,
  title: 'Ürün ' + ref,
  vendor: 'FeedMarka',
  eans: ['4006381333931'],
  description: 'Yeterince uzun bir ürün açıklaması metni',
  image: 'https://cdn.example.com/' + ref + '.jpg',
  price: 19.9,
  legal: LEGAL,
  ...extra,
});
const get = id => pool.getPool(id);

test.after(() => {
  store.close?.();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('eksik görsel ve açıklama missing listesinde çıkar', () => {
  const { id } = pool.ingest(full('A1', { image: '', description: '', eans: ['4006381333948'] }));
  const r = feed.checkProduct(get(id), 'billiga');
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('image') && r.missing.includes('description'));
});

test('EAN yoksa eksik, geçersiz EAN yakalanır', () => {
  const { id } = pool.ingest(full('A2', { eans: [] }));
  assert.ok(feed.checkProduct(get(id), 'idealo').missing.includes('ean'));
  const bad = { ...get(pool.ingest(full('A3', { eans: ['4006381333955'] })).id) };
  bad.eans = [{ ean: '123', market: '*' }];
  const r = feed.checkProduct(bad, 'idealo');
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some(w => w.includes('EAN')));
});

test('legal idealo için zorunlu, billiga için değil', () => {
  const { id } = pool.ingest(full('A4', { legal: undefined, eans: ['4006381333962'] }));
  assert.ok(feed.checkProduct(get(id), 'idealo').missing.includes('legal'));
  assert.equal(feed.checkProduct(get(id), 'billiga').ok, true);
  assert.throws(() => feed.checkProduct(get(id), 'nope'), { code: 'invalid' });
});

test('buildFeed yalnız geçen ürünleri içerir ve XML kaçışı doğru', () => {
  pool.ingest(full('B1', { title: 'Tom & Jerry <Set> "x" \'y\'', eans: ['4006381333979'] }));
  pool.ingest(full('B2', { title: 'Bozuk Görsel', image: '', eans: ['4006381333986'] }));
  const xml = feed.buildFeed('pricerunner');
  assert.ok(xml.includes('Tom &amp; Jerry &lt;Set&gt; &quot;x&quot; &apos;y&apos;'));
  assert.ok(!xml.includes('<Set>'));
  assert.ok(!xml.includes('Bozuk Görsel'));
  assert.equal(feed.escXml('a&b<c'), 'a&amp;b&lt;c');
});

test('auditFeed raporu yazar, lastAudit okur', () => {
  const r = feed.auditFeed('idealo');
  assert.ok(r.checked >= 1 && r.problems.length >= 1);
  assert.equal(feed.lastAudit('idealo').t, r.t);
  assert.equal(feed.lastAudit('billiga'), null);
});

test('bulkUpload yasal alanı eksik ürünü blocked yapar', async () => {
  const ok = pool.ingest(full('C1', { vendor: 'TopluMarka', eans: ['4006381333993'] }));
  const noLegal = pool.ingest(
    full('C2', { vendor: 'TopluMarka', eans: ['4006381334006'], legal: { representative: 'X' } }),
  );
  const r = await feed.bulkUpload({ brands: ['TopluMarka'], shops: ['s1'], market: 'billiga' });
  assert.deepEqual(
    r.uploaded.map(u => u.poolId),
    [ok.id],
  );
  const b = r.blocked.find(x => x.poolId === noLegal.id);
  assert.match(b.reason, /address/);
  await assert.rejects(feed.bulkUpload({ brands: [], shops: ['s1'], market: 'billiga' }), {
    code: 'invalid',
  });
});

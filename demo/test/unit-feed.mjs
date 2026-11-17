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
const rules = await import('../services/rules.mjs');
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

test('bulkUpload marka yasağını uygular (kural motoru statik yüklenir)', async () => {
  const p = pool.ingest(full('D1', { vendor: 'YasakMarka', eans: ['4006381334013'] }));
  const rule = rules.addRule({ vendor: 'YasakMarka', reason: 'AB mevzuatı: satış yasak' });
  const r = await feed.bulkUpload({ brands: ['YasakMarka'], shops: ['s1'], market: 'billiga' });
  assert.deepEqual(r.uploaded, []);
  assert.equal(r.blocked[0].poolId, p.id);
  assert.match(r.blocked[0].reason, /YasakMarka/);
  rules.removeRule(rule.id);
});

test('bulkUpload şirket ve kategori bazlı yasakları kural motoruna geçirir', async () => {
  const p = pool.ingest(full('D2', { vendor: 'KatMarka', eans: ['4006381334020'], category: 'elektronik' }));
  const byCat = rules.addRule({
    vendor: 'KatMarka',
    category: 'elektronik',
    reason: 'AB mevzuatı: bu kategoride satış yasak',
  });
  const r1 = await feed.bulkUpload({ brands: ['KatMarka'], shops: ['s1'], market: 'idealo' });
  assert.deepEqual(r1.uploaded, [], 'kategori yasağı uygulanmalı');
  assert.equal(r1.blocked[0].poolId, p.id);
  rules.removeRule(byCat.id);

  const byCompany = rules.addRule({ company: 'AcmeGmbH', vendor: 'KatMarka', reason: 'sözleşme gereği' });
  const r2 = await feed.bulkUpload({
    brands: ['KatMarka'],
    shops: ['s1'],
    market: 'idealo',
    company: 'AcmeGmbH',
  });
  assert.deepEqual(r2.uploaded, [], 'şirket yasağı uygulanmalı');
  // Başka şirket için aynı kural geçerli değil.
  const r3 = await feed.bulkUpload({
    brands: ['KatMarka'],
    shops: ['s1'],
    market: 'idealo',
    company: 'BaskaGmbH',
  });
  assert.equal(r3.uploaded.length, 1);
  rules.removeRule(byCompany.id);
});

test('buildFeed yasaklı markayı XML dışında bırakır', () => {
  const p = pool.ingest(full('E1', { vendor: 'FeedYasak', eans: ['4006381334037'] }));
  assert.ok(feed.buildFeed('billiga').includes(p.id), 'yasak yokken feed içinde');
  const rule = rules.addRule({ vendor: 'FeedYasak', market: 'billiga', reason: 'mevzuat' });
  assert.ok(!feed.buildFeed('billiga').includes(p.id), 'yasaklı ürün XML dışında kalmalı');
  assert.ok(feed.buildFeed('pricerunner').includes(p.id), 'yasak yalnız ilgili pazar yerinde');
  rules.removeRule(rule.id);
});

test('5.000 sorunlu üründen sonra denetim çalışır, belge küçük kalır, kopya olmaz, düzelen ürün çıkar', () => {
  const N = 5000;
  const ids = [];
  for (let i = 0; i < N; i++) {
    // görsel yok → billiga için sorunlu; benzersiz ve geçerli EAN gerekmez (eksik EAN da sorundur)
    ids.push(pool.ingest(full('BIG' + i, { vendor: 'BigMarka', image: '', eans: [] })).id);
  }
  const r1 = feed.auditFeed('billiga');
  // tarama tavanı 5.000 ürün (MAX_SCAN): önceki testlerin ürünleri de sayıldığından hepsi taranmayabilir
  assert.ok(r1.problems.length >= N - 100, 'sorun sayısı: ' + r1.problems.length);
  const doc = JSON.stringify(store.doc('feed', {}));
  assert.ok(doc.length < 5000, 'belge küçük kalmalı: ' + doc.length);
  assert.ok(!doc.includes('BIG0'), 'sorun satırları belgede olmamalı');
  assert.equal(store.doc('feed', {}).audits.billiga.problems, undefined);
  const last = feed.lastAudit('billiga');
  assert.equal(last.problemCount, r1.problems.length);
  assert.equal(last.problems.length, feed.LAST_AUDIT_LIMIT);
  assert.equal(last.t, r1.t);
  assert.equal(feed.lastAudit('billiga', { limit: 10 }).problems.length, 10);
  assert.deepEqual(Object.keys(last.problems[0]).sort(), ['missing', 'poolId', 'title', 'warnings']);

  // ikinci çalıştırma kopya üretmez
  const r2 = feed.auditFeed('billiga');
  assert.equal(r2.problems.length, r1.problems.length);
  assert.equal(feed.lastAudit('billiga').problemCount, r1.problems.length);

  // düzelen ürün yeni denetimden sonra raporda kalmaz
  const full1 = new Set(feed.lastAudit('billiga', { limit: 1e6 }).problems.map(x => x.poolId));
  const idx = ids.findIndex(id => full1.has(id));
  assert.ok(idx >= 0);
  const target = ids[idx];
  pool.ingest(
    full('BIG' + idx, {
      vendor: 'BigMarka',
      image: 'https://cdn.example.com/BIG' + idx + '.jpg',
      eans: ['4006381334044'],
    }),
  );
  feed.auditFeed('billiga');
  const after = feed.lastAudit('billiga', { limit: 1e6 });
  assert.ok(!after.problems.some(x => x.poolId === target), 'düzelen ürün raporda kalmamalı');
  assert.equal(after.problemCount, r1.problems.length - 1);
});

test('bulkUpload sonuçları satırda durur, belgede yalnız özet kalır', async () => {
  const r = await feed.bulkUpload({ brands: ['TopluMarka'], shops: ['s1', 's2'], market: 'billiga' });
  const b = store.doc('feed', {}).bulk;
  assert.equal(b.uploaded, undefined);
  assert.equal(b.blocked, undefined);
  assert.equal(b.uploadedCount, r.uploaded.length);
  assert.equal(b.blockedCount, r.blocked.length);
  assert.ok(r.uploaded.length >= 2);
});

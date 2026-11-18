import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.mjs';
import { STORES, provisionStores } from '../lib/stores.mjs';

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'stores-')));

test('mağaza kaydı: TR dahil taranabilir mağazalar eklenir, ikinci çalıştırma değişiklik yapmaz', () => {
  const db = fresh();
  const r = provisionStores(db);
  assert.ok(r.added.some(x => x.startsWith('tr:')));
  assert.ok(db.prepare("SELECT count(*) c FROM shops WHERE market = 'tr'").get().c >= 3);
  assert.deepEqual(provisionStores(db), { added: [], disabled: [] });
  db.close();
});

test('mağaza kaydı: bot engelli mağazalar (otto, saturn) taranmaz; var olan pasife çekilir, yeni eklenmez', () => {
  const db = fresh();
  db.prepare("INSERT INTO shops (market, name, domain) VALUES ('de', 'Otto', 'www.otto.de')").run();
  const r = provisionStores(db);
  assert.deepEqual(r.disabled, ['de:otto.de']);
  assert.equal(db.prepare("SELECT active FROM shops WHERE domain = 'www.otto.de'").get().active, 0);
  assert.equal(db.prepare("SELECT count(*) c FROM shops WHERE domain LIKE '%saturn%'").get().c, 0);
  assert.ok(STORES.filter(s => !s.crawl).every(s => s.why));
  db.close();
});

test('mağaza kaydı: var olan mağaza (www / ad farkı) yinelenmez ve ayarları korunur', () => {
  const db = fresh();
  db.prepare(
    "INSERT INTO shops (market, name, domain, shippingDefault) VALUES ('tr', 'Boyner TR', 'www.boyner.com.tr', 9)",
  ).run();
  provisionStores(db);
  const rows = db.prepare("SELECT * FROM shops WHERE domain LIKE '%boyner%'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shippingDefault, 9);
  db.close();
});

// Deneme (2026-11-18) sonrası secomp.de ve office-partner.de crawl: false (aşağıda ayrı sınanır); beşi taranır.
const SEVEN = ['reichelt.de', 'jacob.de', 'mindfactory.de', 'uhrzeit.org', 'pieper.de'];
const CLOSED_AFTER_TRIAL = ['secomp.de', 'office-partner.de'];

test('mağaza kaydı: yeni mağazalar eklenir (secomp, office-partner kapalı); christ.de ve uhren4you.de kapatılmaz', () => {
  const db = fresh();
  const r = provisionStores(db);
  for (const d of SEVEN) assert.ok(r.added.includes(`de:${d}`), d);
  for (const d of CLOSED_AFTER_TRIAL) assert.ok(!r.added.includes(`de:${d}`), d); // crawl: false: eklenmez
  assert.ok(r.added.includes('de:christ.de') && r.added.includes('de:uhren4you.de'));
  assert.equal(
    db
      .prepare("SELECT count(*) c FROM shops WHERE domain IN ('christ.de', 'uhren4you.de') AND active = 1")
      .get().c,
    2,
  );
  assert.deepEqual(provisionStores(db), { added: [], disabled: [] });
  db.close();
});

test('mağaza kaydı: search şablonu {q} içerir ve aynı host yoludur; priceNet / eanFromText boolean', () => {
  const byDomain = Object.fromEntries(STORES.map(s => [s.domain, s]));
  for (const d of SEVEN) assert.equal(byDomain[d]?.crawl, true, d);
  for (const d of CLOSED_AFTER_TRIAL) {
    assert.equal(byDomain[d]?.crawl, false, d);
    assert.ok(byDomain[d].why && !byDomain[d].search, d); // neden yazılı, arama şablonu yok
  }
  for (const s of STORES.filter(x => x.search)) {
    assert.ok(s.crawl, s.domain);
    assert.ok(s.search.startsWith('/') && s.search.split('{q}').length === 2, s.domain); // yol, tek {q}: host değişemez
    assert.ok(!s.search.includes('//'));
  }
  // robots'ta arama yolu yasak olan mağazalarda arama yok
  assert.equal(byDomain['jacob.de'].search, undefined);
  assert.equal(byDomain['mindfactory.de'].search, undefined);
  for (const s of STORES.filter(x => 'priceNet' in x || 'eanFromText' in x)) {
    assert.equal(typeof (s.priceNet ?? false), 'boolean');
    assert.equal(typeof (s.eanFromText ?? false), 'boolean');
  }
  assert.equal(byDomain['office-partner.de'].priceNet, true);
  assert.equal(byDomain['office-partner.de'].eanFromText, true);
  assert.ok(
    Array.isArray(byDomain['reichelt.de'].brands) && byDomain['reichelt.de'].brands.includes('delock'),
  );
  // net fiyat yalnız işaretli mağazada; ikinci dalga mağazaları kayıtlı değil
  assert.ok(!STORES.some(s => ['bechtle.com', 'wlan-shop24.de', 'druckerzubehoer.de'].includes(s.domain)));
});

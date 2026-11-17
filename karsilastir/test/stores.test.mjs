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

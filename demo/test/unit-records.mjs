// Ortak satır tablosu (şema sürümü 3) ve belgeden satıra taşıma.
// Çalıştır: node --test test/unit-records.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-rec-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const { store } = await import('../lib/store.mjs');
const { recordSet, moveDocRows } = await import('../services/records.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('satır yazma, okuma, silme', () => {
  const r = recordSet('deneme');
  r.put({ id: 'a', t: 100, ad: 'bir' });
  r.put({ id: 'b', t: 200, ad: 'iki' });
  assert.deepEqual(r.get('a'), { ad: 'bir', id: 'a', t: 100 });
  assert.equal(r.count(), 2);
  assert.deepEqual(
    r.all().map(x => x.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    r.all({ desc: true }).map(x => x.id),
    ['b', 'a'],
  );
  assert.equal(r.del('a'), 1);
  assert.equal(r.get('a'), null);
  assert.equal(r.count(), 1);
});

test('aynı kimliğe ikinci yazma kopya üretmez, üzerine yazar', () => {
  const r = recordSet('ustune');
  r.put({ id: 'x', deger: 1 });
  r.put({ id: 'x', deger: 2 });
  assert.equal(r.count(), 1);
  assert.equal(r.get('x').deger, 2);
});

test("kind'ler birbirine karışmaz", () => {
  recordSet('k1').put({ id: 'ayni', nereden: 'k1' });
  recordSet('k2').put({ id: 'ayni', nereden: 'k2' });
  assert.equal(recordSet('k1').get('ayni').nereden, 'k1');
  assert.equal(recordSet('k2').get('ayni').nereden, 'k2');
  assert.equal(recordSet('k1').count(), 1);
});

test('tavan: en eski kayıtlar silinir', () => {
  const r = recordSet('tavan');
  for (let i = 0; i < 10; i++) r.put({ id: 's' + i, t: 1000 + i });
  assert.equal(r.prune(4), 6);
  assert.deepEqual(
    r.all().map(x => x.id),
    ['s6', 's7', 's8', 's9'],
  );
  assert.equal(r.prune(10), 0, 'tavanın altındayken silme yok');
});

test('id yoksa yazma reddedilir', () => {
  assert.throws(() => recordSet('hatali').put({ ad: 'kimliksiz' }), /id gerekli/);
});

test('belgeden satıra taşıma bir kez çalışır ve belgeyi temizler', () => {
  store.saveDoc('eski', { kayitlar: { a: { id: 'a', v: 1 }, b: { id: 'b', v: 2 } }, ayar: 5 });
  const tasi = () =>
    moveDocRows('tasinan', 'eski', {
      rows: d => Object.values(d.kayitlar || {}),
      strip: d => {
        d.kayitlar = {};
      },
    });
  assert.equal(tasi(), 2, 'iki kayıt taşındı');
  const r = recordSet('tasinan');
  assert.equal(r.count(), 2);
  assert.equal(r.get('b').v, 2);
  const d = store.doc('eski', {});
  assert.deepEqual(d.kayitlar, {}, 'belgedeki kopya temizlendi');
  assert.equal(d.ayar, 5, 'belgedeki ayar korundu');

  // İkinci çağrı hiçbir şey yapmaz: satırdaki güncel hâl ezilmemeli.
  r.put({ id: 'a', v: 99 });
  assert.equal(tasi(), 0);
  assert.equal(r.get('a').v, 99, 'satırdaki güncel değer korundu');
  assert.equal(r.count(), 2);
});

test('taşıma damgası belgede durur', () => {
  const d = store.doc('eski', {});
  assert.ok(d.__recsMoved?.tasinan > 0);
});

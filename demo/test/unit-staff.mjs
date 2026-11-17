// Personel iş kayıtları: satır tablosu, tavan, belge boyutu.
// Çalıştır: node --test test/unit-staff.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-staff-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const { store } = await import('../lib/store.mjs');
const { recordSet, moveDocRows } = await import('../services/records.mjs');
const staff = await import('../services/staff.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const rs = recordSet('staff');

test('çok kayıttan sonra performance() doğru', () => {
  rs.clear();
  for (let i = 1; i <= 600; i++)
    staff.recordWork({ user: i % 2 ? 'ayse' : 'can', kind: 'resolution', ms: i * 10, ticketId: 'T' + i });
  staff.recordWork({ user: 'ayse', kind: 'first_reply', ms: 500, ticketId: 'T1' });
  const p = staff.performance({}).people;
  const ayse = p.find(x => x.user === 'ayse'),
    can = p.find(x => x.user === 'can');
  // ayse: tek i = 1,3,...,599 (300 kayıt), ms = 10,30,...,5990 → ortalama 3000
  assert.equal(ayse.tickets, 300);
  assert.equal(ayse.avgResolutionMs, 3000);
  assert.equal(ayse.avgFirstReplyMs, 500);
  assert.equal(ayse.p90ResolutionMs, 5390); // nearest-rank: 270. değer = 20*270-10
  assert.equal(can.tickets, 300);
  assert.equal(can.avgResolutionMs, 3010);
});

test('dönen kayıtta id yok, alanlar eskisi gibi', () => {
  const r = staff.recordWork({ user: 'x', kind: 'resolution', ms: 5, ticketId: 7 });
  assert.deepEqual(Object.keys(r).sort(), ['kind', 'ms', 't', 'ticketId', 'user']);
  assert.equal(r.ticketId, '7');
});

test('tavan en eski kayıtları siler', () => {
  rs.clear();
  // 50 bin gerçek yazma yerine tavanı doğrudan sınamak için satırları toplu yaz, sonra tek yazma tavanı uygular.
  const list = [];
  for (let i = 0; i < 50000; i++)
    list.push({ id: 'o' + i, t: 1000 + i, user: 'u', kind: 'resolution', ms: 1, ticketId: 'k' + i });
  rs.putMany(list);
  assert.equal(rs.count(), 50000);
  staff.recordWork({ user: 'u', kind: 'resolution', ms: 1, ticketId: 'yeni' });
  assert.equal(rs.count(), 50000);
  assert.equal(rs.get('o0'), null, 'en eski kayıt silinmeli');
  assert.ok(rs.get('o1'));
  assert.equal(rs.all({ desc: true, limit: 1 })[0].ticketId, 'yeni');
});

test('belge büyümez: staff belgesinde kayıt listesi yok', () => {
  rs.clear();
  const before = JSON.stringify(store.doc('staff', {})).length;
  for (let i = 0; i < 200; i++) staff.recordWork({ user: 'u', kind: 'resolution', ms: 9, ticketId: 'D' + i });
  const d = store.doc('staff', {});
  assert.equal(d.records, undefined);
  assert.equal(JSON.stringify(d).length, before);
  assert.equal(rs.count(), 200);
});

test('belgeden satıra taşıma: kimlik üretilir, t korunur, belge temizlenir, ikinci çağrı etkisiz', () => {
  rs.clear();
  const name = 'staff-legacy-test';
  store.saveDoc(name, {
    records: [
      { user: 'a', kind: 'resolution', ms: 100, ticketId: 'L1', t: 111 },
      { user: 'b', kind: 'first_reply', ms: 200, ticketId: 'L2', t: 222 },
    ],
  });
  const n = moveDocRows('staff', name, { rows: staff.legacyRows, strip: staff.legacyStrip });
  assert.equal(n, 2);
  const all = rs.all();
  assert.deepEqual(
    all.map(r => [r.user, r.t]),
    [
      ['a', 111],
      ['b', 222],
    ],
  );
  assert.ok(all.every(r => r.id));
  assert.equal(store.doc(name, {}).records, undefined);
  assert.equal(moveDocRows('staff', name, { rows: staff.legacyRows, strip: staff.legacyStrip }), 0);
  assert.equal(rs.count(), 2);
});

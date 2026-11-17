// Denetim izi: yasal ya da parasal etkili yazmalar değişiklik günlüğüne düşer.
// Çalıştır: node --test test/unit-audit.mjs   (Node >= 22.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mixo-unit-aud-'));
process.env.ADMIN_PASSWORD = 'birim-test-parolasi-1';
process.env.SESSION_SECRET = 'birim-test-secret';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.ORDER_VERIFY = 'off';

const { store, actorCtx } = await import('../lib/store.mjs');
const { changes } = await import('../services/settings.mjs');
const { audit } = await import('../services/audit.mjs');
const pool = await import('../services/pool.mjs');
const rules = await import('../services/rules.mjs');
const ads = await import('../services/ads.mjs');
const tenants = await import('../services/tenants.mjs');
const { undo } = await import('../services/actions.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const sonKayit = () => changes[changes.length - 1];
const kayitSayisi = () => changes.length;

test('audit kaydı hem bellekteki listeye hem veritabanına yazılır', () => {
  const once = kayitSayisi();
  const c = audit('Deneme', 'bir şey oldu');
  assert.equal(kayitSayisi(), once + 1);
  assert.equal(sonKayit().id, c.id);
  const dbde = store.allChanges().find(x => x.id === c.id);
  assert.ok(dbde, 'kayıt veritabanında da duruyor');
  assert.equal(dbde.summary, 'bir şey oldu');
  assert.equal(dbde.undone, false);
});

test('oturumdaki kullanıcı kayda yazılır (alan adı username)', () => {
  // Konsey bulgusu: pool.merge kullanıcıyı `.user` ile okuyordu, oturumdaki alan `username`;
  // bu yüzden her birleştirme kullanıcısız günlüğe düşüyordu.
  const c = actorCtx.run({ username: 'ayse', role: 'yonetici' }, () => audit('Deneme', 'kullanıcılı'));
  assert.equal(c.user, 'ayse');
  assert.equal(store.allChanges().find(x => x.id === c.id).user, 'ayse');
});

test('oturum yokken kayıt yine düşer, kullanıcı alanı boş kalır', () => {
  const c = audit('Deneme', 'kullanıcısız');
  assert.equal(c.user, undefined);
});

test('satış yasağı eklemek ve kaldırmak günlüğe düşer', () => {
  const once = kayitSayisi();
  const r = rules.addRule({ vendor: 'Chanel', market: 'idealo', reason: 'Marka izni yok' });
  assert.equal(kayitSayisi(), once + 1);
  assert.match(sonKayit().summary, /Satış yasağı eklendi/);
  assert.match(sonKayit().summary, /Chanel/);
  rules.removeRule(r.id);
  assert.match(sonKayit().summary, /KALDIRILDI/, 'yasağın kaldırılması ayrıca kayda geçer');
});

test('marka yetkisi verilmesi, kanıtıyla birlikte günlüğe düşer', () => {
  ads.authorizeBrand('Chanel', { reference: 'marka-yetki-belgesi-2026-11' });
  assert.match(sonKayit().summary, /Marka yetkisi verildi: Chanel/);
  assert.match(sonKayit().summary, /marka-yetki-belgesi/);
});

test('entegrasyon anahtarı günlüğe düşer ama anahtar DEĞERİ sızmaz', () => {
  const t = tenants.createTenant({ name: 'Kiraci A', plan: 'gold' });
  const gizli = 'cok-gizli-anahtar-123456';
  tenants.setKey(t.id, 'amazon', gizli);
  const konma = sonKayit();
  assert.match(konma.summary, /Entegrasyon anahtarı tanımlandı/);
  assert.ok(!konma.summary.includes(gizli), 'anahtar değeri günlükte geçmiyor');
  assert.match(konma.summary, /3456/, 'yalnız son dört hane');
  tenants.revokeKey(t.id, 'amazon');
  assert.match(sonKayit().summary, /iptal edildi/);
  assert.ok(!store.allChanges().some(x => (x.summary || '').includes(gizli)), 'hiçbir kayıtta anahtar yok');
});

test('havuz birleştirmesi günlüğe düşer ve panelden geri alınabilir', () => {
  const a = pool.ingest({ src: 'wawi', ref: 'AU-1', title: 'Denetim A', vendor: 'Acme', mpn: 'AU1' });
  const b = pool.ingest({ src: 'gls', ref: 'AU-2', title: 'Denetim B', vendor: 'Beta', mpn: 'AU2' });
  const once = pool.poolCounts();
  const r = actorCtx.run({ username: 'veli', role: 'yonetici' }, () => pool.merge(a.id, b.id));
  const kayit = changes.find(x => x.id === r.changeId);
  assert.ok(kayit, 'birleştirme günlükte');
  assert.equal(kayit.user, 'veli', 'kullanıcı doğru alandan okundu');
  assert.equal(kayit.undo.type, 'pool_unmerge', 'panelin geri alma düğmesi bu adı arar');
  // Paneldeki genel geri alma yolu: actions.undo → actions.pool_unmerge → pool.unmergeById
  const sonuc = undo(r.changeId, 'Panel');
  assert.ok(sonuc && !sonuc.conflict, 'geri alma çalıştı');
  assert.deepEqual(pool.poolCounts(), once, 'havuz başlangıç durumuna döndü');
  assert.equal(changes.find(x => x.id === r.changeId).undone, true);
  assert.equal(undo(r.changeId, 'Panel'), null, 'ikinci geri alma yok sayılır');
});

// Kiracı ve entegrasyon anahtarı birim testleri (node:test); geçici DATA_DIR kullanır.
// Çalıştır: node --test test/unit-tenants.mjs   (Node >= 22.13)
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

const T = await import('../services/tenants.mjs');
const { store } = await import('../lib/store.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const throwsCode = (fn, code) =>
  assert.throws(fn, e => e instanceof T.TenantError && e.code === code, `${code} bekleniyordu`);

test('kiracı ve mağaza oluşturma', () => {
  const t = T.createTenant({ name: 'Acme GmbH', plan: 'silver' });
  assert.equal(T.getTenant(t.id).name, 'Acme GmbH');
  const s = T.addShop(t.id, { name: 'Acme DE', market: 'amazon' });
  assert.equal(T.getTenant(t.id).shops.length, 1);
  assert.ok(T.listTenants().some(x => x.id === t.id));
  throwsCode(() => T.createTenant({ name: 'acme gmbh', plan: 'gold' }), 'conflict');
  throwsCode(() => T.createTenant({ name: 'X', plan: 'platin' }), 'invalid');
  throwsCode(() => T.addShop('yok', { name: 'a', market: 'b' }), 'notfound');
  assert.equal(T.removeShop(t.id, s.id).shops.length, 0);
  assert.equal(T.updateTenant(t.id, { disabled: true }).disabled, true);
});

test('paket limiti aşılamaz', () => {
  const t = T.createTenant({ name: 'Küçük Ltd', plan: 'bronze' });
  for (let i = 0; i < T.PLAN_LIMITS.bronze.shops; i++) T.addShop(t.id, { name: 'm' + i, market: 'kaufland' });
  throwsCode(() => T.addShop(t.id, { name: 'fazla', market: 'kaufland' }), 'limit');
  const g = T.createTenant({ name: 'Büyük AŞ', plan: 'gold' });
  for (let i = 0; i < 4; i++) T.addShop(g.id, { name: 'm' + i, market: 'amazon' });
});

test('şirket limiti aynı hesapta aşılamaz; paket düşürme mağaza sayısına bakar', () => {
  T.createTenant({ name: 'Hesap A1', plan: 'bronze', account: 'hesap-a' });
  throwsCode(() => T.createTenant({ name: 'Hesap A2', plan: 'bronze', account: 'hesap-a' }), 'limit');
  const t = T.createTenant({ name: 'Düşüş', plan: 'gold' });
  for (let i = 0; i < 4; i++) T.addShop(t.id, { name: 'm' + i, market: 'amazon' });
  throwsCode(() => T.updateTenant(t.id, { plan: 'bronze' }), 'limit');
});

test('listKeys anahtar değerini sızdırmaz', () => {
  const t = T.createTenant({ name: 'Anahtarlı', plan: 'bronze' });
  const secret = 'AKIA-SUPER-GIZLI-ANAHTAR-9876';
  T.setKey(t.id, 'Amazon', secret);
  const list = T.listKeys(t.id);
  assert.deepEqual(Object.keys(list[0]).sort(), ['active', 'added', 'last4', 'provider']);
  assert.equal(list[0].last4, '9876');
  assert.ok(!JSON.stringify(list).includes(secret));
  assert.ok(!JSON.stringify(store.doc('tenant_keys', {})).includes(secret), 'depoda düz metin yok');
  assert.ok(!JSON.stringify(T.getTenant(t.id)).includes(secret));
});

test('setKey sonrası getKey aynı değeri çözer; testKey sağlıklı', () => {
  const t = T.createTenant({ name: 'Çözülen', plan: 'bronze' });
  T.setKey(t.id, 'dhl', 'dhl-api-key-12345');
  assert.equal(T.getKey(t.id, 'dhl'), 'dhl-api-key-12345');
  assert.deepEqual(T.testKey(t.id, 'dhl'), { ok: true });
  assert.equal(T.testKey(t.id, 'yok').ok, false);
  throwsCode(() => T.setKey(t.id, 'dhl', 'kısa'), 'invalid');
  throwsCode(() => T.setKey('yok', 'dhl', 'dhl-api-key-12345'), 'notfound');
});

test('revokeKey sonrası getKey null', () => {
  const t = T.createTenant({ name: 'İptal', plan: 'bronze' });
  T.setKey(t.id, 'kaufland', 'kaufland-key-0001');
  T.revokeKey(t.id, 'kaufland');
  assert.equal(T.getKey(t.id, 'kaufland'), null);
  assert.equal(T.listKeys(t.id)[0].active, false);
  assert.equal(T.testKey(t.id, 'kaufland').ok, false);
  throwsCode(() => T.revokeKey(t.id, 'baska'), 'notfound');
});

test('kullanıcı kiracı bağı', () => {
  const a = T.createTenant({ name: 'Bağ A', plan: 'bronze' });
  const b = T.createTenant({ name: 'Bağ B', plan: 'bronze' });
  T.assignUser(a.id, 'ayse');
  assert.equal(T.scopeOf('ayse'), a.id);
  assert.equal(T.tenantOfUser('ayse').id, a.id);
  T.assignUser(b.id, 'ayse');
  assert.equal(T.scopeOf('ayse'), b.id);
  assert.ok(!T.getTenant(a.id).users.includes('ayse'));
  assert.equal(T.scopeOf('bilinmeyen'), null);
  throwsCode(() => T.assignUser('yok', 'ayse'), 'notfound');
});

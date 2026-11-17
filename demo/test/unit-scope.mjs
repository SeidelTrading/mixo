// Kiracı kapsamı, rol kapısı, dört göz kuralı ve prototip kirlenmesi birim testleri (node:test).
// Çalıştır: node --test test/unit-scope.mjs   (Node >= 22.13)
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

const S = await import('../services/scope.mjs');
const T = await import('../services/tenants.mjs');
const rf = await import('../services/refunds.mjs');
const ord = await import('../services/orders.mjs');
const { P } = await import('../services/catalog.mjs');
const { adminOnlyReason } = await import('../routes/handler.mjs');
const { adminB2bRoutes } = await import('../routes/admin-b2b.mjs');
const { adminDashboardRoutes } = await import('../routes/admin-dashboard.mjs');
const { store } = await import('../lib/store.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

// İki kiracı ve birer 'duzenleyen' kullanıcı: editorA → KiraciA, editorB → KiraciB.
const A = T.createTenant({ name: 'KiraciA', plan: 'silver' });
const B = T.createTenant({ name: 'KiraciB', plan: 'silver' });
T.assignUser(A.id, 'editora');
T.assignUser(B.id, 'editorb');
const meA = { username: 'editora', role: 'duzenleyen' };
const meB = { username: 'editorb', role: 'duzenleyen' };
const boss = { username: 'admin', role: 'yonetici' };
const loose = { username: 'kimsesiz', role: 'duzenleyen' }; // hiçbir kiracıya bağlı değil

const isScopeError = e => e instanceof S.ScopeError && e.http === 403;

test('kapsam: kullanıcı kendi kiracısını görür, başkasınınkini görmez', () => {
  assert.deepEqual(S.scopeFor(meA), { tenantId: A.id, isBoss: false });
  assert.equal(S.canSee(meA, A.id), true);
  assert.equal(S.canSee(meA, B.id), false);
  assert.throws(() => S.assertScope(meA, B.id), isScopeError);
  assert.throws(() => S.assertScope(meB, A.id), isScopeError);
  assert.doesNotThrow(() => S.assertScope(meA, A.id));
});

test('kapsam: yonetici tüm kiracıları görür', () => {
  assert.equal(S.scopeFor(boss).isBoss, true);
  assert.doesNotThrow(() => S.assertScope(boss, A.id));
  assert.doesNotThrow(() => S.assertScope(boss, B.id));
  const rows = [{ tenantId: A.id }, { tenantId: B.id }, { tenantId: null }];
  assert.equal(S.filterScope(boss, rows, r => r.tenantId).length, 3);
  assert.deepEqual(
    S.filterScope(meA, rows, r => r.tenantId),
    [{ tenantId: A.id }],
  );
});

test('kapsam: kiracı alanı olmayan modüller kiracı kullanıcısına kapalı', () => {
  // assertShared: kayıt kiracıya bağlanamadığından kiracı kullanıcısı listeyi hiç görmemeli.
  assert.throws(() => S.assertShared(meA, 'Destek'), isScopeError);
  assert.doesNotThrow(() => S.assertShared(boss, 'Destek'));
  assert.doesNotThrow(() => S.assertShared(loose, 'Destek')); // tek kiracılı kurulum
});

test('rol kapısı: yönetici isteyen uçlar tablodan okunur', () => {
  // duzenleyen rolü bu uçları çağıramaz (handler.mjs bu gerekçeyle 403 döner).
  assert.ok(adminOnlyReason('/api/admin/tenants/key', { action: 'set' }));
  assert.ok(adminOnlyReason('/api/admin/tenants/create', {}));
  assert.ok(adminOnlyReason('/api/admin/tenants/update', {}));
  assert.ok(adminOnlyReason('/api/admin/ads/brand', {}));
  assert.ok(adminOnlyReason('/api/admin/rules/remove', {}));
  assert.ok(adminOnlyReason('/api/admin/rules/strategy', {}));
  assert.ok(adminOnlyReason('/api/admin/b2b/deal-status', {}));
  assert.ok(adminOnlyReason('/api/admin/users', {}));
  // Eşik üstü onay yalnız approve:true ile yöneticiye kısıtlıdır; onaysız settle düzenleyene açık kalır.
  assert.ok(adminOnlyReason('/api/admin/refunds/settle', { approve: true }));
  assert.equal(adminOnlyReason('/api/admin/refunds/settle', {}), null);
  // Kısıtlanmayan uçlar tabloya takılmaz.
  assert.equal(adminOnlyReason('/api/admin/pool', {}), null);
  assert.equal(adminOnlyReason('/api/admin/tenants', {}), null);
});

/* ───────── dört göz kuralı ───────── */

const cust = {
  name: 'Erika Muster',
  email: 'erika@example.com',
  street: 'Hauptstr. 1',
  zip: '10115',
  city: 'Berlin',
};
const pid = [...P.values()].find(p => p.price >= 20 && p.price <= 150).id;
let seq = 0;
// Eşiğin (200 €) üstünde, ödemeye hazır (received + storno faturalı) bir iade üretir.
function readyRefund(by) {
  const r = ord.createOrder({
    items: [{ id: pid, qty: 20 }],
    customer: { ...cust, email: `s${++seq}@example.com` },
  });
  assert.ok(r.order, r.err);
  const ref = rf.requestRefund({ orderId: r.order.id, items: [{ id: pid, qty: 20 }] }, { by });
  assert.ok(ref.amount > rf.APPROVAL_THRESHOLD, 'iade eşiğin üstünde olmalı');
  rf.storno(ref.id);
  rf.labelSent(ref.id, 'TRK-1', { by });
  rf.markReceived(ref.id, { by });
  return ref;
}

test('dört göz: talep eden kendi iadesini onaylayamaz', () => {
  const ref = readyRefund('ayse');
  assert.equal(rf.getRefund(ref.id).requestedBy, 'ayse');
  assert.throws(
    () => rf.settle(ref.id, { approvedBy: 'ayse' }),
    e => e instanceof rf.RefundError && e.code === 'conflict',
  );
  assert.equal(rf.getRefund(ref.id).status, 'received');
  // Başka bir kişi onaylayabilir.
  const done = rf.settle(ref.id, { approvedBy: 'mehmet' });
  assert.equal(done.refund.status, 'refunded');
  assert.equal(done.refund.approvedBy, 'mehmet');
});

/* ───────── prototip kirlenmesi (uç katmanı) ───────── */

const mockRes = () => ({
  code: 0,
  body: null,
  headersSent: false,
  writeHead(code) {
    this.code = code;
  },
  end(b) {
    this.body = b ? JSON.parse(b) : null;
    this.headersSent = true;
  },
});
const post = async (handler, p, body) => {
  const res = mockRes();
  await handler({
    req: { method: 'POST' },
    res,
    p,
    url: new URL('http://x' + p),
    body,
    me: boss,
  });
  return res;
};

test('prototip: __proto__ anahtarı uçta reddedilir, Object.prototype kirlenmez', async () => {
  const r1 = await post(adminB2bRoutes, '/api/admin/b2b/deal', {
    offerId: '__proto__',
    buyerId: '__proto__',
    qty: 7,
  });
  assert.equal(r1.code, 400);
  const r2 = await post(adminDashboardRoutes, '/api/admin/dashboard/consume', { cat: '__proto__', n: 1 });
  assert.equal(r2.code, 400);
  const r3 = await post(adminDashboardRoutes, '/api/admin/dashboard/target', {
    cat: 'constructor',
    target: 5,
  });
  assert.equal(r3.code, 400);
  // Kirlenme denetimi: boş nesnede bu alanlar oluşmamalı.
  assert.equal('remaining' in {}, false);
  assert.equal('left' in {}, false);
  assert.equal(Object.prototype.hasOwnProperty.call({}, 'remaining'), false);
  assert.equal(S.isSafeKey('__proto__'), false);
  assert.equal(S.isSafeKey('constructor'), false);
  assert.equal(S.isSafeKey('prototype'), false);
  assert.equal(S.isSafeKey('t_123'), true);
});

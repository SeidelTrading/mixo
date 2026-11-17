// Birim testleri (node:test). Modüller açılışta veritabanı ve katalog yüklediği için geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit-consent.mjs   (Node >= 22.13)
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

const auth = await import('../lib/auth.mjs');
const { P } = await import('../services/catalog.mjs');
const an = await import('../services/analytics.mjs');
const { shopHome, shopOk } = await import('../services/storefront.mjs');
const { homeCache } = await import('../lib/cache.mjs');
const { mk } = await import('../services/channels.mjs');

const req = { headers: { 'user-agent': 'node-test' } };
const ids = [...P.values()]
  .filter(shopOk)
  .slice(0, 7)
  .map(p => p.id);
// Çok satanlar şeridi "behavior" kaynağına ancak en az 6 ürün iki ayrı ziyaretçiden sinyal alırsa geçer.
const davranis = (stamped, kaynak) => {
  for (const id of ids)
    for (const v of ['a', 'b'])
      an.events.push({
        t: Date.now(),
        vid: kaynak + v,
        s: 1,
        e: 'add',
        d: 'd',
        id,
        ...(stamped ? { consent: true } : {}),
      });
  homeCache.t = 0; // önbellek atlansın
  return shopHome();
};

test('onay beyanı taşımayan olay saklanmaz (sunucu kapısı)', () => {
  const n0 = an.events.length;
  const sayi = an.ingest(
    {
      events: [
        { e: 'view', id: ids[0], s: 1 },
        { e: 'search', q: 'x' },
      ],
    },
    req,
    'v-ret',
  );
  assert.equal(sayi, 2, 'vitrin kırılmasın: istek 200 ve sayı ile yanıtlanır');
  assert.equal(an.events.length, n0, 'ama hiçbir olay kaydedilmez');
  assert.ok(an.ingestStats.droppedNoConsent >= 1, 'atılan gönderim sayacı artar');
});

test('onaylı olay saklanır ve damgalanır', () => {
  const n0 = an.events.length;
  assert.equal(an.ingest({ consent: true, events: [{ e: 'view', id: ids[0], s: 1 }] }, req, 'v-ok'), 1);
  assert.equal(an.events.length, n0 + 1);
  assert.equal(an.events.at(-1).consent, true, 'kaydedilen olay onay damgası taşır');
});

test('damgasız eski olay analytics() içinde sayılmaz, onaylı olay sayılır', () => {
  const t0 = an.analytics(7).totalEvents;
  // "Eski olay" = bu kapıdan önce (ya da ham aktarımla) yazılmış, consent alanı olmayan kayıt → onaysız sayılır.
  an.events.push({ t: Date.now(), vid: 'v-eski', s: 1, e: 'view', d: 'd', id: ids[0] });
  assert.equal(an.analytics(7).totalEvents, t0, 'damgasız olay panoya girmez');
  an.events.push({ t: Date.now(), vid: 'v-yeni', s: 1, e: 'view', d: 'd', id: ids[0], consent: true });
  assert.equal(an.analytics(7).totalEvents, t0 + 1, 'onaylı olay sayılır');
});

test('çok satanlar şeridi yalnız onaylı olayı sayar', () => {
  assert.equal(davranis(false, 'v-damgasiz-').bestSource, 'curated', 'damgasız olaydan şerit oluşmaz');
  const h = davranis(true, 'v-onayli-');
  assert.equal(h.bestSource, 'behavior', 'onaylı olay şeridi besler');
  assert.ok(
    h.best.some(x => ids.includes(x.id)),
    'onaylı olay alan ürün şeritte',
  );
});

test('abmelden bağlantısı izni geri çeker (çerez gerekmez)', () => {
  const email = 'abmelden@example.com';
  assert.equal(mk.optIn(email, 'Ab Melden', 'test', '203.0.113.1'), true);
  assert.equal(mk.confirmOptIn(email, auth.sign(`oi:${email}:${mk.consentRecord(email).t}`)), 'ok');
  assert.equal(mk.consentOk(email), true);
  const url = mk.unsubscribeUrl(email);
  assert.ok(url.includes('/api/consent/unsubscribe'), 'uç yolu bağlantıda');
  const token = new URL(url).searchParams.get('token');
  assert.equal(mk.unsubscribe(email, 'gecersiz', '203.0.113.1'), 'bad', 'geçersiz imza reddedilir');
  assert.equal(mk.consentOk(email), true, 'geçersiz denemeden sonra izin durur');
  assert.equal(mk.unsubscribe(email, token, '203.0.113.1'), 'ok');
  assert.equal(mk.consentOk(email), false, 'izin geri çekildi');
  assert.ok(
    mk.consentLog().some(x => x.email === email && x.action === 'revoke'),
    'geri çekme rıza günlüğünde',
  );
});

test('eraseSubject: izin ve sepet gider, silme kanıtı kalır, ham e-posta kalmaz', () => {
  const email = 'loeschen@example.com';
  assert.equal(
    mk.saveCart({ email, name: 'Lö Schen', optin: true, items: [{ id: ids[0], qty: 1 }] }, true).ok,
    true,
  );
  assert.ok(mk.consentRecord(email), 'izin kaydı var');
  assert.ok(mk.exportSubject(email).cart, 'sepet dışa aktarımda görünür');
  const r = mk.eraseSubject(email, '203.0.113.2');
  assert.equal(r.optin, true);
  assert.equal(r.cart, true);
  assert.equal(mk.consentRecord(email), null, 'izin kaydı silindi');
  const sonra = mk.exportSubject(email);
  assert.equal(sonra.cart, null, 'sepet silindi');
  assert.equal(sonra.mails.length, 0, 'simüle posta kutusundaki kişisel kayıtlar silindi');
  const log = mk.consentLog();
  assert.ok(
    log.some(x => x.action === 'erase' && x.emailKey === mk.emailKey(email) && !x.email),
    'silme işleminin kendisi kanıt olarak günlükte (karma ile)',
  );
  assert.ok(!log.some(x => x.email === email), 'günlükte ham e-posta kalmaz');
});

test('geçersiz imzayla silme / dışa aktarma reddedilir', () => {
  const email = 'fremd@example.com';
  const ts = Date.now();
  assert.equal(mk.subjectOk('erase', email, ts, 'uydurma'), false);
  assert.equal(mk.subjectOk('export', email, ts, ''), false);
  const eraseToken = auth.sign(`subj:erase:${email}:${ts}`);
  assert.equal(mk.subjectOk('erase', email, ts, eraseToken), true, 'doğru imza geçer');
  assert.equal(mk.subjectOk('export', email, ts, eraseToken), false, 'silme imzası dışa aktarıma yaramaz');
  assert.equal(
    mk.subjectOk('erase', 'baska@example.com', ts, eraseToken),
    false,
    'başkasının verisi silinemez',
  );
  assert.equal(
    mk.subjectOk('erase', email, ts - 8 * 864e5, eraseToken),
    false,
    'süresi dolan bağlantı geçersiz',
  );
});

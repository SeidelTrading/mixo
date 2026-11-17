// Reklam ve paylaşım ajanı birim testleri (K-10, K-11, K-12). Simülasyon; ağ çağrısı yok.
// Çalıştır: node --test test/unit-ads.mjs   (Node >= 22.13)
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
const { mk } = await import('../services/channels.mjs');
const ads = await import('../services/ads.mjs');

const throwsCode = (fn, code) =>
  assert.throws(fn, e => e instanceof ads.AdsError && e.code === code, `AdsError ${code} bekleniyordu`);

test('yetkisiz markada paylaşım reddedilir, yetki verilince geçer', () => {
  assert.equal(ads.brandAllowed('Acme Parfum'), false);
  throwsCode(
    () => ads.recordPost({ channel: 'instagram', text: 'Neuer Duft', brand: 'Acme Parfum' }),
    'conflict',
  );
  throwsCode(() => ads.authorizeBrand('Acme Parfum', {}), 'invalid'); // kanıtsız yetki olmaz
  ads.authorizeBrand('Acme Parfum', { reference: 'Sözleşme 2026-11' });
  assert.equal(ads.brandAllowed(' acme parfum '), true);
  const r = ads.recordPost({ channel: 'instagram', text: 'Neuer Duft', brand: 'Acme Parfum', now: 1e12 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
});

test('paylaşım metni uyarı üretir ama engellenmez', () => {
  ads.authorizeBrand('Zeitwerk', { reference: 'Yazılı izin' });
  const r = ads.recordPost({
    channel: 'facebook',
    text: 'Letzte Chance, nur heute!',
    brand: 'Zeitwerk',
    now: 2e12,
  });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length >= 1);
});

test('günlük tavan aşılamaz; saatlik tavan da işler', () => {
  const t0 = 3e12;
  for (let i = 0; i < 4; i++) {
    const now = t0 + i * 2 * 36e5;
    assert.equal(ads.canPost({ channel: 'insta2', now }).ok, true);
    ads.authorizeBrand('Acme Parfum', { reference: 'x' });
    ads.recordPost({ channel: 'insta2', text: 'Post ' + i, brand: 'Acme Parfum', now });
  }
  const late = t0 + 7 * 36e5;
  assert.equal(ads.canPost({ channel: 'insta2', now: late }).ok, false);
  throwsCode(
    () => ads.recordPost({ channel: 'insta2', text: 'fazla', brand: 'Acme Parfum', now: late }),
    'limit',
  );
  // ertesi gün tavan açılır
  assert.equal(ads.canPost({ channel: 'insta2', now: t0 + 30 * 36e5 }).ok, true);
  // saatlik: aynı saatte ikinci paylaşım
  const h = t0 + 100 * 864e5;
  ads.recordPost({ channel: 'insta3', text: 'bir', brand: 'Acme Parfum', now: h });
  throwsCode(
    () => ads.recordPost({ channel: 'insta3', text: 'iki', brand: 'Acme Parfum', now: h + 60e3 }),
    'limit',
  );
});

test('aynı kelime hem pozitif hem negatif olamaz; normalize ve boş kelime', () => {
  ads.addKeyword('parfum', '  Ucuz ', { negative: true });
  assert.deepEqual(ads.keywords({ campaign: 'parfum' }).negative, ['ucuz']);
  throwsCode(() => ads.addKeyword('parfum', 'UCUZ'), 'conflict');
  throwsCode(() => ads.addKeyword('parfum', '   '), 'invalid');
  ads.addKeyword('parfum', 'eau de parfum');
  throwsCode(() => ads.addKeyword('parfum', 'eau de parfum', { negative: true }), 'conflict');
  ads.removeKeyword('parfum', 'ucuz', { negative: true });
  throwsCode(() => ads.removeKeyword('parfum', 'ucuz', { negative: true }), 'notfound');
  throwsCode(() => ads.keywords({ campaign: 'yok' }), 'notfound');
});

test('komut: açık komut uygulanır, belirsiz komut hiçbir şey yapmaz', () => {
  const before = JSON.stringify(ads.keywords({ campaign: 'parfum' }));
  const ok = ads.applyCommand('parfum kampanyasına negatif kelime olarak bedava ekle');
  assert.equal(ok.applied, true);
  assert.ok(ads.keywords({ campaign: 'parfum' }).negative.includes('bedava'));
  const mid = JSON.stringify(ads.keywords({ campaign: 'parfum' }));
  assert.notEqual(before, mid);
  for (const t of [
    'şu kampanyaya negatif kelime olarak ucuz ekle', // kampanya belirsiz
    'parfum kampanyasında bir şeyler yap',
    'parfum kampanyasına ucuz ekle', // liste türü yok
    'parfum kampanyasına negatif kelime ekle ya da kaldır',
    'parfum kampanyasına negatif kelime ekle', // kelime yok
    '',
  ]) {
    const r = ads.applyCommand(t);
    assert.equal(r.applied, false, t);
    assert.ok(r.reason);
  }
  assert.equal(JSON.stringify(ads.keywords({ campaign: 'parfum' })), mid);
  assert.equal(ads.applyCommand('negatif kelime olarak ucuz ekle', { campaign: 'saat' }).applied, true);
  assert.equal(ads.applyCommand('bedava negatif kelimesini kaldır', { campaign: 'parfum' }).applied, true);
});

test('onaysız adres retargeting listesine girmez, çift onaydan sonra girer', async () => {
  const email = 'musteri@example.com';
  const pid = [...P.keys()][0];
  mk.saveCart({ email, optin: true, items: [{ id: pid, qty: 1 }] }, true, '127.0.0.1');
  let a = await ads.audience({ kind: 'cart' });
  assert.equal(
    a.recipients.some(r => r.email === email),
    false,
  );
  assert.ok(a.skippedNoConsent >= 1);
  await assert.rejects(ads.audience({ kind: 'x' }), e => e.code === 'invalid');
  await assert.rejects(ads.appPromo({ email }), e => e.code === 'conflict');

  const t = mk.consentRecord(email).t;
  assert.equal(mk.confirmOptIn(email, auth.sign('oi:' + email + ':' + t), '127.0.0.1'), 'ok');
  a = await ads.audience({ kind: 'cart' });
  assert.equal(
    a.recipients.some(r => r.email === email),
    true,
  );
  assert.equal(a.skippedNoConsent, 0);

  const promo = await ads.appPromo({ email });
  assert.equal(promo.to, email);
  assert.match(promo.body, /App/);
  assert.equal(promo.simulated, true);
});

test('kampanya adı __proto__ / constructor: Object.prototype kirlenmez, kayıt sıradan ad olur', () => {
  assert.throws(
    () => ads.keywords({ campaign: '__proto__' }),
    e => e instanceof ads.AdsError && e.code === 'notfound',
  );
  const r = ads.addKeyword('__proto__', 'ayakkabı', { negative: true });
  assert.equal(r.added, true);
  ads.addKeyword('constructor', 'çanta');
  assert.deepEqual(ads.keywords({ campaign: '__proto__' }).negative, ['ayakkabı']);
  assert.deepEqual(ads.keywords({ campaign: 'constructor' }).positive, ['çanta']);
  assert.equal(/** @type {any} */ ({}).positive, undefined);
  assert.equal(/** @type {any} */ ({}).negative, undefined);
  assert.equal('negative' in {}, false);
  ads.removeKeyword('__proto__', 'ayakkabı', { negative: true });
  assert.deepEqual(ads.keywords({ campaign: '__proto__' }).negative, []);
});

// Birim testleri (node:test). Modüller açılışta veritabanı ve katalog yüklediği için geçici DATA_DIR kullanılır.
// Çalıştır: node --test test/unit.mjs   (Node >= 22.13)
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
const ov = await import('../services/overrides.mjs');
const pricing = await import('../services/pricing.mjs');
const vis = await import('../services/visibility.mjs');
const ord = await import('../services/orders.mjs');
const { P, norm } = await import('../services/catalog.mjs');
const { store } = await import('../lib/store.mjs');
const { aggregate } = await import('../marketing/suggest-helpers.mjs');
const { TOOLS } = await import('../services/assistant-tools.mjs');
const { TOOL_HANDLERS } = await import('../services/tool-handlers.mjs');
const { pending } = await import('../services/assistant-gate.mjs');
const { settings } = await import('../services/settings.mjs');
const { BULK_LIMIT } = await import('../lib/config.mjs');
const pool = await import('../services/pool.mjs');
const { mk } = await import('../services/channels.mjs');

test.after(() => {
  try {
    store.close();
  } catch {}
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('parola: doğru parola geçer, yanlış ve bozuk kayıt geçmez', () => {
  const h = auth.hashPw('uzun-bir-parola-123');
  assert.equal(auth.checkPw('uzun-bir-parola-123', h), true);
  assert.equal(auth.checkPw('yanlis', h), false);
  assert.equal(auth.checkPw('x', 'bozuk-kayit'), false);
  assert.notEqual(auth.hashPw('a'), auth.hashPw('a'), 'her özet farklı tuz kullanır');
});

test('imza: değiştirilen değer reddedilir', () => {
  const s = auth.sign('c:a@b.de');
  assert.equal(auth.sigOk(s, 'c:a@b.de'), true);
  assert.equal(auth.sigOk(s, 'c:x@b.de'), false);
  assert.equal(auth.sigOk('', 'c:a@b.de'), false);
});

test('hız sınırı: sınırı aşan çağrı reddedilir ve sayaç büyümez', () => {
  const k = 'birim-' + Math.random();
  const r = [1, 2, 3, 4, 5].map(() => auth.limited(k, 3, 60e3));
  assert.deepEqual(r, [false, false, false, true, true]);
});

test('istemci adresi: vekil dışında başlık okunmaz', () => {
  const req = {
    headers: { 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    socket: { remoteAddress: '10.0.0.1' },
  };
  assert.equal(auth.clientIp(req), '10.0.0.1');
});

test('norm: büyük/küçük harf, aksan ve ß', () => {
  assert.equal(norm('Größe ÉCOLE'), 'grosse ecole');
});

test('para ve kargo yardımcıları', () => {
  assert.equal(pricing.money(1.005 * 100), 100.5);
  assert.equal(pricing.money(19.999), 20);
  assert.equal(typeof pricing.freeShip(), 'number');
});

test('cleanOverride: geçerli alanlar temizlenir, geçersizler reddedilir', () => {
  assert.deepEqual(ov.cleanOverride({ title: '  Yeni  ', price: '12,5' }).fields, {
    title: 'Yeni',
    price: 12.5,
  });
  assert.ok(ov.cleanOverride({ price: -1 }).err);
  assert.ok(ov.cleanOverride({ title: '' }).err);
  assert.ok(ov.cleanOverride({ bilinmeyen: 1 }).err);
  assert.ok(ov.cleanOverride({ na: 'evet' }).err);
  assert.ok(ov.cleanOverride({ img: 'javascript:alert(1)' }).err);
  assert.ok(ov.cleanOverride({ img: 'img/../gizli.png' }).err);
  assert.equal(ov.cleanOverride({ img: 'https://ornek.de/a.jpg' }).fields.img, 'https://ornek.de/a.jpg');
  assert.ok(ov.cleanOverride([]).err);
  assert.equal(ov.cleanOverride({ price: null }).fields.price, null);
});

test('cleanContent: sınır ve bilinmeyen alan', () => {
  assert.ok(ov.cleanContent({ yok: 'x' }).err);
  assert.ok(ov.cleanContent({ freeShip: 99999 }).err);
  assert.equal(ov.cleanContent({ freeShip: '45' }).patch.freeShip, 45);
  assert.ok(ov.cleanContent(null).err);
});

test('katalog ve arama', () => {
  assert.ok(P.size > 1000);
  const first = [...P.values()][0];
  const r = vis.searchProducts(first.title.split(' ')[0], undefined, 5);
  assert.ok(Array.isArray(r));
  assert.ok(r.length <= 5);
});

test('sipariş doğrulama: boş sepet, kötü e-posta, geçersiz adet', () => {
  const pid = [...P.keys()].find(id => !vis.isHidden(id) && !ov.effP(P.get(id)).na);
  const cust = {
    name: 'Test Kunde',
    email: 'k@example.com',
    street: 'Musterstr. 1',
    zip: '10115',
    city: 'Berlin',
  };
  assert.ok(ord.createOrder({ items: [], customer: cust }).err);
  assert.ok(ord.createOrder({ items: [{ id: 'yok', qty: 1 }], customer: cust }).err);
  assert.ok(ord.createOrder({ items: [{ id: pid, qty: 0 }], customer: cust }).err);
  assert.ok(ord.createOrder({ items: [{ id: pid, qty: 21 }], customer: cust }).err);
  assert.ok(ord.createOrder({ items: [{ id: pid, qty: 1 }], customer: { ...cust, email: 'kötü' } }).err);
  const ok = ord.createOrder({ items: [{ id: pid, qty: 2 }], customer: cust });
  assert.ok(ok.order, JSON.stringify(ok));
  assert.equal(ok.order.status, 'new');
  assert.equal(ok.order.total, pricing.money(ok.order.subtotal + ok.order.shipping));
});

test('asistan araçları: tanım listesi ile işleyici tablosu birebir eşleşir', () => {
  const defined = TOOLS.map(t => t.name).sort();
  const handled = Object.keys(TOOL_HANDLERS).sort();
  assert.deepEqual(handled, defined);
});

test('asistan araçları: okuma araçları çalışır, yazan araç boş girdiyle hata döner', async () => {
  const conv = { messages: [], t: Date.now(), applied: [], newPending: [] };
  const settingsOut = await TOOL_HANDLERS.get_settings({}, conv);
  assert.ok(settingsOut && typeof settingsOut === 'object');
  const found = await TOOL_HANDLERS.search_products({ query: 'a', limit: 3 }, conv);
  assert.ok(found && typeof found === 'object');
  const bad = await TOOL_HANDLERS.update_product({}, conv);
  assert.ok(bad.error, 'kimliksiz ürün güncellemesi hata verir');
});

test('pazarlama önerisi: olay toplama sayaçları', () => {
  const ev = [
    { e: 'view', id: 'a', c: 'k1', b: 'M1' },
    { e: 'view', id: 'a', c: 'k1', b: 'M1' },
    { e: 'add', id: 'a' },
    { e: 'search', q: 'Kabel', n: 3 },
    { e: 'search', q: 'kabel', n: 5 },
  ];
  const r = aggregate(ev, norm);
  assert.equal(r.pv.get('a'), 2);
  assert.equal(r.pa.get('a'), 1);
  assert.equal(r.cats.get('k1'), 2);
  assert.equal(r.brands.get('M1'), 2);
  assert.equal([...r.sq.values()][0].count, 2);
  assert.equal([...r.sq.values()][0].results, 5);
});

const newConv = (extra = {}) => ({ messages: [], t: Date.now(), applied: [], newPending: [], ...extra });
const visibleIds = n =>
  [...P.keys()].filter(id => !vis.isHidden(id) && !settings.hidden[id] && !ov.effP(P.get(id)).na).slice(0, n);

test('asistan onay kapısı: küçük yazma doğrudan uygulanır, geri alınabilir', async () => {
  const conv = newConv();
  const r = await TOOL_HANDLERS.set_announcement({ text: 'Birim test duyurusu' }, conv);
  assert.equal(r.status, 'applied');
  assert.equal(settings.announcement, 'Birim test duyurusu');
  assert.equal(conv.applied.length, 1);
  const u = await TOOL_HANDLERS.undo_last_change({}, newConv());
  assert.equal(u.status, 'applied');
  assert.notEqual(settings.announcement, 'Birim test duyurusu');
});

test('asistan onay kapısı: toplu işlem BULK_LIMIT üstünde onaya düşer ve uygulanmaz', async () => {
  const ids = visibleIds(BULK_LIMIT + 1);
  assert.equal(ids.length, BULK_LIMIT + 1);
  const conv = newConv();
  const r = await TOOL_HANDLERS.hide_products({ ids }, conv);
  assert.equal(r.status, 'pending');
  assert.ok(pending.has(r.pending_id));
  assert.equal(Object.keys(settings.hidden).length, 0, 'onaydan önce hiçbir ürün gizlenmez');
  assert.equal(conv.newPending.length, 1);
  pending.delete(r.pending_id);
});

test('asistan onay kapısı: dış kaynaklı metin okunmuşsa küçük yazma da onay bekler', async () => {
  const conv = newConv({ tainted: true });
  const r = await TOOL_HANDLERS.set_announcement({ text: 'Zararlı olabilir' }, conv);
  assert.equal(r.status, 'pending');
  assert.notEqual(settings.announcement, 'Zararlı olabilir');
  pending.delete(r.pending_id);
});

test('asistan araçları: geçersiz girdiler hata ya da boş sonuç döner', async () => {
  const conv = newConv();
  assert.ok((await TOOL_HANDLERS.set_announcement({}, conv)).error);
  assert.equal((await TOOL_HANDLERS.hide_products({ ids: ['yok'] }, conv)).status, 'nothing');
  assert.equal((await TOOL_HANDLERS.approve_products({ ids: [] }, conv)).status, 'nothing');
});

/* ───────── ürün havuzu ───────── */
test('havuz: aynı ürün iki kaynaktan gelince tek kanonik kayda bağlanır', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'W-1',
    title: 'Bosch Bohrmaschine GSB 13 RE',
    vendor: 'Bosch',
    mpn: 'GSB 13 RE',
  });
  const b = pool.ingest({
    src: 'amazon',
    ref: 'B0XYZ',
    title: 'BOSCH GSB-13-RE Schlagbohrmaschine',
    vendor: 'bosch',
    mpn: 'gsb13re',
  });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.id, a.id);
  assert.deepEqual(
    pool
      .getPool(a.id)
      .sources.map(s => s.src)
      .sort(),
    ['amazon', 'wawi'],
  );
  // vendor + başlık (mpn yok) eşleşmesi
  const c = pool.ingest({
    src: 'idealo',
    ref: 'I-9',
    title: 'bosch  Bohrmaschine GSB 13 RE',
    vendor: 'BOSCH',
  });
  assert.equal(c.id, a.id);
});

test('havuz: aynı (src, ref) tekrarı kopya üretmez, günceller', () => {
  const before = pool.poolCounts();
  const a = pool.ingest({ src: 'wawi', ref: 'T-2', title: 'Tekrar Ürünü', vendor: 'Acme', price: 10 });
  const b = pool.ingest({ src: 'wawi', ref: 'T-2', title: 'Tekrar Ürünü', vendor: 'Acme', price: 12 });
  assert.equal(b.id, a.id);
  assert.equal(b.created, false);
  const after = pool.poolCounts();
  assert.equal(after.pools, before.pools + 1);
  assert.equal(after.srcs, before.srcs + 1);
  assert.equal(pool.getPool(a.id).sources[0].data.price, 12);
});

test('havuz: EAN eşleşmesi başlık ve üretici farklı olsa da çalışır', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'E-1',
    title: 'Kaffeemaschine Alpha',
    vendor: 'Delta',
    eans: ['4006381333931'],
  });
  const b = pool.ingest({
    src: 'amazon',
    ref: 'E-A1',
    title: 'Tamamen başka bir başlık',
    vendor: 'Başka',
    eans: ['4006381333931', '5901234123457'],
  });
  assert.equal(b.id, a.id);
  assert.deepEqual(
    pool
      .getPool(a.id)
      .eans.map(e => e.ean)
      .sort(),
    ['4006381333931', '5901234123457'],
  );
  assert.throws(() => pool.ingest({ src: 'x', ref: '1', title: 't', eans: ['123'] }), { code: 'invalid' });
});

test('havuz: eanFor pazar yerine özel EAN > "*" EAN > null', () => {
  const { id } = pool.ingest({ src: 'wawi', ref: 'M-1', title: 'Pazar Ürünü', vendor: 'Mk' });
  assert.equal(pool.eanFor(id, 'amazon'), null);
  pool.addEan(id, '4012345678901');
  assert.equal(pool.eanFor(id, 'amazon'), '4012345678901');
  pool.addEan(id, '4012345678918', 'amazon');
  assert.equal(pool.eanFor(id, 'amazon'), '4012345678918');
  assert.equal(pool.eanFor(id, 'idealo'), '4012345678901');
  assert.equal(pool.eanFor(id), '4012345678901');
  pool.removeEan(id, '4012345678918', 'amazon');
  assert.equal(pool.eanFor(id, 'amazon'), '4012345678901');
});

test('havuz: EAN çakışması ve 8 EAN sınırı hata verir, üzerine yazılmaz', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'C-1',
    title: 'Çakışma A',
    vendor: 'Ca',
    eans: ['4000000000017'],
  });
  const b = pool.ingest({ src: 'wawi', ref: 'C-2', title: 'Çakışma B', vendor: 'Cb' });
  assert.notEqual(a.id, b.id);
  assert.throws(() => pool.addEan(b.id, '4000000000017'), { code: 'conflict' });
  assert.throws(() => pool.addEan(b.id, '4000000000017', 'amazon'), { code: 'conflict' });
  assert.equal(pool.getPool(a.id).eans.length, 1);
  assert.equal(pool.getPool(b.id).eans.length, 0);
  // iki ayrı ürüne işaret eden EAN'lar çakışmadır; başarısız ingest hiçbir şey bırakmaz
  pool.addEan(b.id, '4000000000024');
  const n = pool.poolCounts();
  assert.throws(
    () => pool.ingest({ src: 'amazon', ref: 'C-4', title: 'Yeni', eans: ['4000000000017', '4000000000024'] }),
    { code: 'conflict' },
  );
  assert.deepEqual(pool.poolCounts(), n);
  const eight = Array.from(
    { length: 9 },
    (_, i) => '40000000001' + String(10 + i).padStart(2, '0') + '0',
  ).map(e => e.slice(0, 13));
  const before = pool.poolCounts();
  assert.throws(() => pool.ingest({ src: 'wawi', ref: 'C-5', title: 'Dokuz EAN', eans: eight }), {
    code: 'limit',
  });
  assert.deepEqual(pool.poolCounts(), before, 'sınır hatasında işlem geri alınır');
});

test('havuz: merge + unmerge sayıları başlangıca döndürür', () => {
  const a = pool.ingest({
    src: 'wawi',
    ref: 'G-1',
    title: 'Birleşen A',
    vendor: 'Ga',
    eans: ['4100000000010'],
  });
  const b = pool.ingest({
    src: 'amazon',
    ref: 'G-2',
    title: 'Birleşen B',
    vendor: 'Gb',
    eans: ['4100000000027'],
  });
  assert.notEqual(a.id, b.id);
  const before = pool.poolCounts();
  const undo = pool.merge(a.id, b.id);
  assert.equal(pool.poolCounts().pools, before.pools - 1);
  assert.equal(pool.getPool(b.id), null);
  assert.equal(pool.getPool(a.id).eans.length, 2);
  assert.equal(pool.getPool(a.id).sources.length, 2);
  pool.unmerge(undo);
  assert.deepEqual(pool.poolCounts(), before);
  assert.deepEqual(
    pool.getPool(a.id).eans.map(e => e.ean),
    ['4100000000010'],
  );
  assert.deepEqual(
    pool.getPool(b.id).sources.map(s => s.ref),
    ['G-2'],
  );
  assert.equal(pool.getPool(b.id).title, 'Birleşen B');
  assert.throws(() => pool.unmerge(undo), { code: 'conflict' }, 'ikinci geri alma reddedilir');
});

/* ───────── rıza kaydı: çift onay (K-30) ───────── */
test('rıza: yeni kayıt onaysız başlar ve alıcı listesine girmez', () => {
  assert.equal(mk.optIn('riza1@example.com', 'Riza Bir', 'cart'), true);
  assert.equal(mk.consentOk('riza1@example.com'), false, 'onaylanmadan alıcı olamaz');
});

test('rıza: doğrulama bağlantısı onaylar, ikinci tıklama already döner', () => {
  const email = 'riza2@example.com';
  mk.optIn(email, 'Riza Iki', 'cart');
  const token = auth.sign(`oi:${email}:${mk.consentRecord(email).t}`);
  assert.equal(mk.confirmOptIn(email, 'yanlis-token'), 'bad', 'bozuk imza reddedilir');
  assert.equal(mk.consentOk(email), false);
  assert.equal(mk.confirmOptIn(email, token), 'ok');
  assert.equal(mk.consentOk(email), true);
  assert.equal(mk.confirmOptIn(email, token), 'already');
});

test('rıza: bilinmeyen adres ve süresi dolmuş bağlantı reddedilir', () => {
  assert.equal(mk.confirmOptIn('yok@example.com', 'x'), 'bad');
  const email = 'riza3@example.com';
  mk.optIn(email, '', 'cart');
  const rec = mk.consentRecord(email);
  rec.t -= 8 * 864e5; // bağlantı ömrü 7 gün
  assert.equal(mk.confirmOptIn(email, auth.sign(`oi:${email}:${rec.t}`)), 'expired');
  assert.equal(mk.consentOk(email), false);
});

test('rıza: günlük izin, onay ve geri çekmeyi kanıtla saklar', () => {
  const email = 'riza4@example.com';
  mk.optIn(email, 'Riza Dort', 'cart', '203.0.113.9');
  mk.confirmOptIn(email, auth.sign(`oi:${email}:${mk.consentRecord(email).t}`), '203.0.113.9');
  const kayit = mk.consentLog().filter(x => x.email === email);
  assert.deepEqual(
    kayit.map(x => x.action),
    ['optin', 'confirm'],
  );
  assert.ok(kayit.every(x => x.text && x.t > 0));
});

test('rıza: onaysız sepet hatırlatma alıcısı olmaz, onaydan sonra olur', () => {
  const email = 'riza5@example.com';
  const id = [...P.keys()][0];
  const r = mk.saveCart({ email, name: 'Riza Bes', optin: true, items: [{ id, qty: 1 }] }, true);
  assert.equal(r.ok, true, 'sepet kaydedildi');
  const cartRule = settings.marketing.rules.find(x => x.type === 'cart');
  const sayac = () => {
    const x = mk.preview(cartRule.id)[0];
    return { alici: x.due.length + x.scheduled.length, izinsiz: x.noConsent };
  };
  const once = sayac();
  assert.equal(once.alici, 0, 'onaysız adres alıcı değil');
  assert.ok(once.izinsiz >= 1, 'izinsiz olarak sayılır');
  assert.equal(mk.confirmOptIn(email, auth.sign(`oi:${email}:${mk.consentRecord(email).t}`)), 'ok');
  assert.equal(sayac().alici, 1, 'onaydan sonra alıcı olur');
});

test('havuz: birleştirme değişiklik günlüğüne yazılır ve kimliğiyle geri alınır', () => {
  const a = pool.ingest({ src: 'wawi', ref: 'L-1', title: 'Günlük A', vendor: 'Acme' });
  const b = pool.ingest({ src: 'gls', ref: 'L-2', title: 'Günlük B', vendor: 'Beta' });
  const before = pool.poolCounts();
  const r = pool.merge(a.id, b.id);
  assert.ok(r.changeId, 'birleştirme bir değişiklik kimliği döndürür');
  const ch = store.allChanges().find(x => x.id === r.changeId);
  assert.equal(ch?.undo?.kind, 'pool-merge', 'geri alma verisi günlükte duruyor');
  assert.equal(ch.undone, false);
  pool.unmergeById(r.changeId); // istemci undo nesnesini saklamadan geri alır
  assert.deepEqual(pool.poolCounts(), before);
  assert.equal(store.allChanges().find(x => x.id === r.changeId).undone, true);
  assert.throws(() => pool.unmergeById(r.changeId), { code: 'conflict' });
  assert.throws(() => pool.unmergeById('yok-boyle'), { code: 'notfound' });
});

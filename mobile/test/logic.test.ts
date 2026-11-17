// Saf mantık testleri (ekran ve ağ yok). Çalıştır: npm test   (Node >= 22.18)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_FEE } from '../src/config';
import { countLine, dailyMix } from '../src/filters';
import { freeShipProgress, missingForFree, shippingFor } from '../src/shipping';
import { imageUrl, makeMatcher, norm, primeProduct, productSnapshot, scopeInfo, scopeKey, subIndexOf, type Index, type Product } from '../src/api/shop';

const prod = (over: Partial<Product> = {}): Product => ({
  id: 'p1', title: 'USB-C Kabel 2 m', vendor: 'Delock', price: 9.9, was: 0, img: 'a.jpg', cat: 'technik', sub: 'Kabel', si: 0, na: false, lq: false, ...over,
});

test('kargo: boş sepet ve eşik üstü ücretsiz, altı sabit ücret', () => {
  assert.equal(shippingFor(0, 39), 0);
  assert.equal(shippingFor(38.99, 39), SHIP_FEE);
  assert.equal(shippingFor(39, 39), 0);
  assert.equal(shippingFor(100, 39), 0);
});

test('kargo: eksik tutar ve ilerleme sınırları', () => {
  assert.equal(missingForFree(30, 39), 9);
  assert.equal(missingForFree(50, 39), 0);
  assert.equal(freeShipProgress(0, 39), 0);
  assert.equal(freeShipProgress(19.5, 39), 0.5);
  assert.equal(freeShipProgress(100, 39), 1);
  assert.equal(freeShipProgress(10, 0), 1, 'eşik 0 ise ilerleme tamamlanmış sayılır');
});

test('norm: aksan, büyük harf ve ß', () => {
  assert.equal(norm('Größe ÉCOLE'), 'grosse ecole');
});

test('arama eşleştirici: tüm belirteçler, bitişik yazım, noktalama', () => {
  const p = prod();
  assert.equal(makeMatcher('kabel')(p), true);
  assert.equal(makeMatcher('delock kabel')(p), true);
  assert.equal(makeMatcher('usbc')(p), true, '"usbc" ~ "USB-C"');
  assert.equal(makeMatcher('kabel hdmi')(p), false);
  assert.equal(makeMatcher('-')(prod({ title: 'Kabel 2 m' })), false, 'yalnız noktalama, tireli olmayan ürüne uymaz');
  assert.equal(makeMatcher('')(p), true, 'boş sorgu hepsini geçirir');
});

test('görsel adresi: sunucu, CDN ve tam adres kuralları', () => {
  assert.equal(imageUrl(''), '');
  assert.equal(imageUrl('https://x.test/a.jpg'), 'https://x.test/a.jpg');
  assert.match(imageUrl('img/a.jpg'), /\/img\/a\.jpg$/);
  assert.match(imageUrl('fix/a.jpg'), /\/img\/fix\/a\.jpg$/);
  assert.match(imageUrl('a.jpg', 96), /a\.jpg\?width=96$/);
});

const idx: Index = {
  total: 100,
  cats: [{ k: 'technik', label: 'Technik', n: 60, subs: [{ name: 'Kabel', n: 10 }, { name: 'Hub', n: 5 }] }],
  lists: { all: 3, technik: 2, 'technik/0': 1 },
  facets: {},
} as unknown as Index;

test('kapsam: anahtar üretimi ve çözümleme', () => {
  assert.equal(scopeKey('all', 2), 'all');
  assert.equal(scopeKey('technik'), 'technik');
  assert.equal(scopeKey('technik', 1), 'technik/1');
  assert.equal(scopeInfo(idx, 'all')?.n, 100);
  assert.equal(scopeInfo(idx, 'technik')?.label, 'Technik');
  assert.equal(scopeInfo(idx, 'technik/0')?.label, 'Kabel');
  assert.equal(scopeInfo(idx, 'technik/9'), null);
  assert.equal(scopeInfo(idx, 'technik/x'), null);
  assert.equal(scopeInfo(idx, 'yok'), null);
  assert.equal(subIndexOf(idx, 'technik', 'Hub'), 1);
  assert.equal(subIndexOf(idx, 'technik', 'Yok'), -1);
});

test('ürün anlık görüntü önbelleği: doldurulur, en son yazım kazanır, si/lq varsayılanları', () => {
  assert.equal(productSnapshot('snap-yok'), undefined);
  primeProduct({ id: 'snap1', title: 'A', vendor: 'V', price: 5, was: 0, img: 'a.jpg', cat: 'uhren', sub: 'Herrenuhren', na: false });
  assert.equal(productSnapshot('snap1')?.si, -1);
  assert.equal(productSnapshot('snap1')?.lq, false);
  primeProduct({ ...prod({ id: 'snap1', price: 7, na: true }) });
  assert.equal(productSnapshot('snap1')?.price, 7);
  assert.equal(productSnapshot('snap1')?.na, true);
});

test('günün karışımı: aynı ürünler, aynı gün aynı sıra, komşu kartlar farklı kategoriden', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, cat: ['wohnen', 'wohnen', 'drucker', 'uhren', 'uhren', 'technik'][i] }));
  const d1 = dailyMix(list, new Date(2026, 10, 16));
  assert.deepEqual([...d1].map(x => x.id).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(dailyMix(list, new Date(2026, 10, 16)), d1);
  for (let i = 1; i < 4; i++) assert.notEqual(d1[i].cat, d1[i - 1].cat, 'ilk turda kategoriler dönüşümlü');
  const other = [1, 2, 3, 4, 5, 6, 7].map(d => dailyMix(list, new Date(2026, 10, 16 + d)).map(x => x.id).join(''));
  assert.ok(other.some(o => o !== d1.map(x => x.id).join('')), 'başka günlerde sıra değişir');
});

test('liste sayı satırı: süzgeçsiz yok, kesin ve kısmi sayı etiketli', () => {
  assert.equal(countLine({ matched: 500, filtersActive: false, complete: false, brandEntry: null }), null);
  assert.deepEqual(countLine({ matched: 2600, filtersActive: true, complete: true, brandEntry: null }), { text: '2.600 Treffer', exact: true });
  assert.deepEqual(countLine({ matched: 500, filtersActive: true, complete: false, brandEntry: null }), { text: 'mind. 500 Treffer · weitere werden geladen', exact: false });
  assert.deepEqual(countLine({ matched: 40, filtersActive: true, complete: false, brandEntry: { marke: 'Casio', n: 615 } }), { text: '615 Treffer', exact: true });
});

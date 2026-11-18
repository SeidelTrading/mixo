import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMpn, isInternalSku, isUsableMpn, mpnCandidates, mpnFromSku } from '../lib/mpn.mjs';

// Saha örneğinden (Mixoutlet, 2026-11-17/18) alınmış tablo: [girdi, beklenen MPN]
const TABLO = [
  [
    { title: 'Digitus DA-90370 Standfuß für TV bis 178cm 70" 50KG', brand: 'Digitus', sku: 'BA-820009' },
    'DA-90370',
  ],
  [{ title: 'Epson 502 C13T02V34010 magenta', brand: 'Epson', sku: 'BA-104770' }, 'C13T02V34010'],
  [{ title: 'Festina F20636-1 Armbanduhr', brand: 'Festina', sku: 'F20636-1' }, 'F20636-1'],
  [
    { title: 'Casio Edifice EFB-109D-7AVEF Herren-Armbanduhr', brand: 'Casio', sku: 'UHREN1-EFB-109D-7AVEF' },
    'EFB-109D-7AVEF',
  ],
  [
    { title: 'Philip Watch R8223225001 Armbanduhr', brand: 'Philip Watch', sku: 'R8223225001' },
    'R8223225001',
  ],
  [
    { title: 'Tommy Hilfiger LUKE TH1791118 Armbanduhr', brand: 'Tommy Hilfiger', sku: 'TH1791118' },
    'TH1791118',
  ],
  [
    {
      title: 'Guess Herrenarmband JUXB03240JWSTDGS – Edelstahl, Silber/Grün',
      brand: 'Guess',
      sku: 'UHREN2-JUXB03240JWSTDGS',
    },
    'JUXB03240JWSTDGS',
  ],
  // DeLOCK: EAN 4043619 + 5 haneli MPN + kontrol hanesi
  [
    {
      title: 'Delock D-Sub9 Buchse zu Terminalblock',
      brand: 'DeLOCK',
      sku: 'BA-21150232',
      ean: '4043619665563',
    },
    '66556',
  ],
  [{ title: 'Delock Kabel', brand: 'DeLOCK', sku: 'BA-1', ean: '4043619807851' }, '80785'],
  // açıklamadaki etiket
  [
    {
      title: 'Apple iPhone 16 Pro Max',
      brand: 'Apple',
      sku: 'x1',
      bodyHtml: '<p><b>Herstellernummer:</b> MYWV3ZD/A</p>',
    },
    'MYWV3ZD/A',
  ],
  [
    {
      title: 'Schmuck TOUS',
      brand: 'TOUS',
      sku: 'abc',
      bodyHtml: '<p>Schmuck · TOUS · Modell 3000136000</p>',
    },
    '3000136000',
  ],
];

test('extractMpn: saha örnekleri', () => {
  for (const [girdi, beklenen] of TABLO) assert.equal(extractMpn(girdi), beklenen, girdi.title);
});

test('extractMpn: yanlış pozitif yok (ölçü/teknik token, iç kod, barkod)', () => {
  assert.equal(
    extractMpn({
      title: 'EFB Elektronik RJ45 Patchkabel Cat.6 U/UTP LSZH CCA grn 0,5m',
      brand: 'EFB Elektronik',
      sku: 'BA-21338248',
    }),
    null,
  );
  assert.equal(
    extractMpn({ title: 'Kabel Cat6a USB3 RJ45 v1.4 128GB 60Hz', brand: 'X', sku: 'BA-21150232' }),
    null,
  );
  // iç kodlar asla MPN olmaz, başlıkta geçse bile
  assert.equal(extractMpn({ title: 'Kabel BA-21150232 schwarz', brand: 'X', sku: 'BA-21150232' }), null);
  assert.equal(
    extractMpn({ title: 'Afnan 9 pm Rebel Eau de Parfum 100 ml', brand: 'Afnan', sku: 'arp-17' }),
    null,
  );
  // barkod uzunluğunda salt rakam MPN değildir
  assert.equal(extractMpn({ title: 'Kabel 4006381333931 schwarz', brand: 'X', sku: '4006381333931' }), null);
  // DeLOCK kuralı yalnız DeLOCK ve 4043619 öneki için
  assert.equal(extractMpn({ title: 'Kabel', brand: 'LogiLink', ean: '4043619665563' }), null);
  assert.equal(extractMpn({ title: 'Kabel', brand: 'DeLOCK', ean: '4006381333931' }), null);
  assert.equal(extractMpn(), null);
});

test('extractMpn: sku başlıkta yoksa kabul edilmez', () => {
  assert.equal(extractMpn({ title: 'Casio Uhr schwarz', brand: 'Casio', sku: 'GA-2100-1A' }), null);
});

test('isInternalSku ve isUsableMpn', () => {
  for (const s of ['BA-21150232', 'ba-1', 'arp-17', 'OT-12345', 'UHREN1-EFB-109D-7AVEF', 'UHREN-1'])
    assert.equal(isInternalSku(s), true, s);
  for (const s of ['DA-90370', 'F20636-1', 'C13T02V34010', '', null])
    assert.equal(isInternalSku(s), false, String(s));
  assert.equal(isUsableMpn('DA-90370'), true);
  assert.equal(isUsableMpn('A-1'), false); // 5 karakterden kısa
  assert.equal(isUsableMpn('ABCDEF'), false); // rakam yok
  assert.equal(isUsableMpn('4006381333931'), false); // barkod
  assert.equal(isUsableMpn('BA-21150232'), false); // iç kod
});

test('mpnCandidates: yalnız küçük harf-rakam, en az 5 karakter ve rakam', () => {
  assert.deepEqual(mpnCandidates('DA-90370'), ['da90370']);
  assert.deepEqual(mpnCandidates('F20636/1'), ['f206361', 'f20636']);
  assert.deepEqual(mpnCandidates('K8104GN.0,5'), ['k8104gn05', 'k8104gn']);
  assert.deepEqual(mpnCandidates('A-1'), []);
  assert.deepEqual(mpnCandidates(null), []);
  assert.deepEqual(mpnCandidates('ABCDEF'), []);
});

test('extractMpn: bileşik ölçüler (4K60Hz, 1080p60), işlemci modeli ve "Passend für Modell" uyumluluk etiketi MPN olmaz', () => {
  assert.equal(extractMpn({ title: 'Delock Kabel 3m 4K60Hz', brand: 'Delock' }), null);
  assert.equal(extractMpn({ title: 'Roline Monitorkabel 15m 1080p60', brand: 'Roline' }), null);
  assert.equal(extractMpn({ title: 'Intel Core i7-14700K Prozessor', brand: 'Intel' }), null);
  assert.equal(
    extractMpn({ title: 'Foo Hülle', brand: 'Foo', bodyHtml: '<p>Passend für Modell HP2000X</p>' }),
    null,
  );
  assert.equal(
    extractMpn({ title: 'Foo Hülle', brand: 'Foo', bodyHtml: '<p>Modell: HP2000X</p>' }),
    'HP2000X',
  );
});

test('mpnFromSku: yalnız varyanta özgü sku kuralları (a/b); başlık ve açıklama dışarıda', () => {
  assert.equal(
    mpnFromSku({ title: 'Casio EFB-109D-7AVEF Uhr', sku: 'UHREN1-EFB-109D-7AVEF' }),
    'EFB-109D-7AVEF',
  );
  assert.equal(mpnFromSku({ title: 'Casio SRPK99K1 Uhr', sku: 'SRPK99K1' }), 'SRPK99K1');
  assert.equal(mpnFromSku({ title: 'Casio SRPK99K1 Uhr', sku: 'BA-123456' }), null);
  assert.equal(mpnFromSku({ title: 'Lattafa LKH12345 Parfüm', sku: '' }), null);
});

test('extractMpn: paket ve adet ifadeleri (4er-Pack, 10er, 5-pack, 100stk) MPN olmaz', () => {
  // deneme 2026-11-18: "Epson Tinte 34 4er-Pack ..." için MPN '4er-Pack' çıkmış, hedefli haritada yüzlerce sahte tohum üretmişti
  assert.equal(extractMpn({ title: 'Epson Tinte 34 4er-Pack black + color T3466', brand: 'Epson' }), null);
  assert.equal(extractMpn({ title: 'Brother 10er Toner schwarz', brand: 'Brother' }), null);
  assert.equal(extractMpn({ title: 'Foo 5-pack Kabelbinder 100stk', brand: 'Foo' }), null);
  assert.equal(extractMpn({ title: 'HP 12-teilig Set', brand: 'HP' }), null);
  // gerçek model numarası pakete rağmen alınır
  assert.equal(extractMpn({ title: 'Canon PIXMA TS4150i 3in1 Drucker', brand: 'Canon' }), 'TS4150i');
});

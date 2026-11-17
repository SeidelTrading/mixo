// Tasarım kuralı testleri (saf işlevler; ekran yok). Çalıştır: node --import ./test/register.mjs --test test/design.test.ts   (Node >= 22.18)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardTitle, codesLast, monogram, nProdukte, softBreak, T, titleAfterBrand } from '../src/strings';
import { DISPLAY_STEPS, displayLines, fitDisplay, heroBox, heroCardWidth, heroTextWidth, heroTile } from '../src/theme';

// Dizindeki kategori adları ve en uzun olası sayı başlıkları (afiş başlığı olarak yazılan metinler)
const HERO_TITLES = [
  nProdukte(44_862), nProdukte(999_999), nProdukte(1),
  'Uhren', 'Parfum & Düfte', 'Technik', 'Drucker & Büro', 'Wohnen & Haushalt', 'Schmuck', 'Mode',
  'Körperpflege', 'Spielzeug & Freizeit', 'Genuss & Mehr',
];

test('afiş: 360 dp genişlikte hiçbir başlık iki satırı aşmaz ve sözcük ortasından bölünmez', () => {
  for (const screenW of [360, 393, 411, 430]) {
    const w = heroTextWidth(screenW);
    for (const title of HERO_TITLES) {
      const size = fitDisplay(title, w);
      assert.ok(displayLines(title, size, w) <= 2, `${screenW} dp: "${title}" ${size} px ile ${displayLines(title, size, w)} satır`);
      // 360 dp ve üstünde okunaklı kalır: en küçük adıma inilmez
      assert.ok(size >= 22, `${screenW} dp: "${title}" ${size} px'e düştü`);
    }
  }
});

test('afiş: çok dar ekranda (320 dp) da iki satıra sığar; karo küçülür', () => {
  const w = heroTextWidth(320);
  assert.equal(heroTile(320), heroBox.tileSmall);
  for (const title of HERO_TITLES) assert.ok(displayLines(title, fitDisplay(title, w), w) <= 2, title);
});

test('afiş: metin sütunu kartın en az %58\'i', () => {
  for (const screenW of [320, 360, 411, 600]) {
    const card = heroCardWidth(screenW);
    const textCol = card - heroTile(screenW) - heroBox.pad; // karo ve sağ boşluğu dışında kalan sütun
    assert.ok(textCol / card >= 0.58, `${screenW} dp: ${(textCol / card).toFixed(2)}`);
  }
});

test('afiş: sığdırma en büyük uygun adımı seçer; hiçbir adım sığdırmıyorsa en küçüğe düşer', () => {
  assert.equal(fitDisplay('Uhren', 200), DISPLAY_STEPS[0]);
  assert.equal(displayLines('Uhren', 28, 200), 1);
  assert.equal(displayLines('44.862 Produkte', 28, 160), 2);
  // tek sözcük sütuna sığmıyorsa satır sayısı sonsuzdur (ortadan bölünme sayılmaz) ve boyut küçülür
  assert.equal(displayLines('Körperpflege', 28, 160), Infinity);
  assert.ok(fitDisplay('Körperpflege', 160) < 28);
  assert.equal(fitDisplay('Donaudampfschifffahrtsgesellschaft', 120), DISPLAY_STEPS[DISPLAY_STEPS.length - 1]);
  assert.equal(displayLines('a\nb', 28, 200), 2);
});

test('marka baş harfi: rakam ve noktalama atlanır, harf yoksa boş', () => {
  assert.equal(monogram('DeLOCK'), 'D');
  assert.equal(monogram('3DPLady'), 'D');
  assert.equal(monogram('  efb Elektronik'), 'E');
  assert.equal(monogram('1&1'), '');
  assert.equal(monogram('4711'), '');
  assert.equal(monogram('öko-Test'), 'Ö');
  assert.equal(monogram(''), '');
});

test('kart başlığı: baştaki model kodları sona alınır, başka başlık değişmez', () => {
  assert.equal(codesLast('32A5P 6H400V Aufbaustecker 330 IP44 Phasenwender'), 'Aufbaustecker 330 IP44 Phasenwender · 32A5P 6H400V');
  // ardından gerçek sözcük gelmiyorsa dokunulmaz
  assert.equal(codesLast('BN0500 48,26cm 19 Zoll 1HE 8x Schuko'), 'BN0500 48,26cm 19 Zoll 1HE 8x Schuko');
  // kod baştaysa değil: aynen kalır
  assert.equal(codesLast('Lady Snake JC1L397M0085 – Damenuhr'), 'Lady Snake JC1L397M0085 – Damenuhr');
  // yalnız büyük harfli sözcük kod sayılmaz (rakam yok)
  assert.equal(codesLast('USB Kabel 2 m'), 'USB Kabel 2 m');
  assert.equal(codesLast('DESIGN Mod.TEMPEST YOUNG'), 'DESIGN Mod.TEMPEST YOUNG');
  // yalnız kodlardan oluşan başlık
  assert.equal(codesLast('A1B2 C3D4'), 'A1B2 C3D4');
  assert.equal(codesLast('  HP 305XL Tinte  '), 'HP 305XL Tinte');
});

test('kart başlığı: katalogdan dört gerçek başlık (model öneki, uzun tire, bileşik marka)', () => {
  // "Mod." öneki ve ardından gelen kod baştaki bölümdür; ürün türü öne gelir
  assert.equal(cardTitle('Lorus', 'LORUS Mod. RT371KX9 – Herrenuhr – Stilvolle Eleganz'), 'Herrenuhr – Stilvolle Eleganz · Mod. RT371KX9');
  assert.equal(cardTitle('Philip Watch', 'PHILIP WATCH MOD. R8253597116 – Armbanduhr – Stilvolle Eleganz'), 'Armbanduhr – Stilvolle Eleganz · MOD. R8253597116');
  // Marka BÜYÜK harfle ve ardından büyük harfli sözcük: bileşik ad bölünmez, tüm baş bölüm sona gider
  assert.equal(cardTitle('Casio', 'CASIO WATCH C_F-91W-1YEG – Armbanduhr – Stilvolle Eleganz'), 'Armbanduhr – Stilvolle Eleganz · CASIO WATCH C_F-91W-1YEG');
  assert.equal(
    cardTitle('Momo', 'MOMO DESIGN Mod.TEMPEST YOUNG MD2114AL-23 – Herrenuhr – Stilvolle Eleganz'),
    'Herrenuhr – Stilvolle Eleganz · MOMO DESIGN Mod.TEMPEST YOUNG MD2114AL-23',
  );
  assert.equal(titleAfterBrand('Momo', 'MOMO DESIGN Mod.TEMPEST YOUNG'), 'MOMO DESIGN Mod.TEMPEST YOUNG');
  // Aynı yazımlı marka ve normal başlık: marka yine düşer; sözcük ortasından kesilmez
  assert.equal(titleAfterBrand('Casio', 'Casio Vintage A168WEM-2EF'), 'Vintage A168WEM-2EF');
  assert.equal(titleAfterBrand('HP', 'HPE ProLiant'), 'HPE ProLiant');
  // Bitişik önek: "Mod.EVO" kod sayılır; küçük harfli devam ("Mod.masse") sayılmaz
  assert.equal(codesLast('Mod.EVO Damenuhr rosé'), 'Damenuhr rosé · Mod.EVO');
  assert.equal(codesLast('Mod.masse Tisch'), 'Mod.masse Tisch');
});

test('dürüst etiketler: küratörlük ima eden "Unsere Auswahl" kullanılmaz', () => {
  assert.notEqual(T.bestCurated, 'Unsere Auswahl');
  assert.ok(!/unsere|für dich|empfohlen|beliebt/i.test(T.bestCurated));
});

test('daire etiketi: uzun bileşik sözcük bilinen parçadan yumuşak tireyle bölünebilir, kısa ad değişmez', () => {
  assert.equal(softBreak('Handyzubehör'), 'Handy\u00ADzubehör');
  assert.equal(softBreak('Bildschirmzubehör'), 'Bildschirm\u00ADzubehör');
  assert.equal(softBreak('Smartphones & Telefone'), 'Smart\u00ADphones & Telefone');
  assert.equal(softBreak('Elektroinstallation'), 'Elektro\u00ADinstallation');
  assert.equal(softBreak('Uhren'), 'Uhren');
  assert.equal(softBreak('Damenuhren'), 'Damenuhren');
  assert.equal(softBreak('Komponenten'), 'Komponenten');
});

import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Mixo Outlet tasarım belirteçleri. Kaynak: web vitrinimizin :root değişkenleri.
 * Ekranlar ham renk kodu yazmaz; her şey buradan gelir (bir değer değişince uygulamanın tamamı yeniden boyanır).
 */

/** Marka paleti (ham değerler). Bileşenler mümkün olduğunca aşağıdaki anlamsal `colors` adlarını kullanır. */
export const palette = {
  navy: '#182047',
  navy2: '#171b38',
  blue: '#3048c8',
  blueD: '#2438a6',
  sun: '#ffd168',
  coral: '#c83e30',
  peach: '#fff0e6',
  lilac: '#eeeaff',
  mist: '#f7f6fb',
  line: '#dcdfea',
  /** çok ince ayırıcı ve kart kenarı (beyaz panel üstündeki beyaz kart) */
  lineSoft: '#eceef6',
  muted: '#62667c',
  white: '#ffffff',
};

export const colors = {
  /** sayfa zemini */
  bg: palette.mist,
  /** kart, panel, giriş alanı zemini */
  card: palette.white,
  /** ana metin ve koyu yüzeyler */
  text: palette.navy,
  muted: palette.muted,
  line: palette.line,
  /** birincil eylem: düğme, aktif sekme, bağlantı, seçili durum */
  primary: palette.blue,
  /** birincil eylemin basılı hâli */
  primaryDark: palette.blueD,
  onPrimary: palette.white,
  /** fiyat vurgusu (indirimli fiyat), uyarı, rozet, dolu kalp, yıkıcı eylem metni */
  accent: palette.coral,
  /** olumlu durum metni ("Gratisversand erreicht", "günstiger"): lacivert + ikon; palette yeşil yoktur, yeşil kullanılmaz */
  good: palette.navy,
  /** dikkat notu zemini ve metni (şeftali üstünde lacivert) */
  warn: palette.peach,
  warnText: palette.navy,
  /** Modal arka planı (lacivert tonlu) */
  overlay: 'rgba(23,27,56,0.48)',

  /* marka yüzeyleri */
  navy: palette.navy,
  navy2: palette.navy2,
  /** vurgu: indirim rozeti, kargo kapsülü, koyu zeminde eylem */
  sun: palette.sun,
  /** açık güneş tonu: "Preiswert" paneli, pastel disk */
  sunSoft: '#fff5d9',
  peach: palette.peach,
  lilac: palette.lilac,
  mist: palette.mist,
  /** koyu zemin üstünde ikincil metin */
  onDarkMuted: 'rgba(255,255,255,0.74)',
  /** koyu zemin üstünde ince çizgi / cam yüzey */
  onDarkLine: 'rgba(255,255,255,0.16)',
  /** mavi başlık üstünde basılı ikon düğmesi / eylem kapsülü zemini */
  onBrandPress: 'rgba(255,255,255,0.18)',
  onBrandSurface: 'rgba(255,255,255,0.14)',
  lineSoft: palette.lineSoft,
  /** devre dışı birincil düğme: bilerek kapalı görünür (soluk mavi değil) */
  disabledBg: palette.lineSoft,
};

/** Marka geçişi: ana sayfa başlığı ve tüm ekran başlıkları (sol üst mavi → sağ alt koyu mavi). */
export const gradients = { brand: [palette.blue, palette.blueD] as const };

/** Pastel zeminler; karo ve disklerde sırayla döner. */
export const tints: readonly string[] = [colors.lilac, colors.peach, colors.mist, colors.sunSoft];
export const tintAt = (i: number): string => tints[((i % tints.length) + tints.length) % tints.length];

/** İkon diski zeminleri (beyaz kart üstünde; sis tonu beyazda kaybolduğu için yok). İkon her zaman mavi, yıkıcıda mercan. */
export const discTints = { lilac: colors.lilac, peach: colors.peach, sun: colors.sunSoft } as const;
export type DiscTint = keyof typeof discTints;

/** s: rozet/onay kutusu · m: iç karo, giriş · l: ürün kartı, liste grubu · xl: afiş, panel · sheet: katman üst köşeleri · pill: kapsül */
export const radius = { s: 8, m: 12, l: 16, xl: 18, sheet: 20, pill: 999 } as const;
/** Boşluk adımları: 4 / 8 / 12 / 16 / 24 / 32. Yan boşluk (gutter) her zaman `space.l` = 16. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
/** Ortak ölçüler (dp): başlık satırı, en küçük dokunma alanı, liste satırı, ikon diski, gruplar arası boşluk. */
export const sizes = { headerRow: 56, touch: 44, row: 56, disc: 40, groupGap: 12 } as const;

/* ───── yazı ───── */

/**
 * Android'de özel yazı tipleri fontWeight'i yok sayar: kalınlık, aile adı seçilerek verilir.
 * Bu yüzden stil yazarken `fontWeight` değil `fontFamily: fonts.bold` kullanılır.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  /** vitrin başlıkları: Fraunces 500 */
  display: 'Fraunces_500Medium',
} as const;

/** Metin hazır ayarları. Renk gerekiyorsa çağıran üzerine yazar: [typo.h2, { color: colors.onPrimary }] */
export const typo = {
  /** afiş başlığı (Fraunces 28/32); dar sütunda `fitDisplay` ile küçülür */
  hero: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: colors.text },
  /** marka yazısı ve büyük vitrin başlığı (Fraunces 26/30) */
  display: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: colors.text },
  /** ekran başlığı ve bölüm başlığı (Fraunces 22/28) */
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: colors.text },
  /** katman, diyalog ve boş durum başlığı (Inter kalın 18) */
  h2: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: colors.text },
  /** kart/satır başlığı */
  h3: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  /** satır alt yazısı (13, soluk) */
  rowSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.text },
  /** sayı satırı, alt bilgi (12, soluk) */
  meta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: colors.muted },
  /** üst etiket: büyük harf, aralıklı */
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.primary },
  /** düğme ve kapsül yazısı */
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  /** fiyat */
  price: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 20, letterSpacing: -0.2, color: colors.text },
} as const satisfies Record<string, TextStyle>;

/* ───── vitrin başlığı sığdırma (saf işlev; test edilir) ───── */

/**
 * Fraunces 500 ilerleme genişlikleri, em'in yüzde biri cinsinden (yazı tipi dosyasından; 0,02 em'e yukarı yuvarlı).
 * Tabloda olmayan karakter en geniş harf sayılır: tahmin taşmayı kaçırmaz.
 */
const DISPLAY_EM: readonly (readonly [number, string])[] = [
  [18, "'"], [24, ' `’'], [26, '.'], [28, ',:;|'], [30, '·'], [32, '!ijl'], [36, '"()[]'], [38, 't'], [40, 'If{}'], [42, '-'],
  [46, '1'], [48, '^rs'], [50, '/J\\_z'], [52, '7<>?cç'], [54, 'e–éè'], [56, '+3=avxäà'], [58, '5gy'], [60, '$8Soö'],
  [62, '2469Fbdkpquü'], [64, '*LZhn~'], [66, '#E'], [68, '0ß'], [70, 'BCPTY€'], [72, 'V'], [74, 'ARXÄ'], [76, '%UÜ'],
  [78, 'GKN'], [80, 'DOQÖ'], [84, 'Hw'], [92, '@M'], [96, 'm'], [98, '&'], [106, 'W'],
];
const EM_OF = new Map<string, number>(DISPLAY_EM.flatMap(([w, chars]) => [...chars].map(ch => [ch, w / 100] as [string, number])));
const displayWidth = (text: string, size: number): number => [...text].reduce((sum, ch) => sum + (EM_OF.get(ch) ?? 1.06), 0) * size;

/**
 * `text`, Fraunces 500 ve `size` px ile `width` dp'lik sütunda kaç satır tutar (sözcük sınırında kaydırma, "\n" yeni satır).
 * Tek bir sözcük sütuna sığmıyorsa Infinity döner (sözcük ortasından bölünme kabul edilmez).
 */
export function displayLines(text: string, size: number, width: number): number {
  const gap = displayWidth(' ', size);
  let lines = 0;
  for (const para of text.split('\n')) {
    let used = 0;
    lines += 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = displayWidth(word, size);
      if (w > width) return Infinity;
      if (used === 0) used = w;
      else if (used + gap + w <= width) used += gap + w;
      else { lines += 1; used = w; }
    }
  }
  return lines;
}

/** Afiş başlığı boyut adımları (px); satır yüksekliği = boyut + 4. */
export const DISPLAY_STEPS: readonly number[] = [28, 26, 24, 22, 20, 18];

/** Başlığı en çok `maxLines` satıra sığdıran en büyük adım; hiçbiri sığdırmıyorsa en küçük adım (metin o zaman kısaltılır). */
export function fitDisplay(text: string, width: number, maxLines = 2): number {
  return DISPLAY_STEPS.find(size => displayLines(text, size, width) <= maxLines) ?? DISPLAY_STEPS[DISPLAY_STEPS.length - 1];
}

/** Afiş kartı ölçüleri (dp). Metin sütunu kartın en az %58'idir. */
export const heroBox = { height: 204, tile: 112, tileSmall: 88, peek: 48, maxWidth: 560, pad: 16, textGap: 12 } as const;
/** Ekran genişliğinden afiş kartı genişliği: sağdaki kartın kenarı görünür kalır. */
export const heroCardWidth = (screenW: number): number => Math.min(screenW - heroBox.peek, heroBox.maxWidth);
/** Görsel karosu: çok dar ekranda (< 350 dp) küçülür ki metin sütunu daralmasın. */
export const heroTile = (screenW: number): number => (screenW < 350 ? heroBox.tileSmall : heroBox.tile);
/** Afiş başlığının kullanabildiği genişlik: kart − görsel karosu − iç boşluklar. */
export const heroTextWidth = (screenW: number): number => heroCardWidth(screenW) - heroTile(screenW) - heroBox.pad * 2 - heroBox.textGap;

/* ───── gölge ───── */

const navyShadow = (y: number, blur: number, spread: number, alpha: number): ViewStyle => ({
  boxShadow: [{ offsetX: 0, offsetY: y, blurRadius: blur, spreadDistance: spread, color: `rgba(24,32,71,${alpha})` }],
});

/**
 * Lacivert tonlu yumuşak gölgeler. soft: kalp dairesi, beyaz panel · card: ürün/marka kartı, liste grubu kartı ·
 * raised: afiş, yüzen öğe, diyalog · header: ana sayfanın yüzen başlık bloğu (0 4 12) · bar: alt çubuk (yukarı doğru).
 * Gölge, kaydırılan listenin sınırında kesilir: listeye en az `shadowPad` kadar alt boşluk verilir.
 */
export const shadow = {
  card: navyShadow(4, 12, -4, 0.14),
  raised: navyShadow(12, 28, -12, 0.3),
  soft: navyShadow(2, 6, -2, 0.1),
  header: navyShadow(4, 12, 0, 0.16),
  bar: navyShadow(-4, 16, -8, 0.14),
} as const;
/** Gölgenin öğenin altına taşan payı (offsetY + blur + spread): card → 12, raised → 28. */
export const shadowPad = { card: 12, raised: 28 } as const;

/* ───── biçimlendirme ───── */

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const eur = (n: number) => eurFmt.format(n);
/** Tüm tamsayı gösterimleri bununla (de-DE binlik ayracı). */
export const num = (n: number) => n.toLocaleString('de-DE');
/** Kısa tutar: tam sayıysa kuruşsuz ("39 €"), değilse eur() ile aynı. */
export const eurShort = (n: number) => (Number.isInteger(n) ? `${num(n)} €` : eur(n));

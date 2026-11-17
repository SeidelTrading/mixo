import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Animated, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Home, Index, Product } from '../api/shop';
import { useRepresentative } from '../hooks';
import { href } from '../routes';
import { fmt, heroShopSubLabel, nProdukte, T } from '../strings';
import { colors, displayLines, eurShort, fitDisplay, fonts, gradients, heroBox, heroCardWidth, heroTextWidth, heroTile, num, radius, shadow, shadowPad, space, typo } from '../theme';
import { ProductImage, SearchBox } from './ui';

/* ───── başlık bloğu ───── */

/** Başlık bloğunun alt köşe yarıçapı (açık hâlde); liste bu kadar yukarı kaydırılır ki içerik köşelerin altından geçsin. */
export const HEADER_RADIUS = radius.xl;
/** Marka satırının yüksekliği, üst boşluk ve arama alanıyla arasındaki boşluk. */
const BRAND_ROW_H = 36;
const HEADER_TOP = 10;
const HEADER_GAP = space.m;
/** Daralmış hâlde arama alanının üstünde ve altında kalan boşluk: 8 + 48 + 10 ≈ 66 dp'lik ince blok. */
const COLLAPSED_TOP = space.s;
const HEADER_BOTTOM = 10;
/** Kaydırınca başlık bu kadar yukarı çekilir: marka satırı durum çubuğunun altına girer, arama alanı kalır. */
export const HEADER_COLLAPSE = HEADER_TOP + BRAND_ROW_H + HEADER_GAP - COLLAPSED_TOP;
/** Ölçüm gelene kadar kullanılan başlık yüksekliği (güvenli alan hariç): üst boşluk + marka satırı + boşluk + arama + alt boşluk. */
export const HEADER_BASE_H = HEADER_TOP + BRAND_ROW_H + HEADER_GAP + 48 + HEADER_BOTTOM;
/** Geçişin alt kenardaki renkleri (sol alt ≈ %10, sağ alt = koyu mavi): daralınca köşeleri dolduran şerit bunları kullanır. */
const EDGE_FILL = ['#2f46c4', colors.primaryDark] as const;

/**
 * Ana sayfa başlığı: mavi geçişli blok, marka yazısı, kargo eşiği kapsülü ve arama alanı.
 * Listenin üstünde yüzer; sayfa kaydırıldıkça marka satırı solar ve blok yukarı çekilir, arama alanı hep görünür kalır.
 * Açıkken alt köşeler 18 dp yuvarlak; daralınca köşeler dolar ve blok, diğer ekranların başlığı gibi düz kenarlı ince bir
 * şerit olur (lacivert gölge iki hâlde de var): içerik köşelerden sızmaz, sert bir dudak oluşmaz.
 * `freeShip` yalnız sunucudan gelen gerçek eşikse verilir; yoksa kapsül çizilmez.
 */
export function HomeHeader({ onSearch, freeShip, scrollY, onHeight }: {
  onSearch: () => void; freeShip: number | null; scrollY: Animated.Value; onHeight?: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Dar ekranda marka yazısı bir adım küçülür: kargo kapsülü yanında kesilmeden durur
  const narrow = width < 380;
  const shift = scrollY.interpolate({ inputRange: [0, HEADER_COLLAPSE], outputRange: [0, -HEADER_COLLAPSE], extrapolate: 'clamp' });
  const fade = scrollY.interpolate({ inputRange: [0, HEADER_COLLAPSE * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const square = scrollY.interpolate({ inputRange: [HEADER_COLLAPSE * 0.5, HEADER_COLLAPSE], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Animated.View
      style={[h.wrap, { transform: [{ translateY: shift }] }]}
      onLayout={onHeight ? e => onHeight(Math.round(e.nativeEvent.layout.height)) : undefined}
    >
      {/* Köşe dolgusu: bloğun arkasında, yalnız yuvarlak köşelerin dışında görünür; daraldıkça belirir */}
      <Animated.View pointerEvents="none" style={[h.edge, { opacity: square }]}>
        <LinearGradient colors={EDGE_FILL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[h.block, { paddingTop: insets.top + HEADER_TOP }]}
      >
        {/* derinlik için yarı saydam halkalar (yalnız süs) */}
        <View pointerEvents="none" style={[h.ring, { width: 220, height: 220, borderRadius: 110, right: -70, top: -90 }]} />
        <View pointerEvents="none" style={[h.ring, { width: 120, height: 120, borderRadius: 60, left: -40, bottom: -70 }]} />
        <Animated.View style={[h.top, { opacity: fade }]}>
          {/* Marka yazısı logo gibi davranır: sistem yazı boyutuyla büyümez (satır yüksekliği sabit) */}
          <Text style={[h.wordmark, narrow && h.wordmarkNarrow]} accessibilityRole="header" accessibilityLabel={T.appName} numberOfLines={1} allowFontScaling={false}>
            {T.appName}
            <Text style={{ color: colors.sun }}>.</Text>
          </Text>
          {freeShip != null ? (
            <View style={h.pill}>
              <Ionicons name="cube" size={13} color={colors.navy} />
              <Text style={h.pillText} numberOfLines={1} maxFontSizeMultiplier={1.2} adjustsFontSizeToFit minimumFontScale={0.85}>{fmt(T.freeShipFrom, { x: eurShort(freeShip) })}</Text>
            </View>
          ) : null}
        </Animated.View>
        <View style={{ flexDirection: 'row' }}>
          <SearchBox hero onPress={onSearch} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const h = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    borderBottomLeftRadius: HEADER_RADIUS, borderBottomRightRadius: HEADER_RADIUS, ...shadow.header,
  },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HEADER_RADIUS + 2 },
  block: {
    paddingHorizontal: space.l, paddingBottom: HEADER_BOTTOM, gap: HEADER_GAP, overflow: 'hidden',
    borderBottomLeftRadius: HEADER_RADIUS, borderBottomRightRadius: HEADER_RADIUS,
  },
  ring: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m, height: BRAND_ROW_H },
  wordmark: { fontFamily: fonts.display, fontSize: 26, lineHeight: 34, letterSpacing: -0.6, color: colors.onPrimary, flexShrink: 0 },
  wordmarkNarrow: { fontSize: 23, letterSpacing: -0.5 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, flexShrink: 1,
    borderRadius: radius.pill, backgroundColor: colors.sun,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.navy, flexShrink: 1 },
});

/* ───── afiş şeridi ───── */

type Look = 'blue' | 'coral' | 'navy' | 'sun' | 'note';
type LookSpec = {
  bg: readonly [string, string];
  fg: string; sub: string; eyebrow: string;
  ctaBg: string; ctaFg: string; ring: string;
};
/** Afiş görünümleri: yalnız marka renkleri (mavi→lacivert, mercan, lacivert, güneş). */
const LOOKS: Record<Look, LookSpec> = {
  blue: { bg: [colors.primary, colors.navy], fg: colors.onPrimary, sub: colors.onDarkMuted, eyebrow: colors.sun, ctaBg: colors.sun, ctaFg: colors.navy, ring: 'rgba(255,255,255,0.08)' },
  coral: { bg: ['#d24a3a', '#a93022'], fg: colors.onPrimary, sub: 'rgba(255,255,255,0.82)', eyebrow: colors.peach, ctaBg: colors.card, ctaFg: colors.navy, ring: 'rgba(255,255,255,0.1)' },
  navy: { bg: ['#28336f', colors.navy2], fg: colors.onPrimary, sub: colors.onDarkMuted, eyebrow: colors.sun, ctaBg: colors.sun, ctaFg: colors.navy, ring: 'rgba(255,255,255,0.07)' },
  sun: { bg: [colors.sun, '#ffc24b'], fg: colors.navy, sub: 'rgba(24,32,71,0.74)', eyebrow: 'rgba(24,32,71,0.74)', ctaBg: colors.navy, ctaFg: colors.onPrimary, ring: 'rgba(255,255,255,0.28)' },
  note: { bg: [colors.lilac, colors.lilac], fg: colors.navy, sub: colors.muted, eyebrow: colors.primary, ctaBg: colors.primary, ctaFg: colors.onPrimary, ring: 'rgba(48,72,200,0.06)' },
};
const CAT_LOOKS: readonly Look[] = ['coral', 'navy', 'sun'];

type Slide = {
  id: string; look: Look; eyebrow: string; title: string; sub?: string; cta?: string; go?: () => void;
  /** ikinci, sakin satır: " · " ile birleşen parçalar (marka sayısı, en büyük alt kategoriler; dizinden). Sığdığı kadarı yazılır. */
  more?: string[];
  /** vitrin yanıtından gelen gerçek ürün görseli */
  img?: string;
  /** görsel yoksa bu kapsamın temsilci ürünü denenir (kategori daireleriyle aynı 0. parça, ek istek yok) */
  scope?: string;
};

/** Küçük afiş metinleri sistem yazı boyutuyla en çok bu kadar büyür (kart yüksekliği sabit). */
const HERO_FONT_MAX = 1.1;
/** Sakin satırda (Inter 11) karakter başına ayrılan genişlik: parçalar yarım kalmasın diye bilerek bol. */
const CAPTION_CH = 6.4;

/** Parçaları " · " ile, `maxChars` aşılmadan birleştirir (ilk parça her zaman yazılır): satır yarım sözcükle bitmez. */
function joinFitting(parts: string[], maxChars: number): string {
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} · ${part}` : part;
    if (out && next.length > maxChars) break;
    out = next;
  }
  return out;
}

function HeroSlide({ slide, width, textW, tile, visible }: { slide: Slide; width: number; textW: number; tile: number; visible: boolean }) {
  const look = LOOKS[slide.look];
  const rep = useRepresentative(slide.scope ?? '', visible && !slide.img && !!slide.scope);
  const img = slide.img ?? rep?.img;
  const pending = !img && !!slide.scope && rep === undefined;
  const note = slide.look === 'note';
  // Başlık en çok iki satır tutacak en büyük boyutta yazılır; üç nokta ile kesilmez (theme.fitDisplay)
  const size = fitDisplay(slide.title, textW);
  // Başlığın gerçekte kaç satır tuttuğu çizimden öğrenilir (tahmin bilerek temkinlidir); sakin satır kalan yere göre 1 ya da 2 satır
  const [drawn, setDrawn] = useState<{ title: string; lines: number } | null>(null);
  const titleLines = drawn?.title === slide.title ? drawn.lines : Math.min(2, displayLines(slide.title, size, textW));
  const moreLines = titleLines <= 1 ? 2 : 1;
  const more = slide.more ? joinFitting(slide.more, Math.floor((textW * moreLines * (moreLines > 1 ? 0.88 : 1)) / CAPTION_CH)) : '';
  const body = (
    <LinearGradient colors={look.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[b.card, { width }]}>
      <View pointerEvents="none" style={[b.ring, { backgroundColor: look.ring, width: 230, height: 230, borderRadius: 115, right: -70, top: -50 }]} />
      <View pointerEvents="none" style={[b.ring, { backgroundColor: look.ring, width: 110, height: 110, borderRadius: 55, left: -36, bottom: -52 }]} />
      <View style={b.textCol}>
        <Text style={[typo.eyebrow, { color: look.eyebrow }]} numberOfLines={1} maxFontSizeMultiplier={HERO_FONT_MAX}>{slide.eyebrow}</Text>
        {note ? (
          <Text style={[b.noteTitle, { color: look.fg }]} numberOfLines={5} maxFontSizeMultiplier={HERO_FONT_MAX}>{slide.title}</Text>
        ) : (
          // Boyut hesapla seçildiği için sistem yazı ölçeği uygulanmaz (marka yazısı gibi)
          <Text
            style={[typo.hero, { color: look.fg, marginTop: 6, fontSize: size, lineHeight: size + 4, letterSpacing: -0.02 * size }]}
            numberOfLines={2}
            allowFontScaling={false}
            onTextLayout={e => {
              const lines = e.nativeEvent.lines.length;
              if (drawn?.title !== slide.title || drawn.lines !== lines) setDrawn({ title: slide.title, lines });
            }}
          >
            {slide.title}
          </Text>
        )}
        {slide.sub ? <Text style={[typo.smallStrong, { color: look.fg, marginTop: 6 }]} numberOfLines={1} maxFontSizeMultiplier={HERO_FONT_MAX}>{slide.sub}</Text> : null}
        {more ? (
          <Text style={[typo.caption, { color: look.sub, marginTop: 2 }]} numberOfLines={moreLines} maxFontSizeMultiplier={HERO_FONT_MAX}>{more}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {slide.cta ? (
          <View style={[b.cta, { backgroundColor: look.ctaBg }]}>
            <Text
              style={{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: look.ctaFg, flexShrink: 1 }}
              numberOfLines={1}
              maxFontSizeMultiplier={HERO_FONT_MAX}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {slide.cta}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={look.ctaFg} />
          </View>
        ) : null}
      </View>
      {note ? (
        <View style={b.noteIcon}>
          <Ionicons name="megaphone-outline" size={30} color={colors.primary} />
        </View>
      ) : img ? (
        <View style={[b.tile, { width: tile, height: tile }]}>
          <ProductImage img={img} size={360} style={{ width: '100%', height: '100%' }} />
        </View>
      ) : pending ? (
        // Görsel yolda: metin sütunu daralıp genişlemesin diye karo yeri boş tutulur
        <View style={[b.tileGap, { width: tile }]} />
      ) : null}
    </LinearGradient>
  );
  const a11y = [slide.title, slide.sub, more].filter(Boolean).join(', ');
  // Duyuru afişi dokunulmaz
  if (!slide.go) return <View accessible accessibilityLabel={a11y}>{body}</View>;
  return (
    <Pressable onPress={slide.go} accessibilityRole="button" accessibilityLabel={a11y}>
      {body}
    </Pressable>
  );
}

/** Vitrin yanıtındaki ürünlerden afiş görselleri: kategori başına ilk uygun ürün; kargo afişi başka bir ürün alır. */
function pickImages(home: Home | undefined, catKeys: string[]): { ship?: string; byCat: Record<string, string> } {
  const pool: Product[] = home ? [...home.premium, ...home.best, ...home.deals, ...home.budget].filter(p => !p.na && !!p.img) : [];
  const byCat: Record<string, string> = {};
  const used = new Set<string>();
  for (const k of catKeys) {
    const p = pool.find(x => x.cat === k);
    if (p) { byCat[k] = p.img; used.add(p.id); }
  }
  return { ship: pool.find(p => !used.has(p.id))?.img, byCat };
}

/**
 * Ana sayfa afişleri: yalnız gerçek veriden (duyuru, dizindeki kategori, ürün ve marka sayıları,
 * vitrin yanıtındaki ürün görselleri); uydurma kampanya yok.
 */
export function Banners({ index, home, announcement, visible }: {
  index: Index; home: Home | undefined; announcement: string; visible: boolean;
}) {
  const { width } = useWindowDimensions();
  // Sağdaki kartın kenarı görünsün diye genişlik ekrandan dar tutulur
  const w = heroCardWidth(width);
  const textW = heroTextWidth(width);
  const tile = heroTile(width);
  const step = w + space.m;
  const [page, setPage] = useState(0);

  const slides = useMemo<Slide[]>(() => {
    // En büyük üç kategori (ürün sayısına göre)
    const top = [...index.cats].filter(c => c.n > 0).sort((a, c) => c.n - a.n).slice(0, CAT_LOOKS.length);
    const imgs = pickImages(home, top.map(c => c.k));
    const total = index.total;
    const nCats = index.cats.length;
    // İlk afiş: katalog genişliği (toplam ürün ve kategori sayısı dizinden). Kargo eşiği başlıktaki kapsülde zaten yazılı:
    // burada tekrarlanmaz; yerine (yalnız dizin sayıları kesinken) toplam marka sayısı
    const nbAll = index.facetsExact ? index.facets.all?.nb ?? 0 : 0;
    const out: Slide[] = [{
      id: 'ship', look: 'blue', eyebrow: T.heroEyebrowShop, title: nProdukte(total),
      sub: heroShopSubLabel(nCats),
      more: nbAll > 1 ? [fmt(T.heroCatBrands, { nb: num(nbAll) })] : undefined,
      cta: T.heroCtaCategories, img: imgs.ship,
      go: () => router.push(href.kategorien()),
    }];
    const ann = announcement.trim();
    if (ann) out.push({ id: 'ann', look: 'note', eyebrow: T.heroEyebrowNote, title: ann });
    top.forEach((c, i) => {
      const nb = index.facets[c.k]?.nb ?? 0;
      // En büyük üç alt kategori adı (ürün sayısına göre); marka sayısı yalnız kesin olduğunda başa yazılır
      const names = [...c.subs].filter(x => x.n > 0).sort((a, x) => x.n - a.n).slice(0, 3).map(x => x.name);
      if (index.facetsExact && nb > 1) names.unshift(fmt(T.heroCatBrands, { nb: num(nb) }));
      out.push({
        id: c.k, look: CAT_LOOKS[i], eyebrow: T.heroEyebrowCategory, title: c.label,
        sub: nProdukte(c.n),
        more: names.length > 0 ? names : undefined,
        cta: T.heroCtaCategory, img: imgs.byCat[c.k], scope: c.k,
        go: () => router.push(href.kategorie(c.k)),
      });
    });
    return out;
  }, [index, home, announcement]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
    if (i !== page) setPage(i);
  };

  return (
    <View style={{ marginTop: space.xl }}>
      <FlatList
        horizontal
        data={slides}
        keyExtractor={x => x.id}
        // Yatay şeritlerde görünmeyen alt görünümlerin sökülmesi kapalı (bkz. ProductRail)
        removeClippedSubviews={false}
        snapToInterval={step}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        // Alt boşluk: kart gölgesi liste sınırında kesilmesin (noktalar bu boşluğun içine çekilir)
        contentContainerStyle={{ paddingHorizontal: space.l, gap: space.m, paddingBottom: shadowPad.raised }}
        renderItem={({ item }) => <HeroSlide slide={item} width={w} textW={textW} tile={tile} visible={visible} />}
      />
      {slides.length > 1 ? (
        <View style={b.dots} accessible accessibilityLabel={fmt(T.slideOf, { i: page + 1, n: slides.length })}>
          {slides.map((x, i) => (
            <View key={x.id} style={[b.dot, i === page && b.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const b = StyleSheet.create({
  card: { minHeight: heroBox.height, borderRadius: radius.xl, overflow: 'hidden', flexDirection: 'row', ...shadow.raised },
  ring: { position: 'absolute' },
  textCol: { flex: 1, paddingVertical: heroBox.pad, paddingLeft: heroBox.pad, paddingRight: heroBox.textGap },
  noteTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, marginTop: 6 },
  cta: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: space.l, borderRadius: radius.pill },
  tile: {
    alignSelf: 'center', marginRight: heroBox.pad, padding: space.s,
    borderRadius: radius.l, backgroundColor: colors.card, transform: [{ rotate: '6deg' }], ...shadow.raised,
  },
  tileGap: { marginRight: heroBox.pad },
  noteIcon: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center', marginRight: space.xl,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  // Noktalar, gölge için bırakılan alt boşluğun içine çekilir: kartın 12 dp altında dururlar ve bölüm orada biter
  dots: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space.s, height: 8, marginTop: space.m - shadowPad.raised },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 20, backgroundColor: colors.primary },
});

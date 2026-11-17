import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { biggestSubs, scopeKey, topBrandPairs, type BrandPair, type Category, type Index, type SubRef } from '../api/shop';
import { categoryIcon } from '../categoryIcons';
import { GRID_WIDE_MIN } from '../config';
import { useRepresentative } from '../hooks';
import { href } from '../routes';
import { nProdukte, softBreak, T } from '../strings';
import { colors, fonts, radius, shadow, shadowPad, space, typo } from '../theme';
import { EdgeFade, ProductImage, SectionHeader } from './ui';

/* ───── kategori kısayolları: pastel disk üstünde temsilci ürün görseli ───── */

const DISC = 64;
const DISC_W = 76;
/** Disk zeminleri: diskler hep beyaz yüzeyde durur, sis tonu orada kaybolduğu için yok. */
const DISC_TINTS = [colors.lilac, colors.peach, colors.sunSoft] as const;
const discTint = (i: number) => DISC_TINTS[((i % DISC_TINTS.length) + DISC_TINTS.length) % DISC_TINTS.length];

/**
 * Kategori diski: pastel daire üstünde kapsamın temsilci ürün görseli (%70, contain; 0. parça; `visible` olana kadar istek yok).
 * Ana sayfa kısayollarında ve kategori listesi satırlarında (`ListRow leading`) aynı öğe kullanılır.
 */
export function CategoryDisc({ scope, i, size = DISC, visible = true }: { scope: string; i: number; size?: number; visible?: boolean }) {
  const rep = useRepresentative(scope, visible);
  const pad = Math.round(size * 0.15);
  return (
    <View style={[c.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: discTint(i) }]}>
      {rep ? <ProductImage img={rep.img} size={160} blend style={{ width: size - pad * 2, height: size - pad * 2 }} /> : null}
    </View>
  );
}

function CategoryCircle({ cat, i, visible }: { cat: Category; i: number; visible: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cat.label}, ${nProdukte(cat.n)}`}
      onPress={() => router.push(href.kategorie(cat.k))}
      style={c.item}
    >
      <CategoryDisc scope={cat.k} i={i} visible={visible} />
      <Text style={c.label} numberOfLines={2} maxFontSizeMultiplier={1.15} android_hyphenationFrequency="normal">{softBreak(cat.label)}</Text>
    </Pressable>
  );
}

/** Tek satır yatay kategori daireleri; ilk daire tüm kategorilere götürür. */
export function CategoryCircles({ index, visible }: { index: Index; visible: boolean }) {
  if (index.cats.length === 0) return null;
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={index.cats}
      keyExtractor={x => x.k}
      // Yatay şeritlerde görünmeyen alt görünümlerin sökülmesi kapalı (bkz. ProductRail)
      removeClippedSubviews={false}
      contentContainerStyle={{ paddingHorizontal: space.m, gap: space.xs }}
      ListHeaderComponent={
        <Pressable accessibilityRole="button" accessibilityLabel={T.allCategories} onPress={() => router.push(href.kategorien())} style={c.item}>
          <View style={[c.disc, c.discSize, c.allDisc]}>
            <Ionicons name="grid" size={24} color={colors.primary} />
          </View>
          <Text style={c.label} numberOfLines={2} maxFontSizeMultiplier={1.15}>{T.allCategories}</Text>
        </Pressable>
      }
      ListHeaderComponentStyle={{ marginRight: space.xs }}
      renderItem={({ item, index: i }) => <CategoryCircle cat={item} i={i} visible={visible} />}
    />
  );
}

/**
 * Kategori listesinin başında alt kategori daireleri: ana sayfa kısayollarıyla aynı öğe (64 dp disk, 12/15 iki satır etiket),
 * her biri alt kategori listesine götürür; sağ kenarda sayfa zemini renginde solma (devamı var).
 */
export function SubCircles({ cat, ci }: { cat: Category; ci: number }) {
  const items = useMemo(() => cat.subs.map((sub, i) => ({ ...sub, i })), [cat]);
  if (items.length === 0) return null;
  return (
    <View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={x => x.name}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingHorizontal: space.m, gap: space.xs, paddingBottom: space.s }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${nProdukte(item.n)}`}
            onPress={() => router.push(href.kategorie(cat.k, { sub: item.i }))}
            style={({ pressed }) => [c.item, c.itemWide, pressed && { opacity: 0.7 }]}
          >
            <CategoryDisc scope={scopeKey(cat.k, item.i)} i={ci + item.i} />
            <Text style={c.label} numberOfLines={2} maxFontSizeMultiplier={1.15} android_hyphenationFrequency="normal">{softBreak(item.name)}</Text>
          </Pressable>
        )}
      />
      <EdgeFade />
    </View>
  );
}

const c = StyleSheet.create({
  item: { width: DISC_W, alignItems: 'center', gap: 6 },
  // alt kategori adları daha uzun ("Bildschirmzubehör"): öğe biraz geniş
  itemWide: { width: 88 },
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  discSize: { width: DISC, height: DISC, borderRadius: DISC / 2 },
  // "Alle": diğerleri gibi pastel disk, mavi ikon ve ince mavi halka (dolu mavi disk satırı ezmesin)
  allDisc: { backgroundColor: colors.lilac, borderWidth: 1.5, borderColor: colors.primary },
  // Etiket kutusu sabit iki satır yüksekliğinde ve üstten hizalı: tek ve iki satırlı adlar aynı çizgiden başlar
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 15, height: 30, color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
});

/* ───── Top-Marken: marka kartları ───── */

function BrandCard({ p, i, exact }: { p: BrandPair; i: number; exact: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={exact ? `${p.rowLabel}, ${nProdukte(p.n)}` : p.rowLabel}
      onPress={() => router.push(href.kategorie(p.key, { marke: p.marke }))}
      style={({ pressed }) => [m.card, pressed && { backgroundColor: colors.mist }]}
    >
      <View style={m.top}>
        {/* Küçük kategori diski: markanın bu kartta süzüldüğü kategori (uydurma logo ya da baş harf yok) */}
        <View style={[m.disc, { backgroundColor: BRAND_TINTS[i % BRAND_TINTS.length] }]}>
          <Ionicons name={categoryIcon(p.key)} size={16} color={colors.primary} />
        </View>
        <View style={m.go}>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </View>
      </View>
      <Text style={m.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{p.marke}</Text>
      {/* Sayı o kategorideki kesin marka sayısıdır; açılan listedeki "von {n}" ile aynıdır, bu yüzden kategori adıyla birlikte yazılır */}
      {exact ? <Text style={m.count} numberOfLines={1}>{nProdukte(p.n)}</Text> : null}
      <Text style={typo.caption} numberOfLines={1}>{p.catLabel}</Text>
    </Pressable>
  );
}

/** Marka kartı genişliği: sabit; üçüncü kart bilinçli bir "devamı var" payıyla (~%40–50) görünür. */
const BRAND_W = 148;

/**
 * Marka kartları: küçük kategori diski, Fraunces marka adı, o kategorideki ürün sayısı (yalnız dizin sayıları kesinken)
 * ve kategori adı. Kartın tamamı dokunma alanıdır; dokununca marka süzgeçli kategori listesi açılır.
 */
export function BrandRail({ index }: { index: Index }) {
  const pairs = useMemo(() => topBrandPairs(index, 16), [index]);
  if (pairs.length === 0) return null;
  return (
    <View>
      <SectionHeader title={T.topBrands} />
      <View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={pairs}
          keyExtractor={p => `${p.key}|${p.marke}`}
          removeClippedSubviews={false}
          // Alt boşluk kart gölgesi içindir; eksi kenar boşluğuyla geri alınır (bölümler arası 24 dp korunur)
          style={{ marginBottom: -shadowPad.card }}
          contentContainerStyle={{ paddingHorizontal: space.l, gap: space.m, paddingTop: 2, paddingBottom: shadowPad.card }}
          renderItem={({ item, index: i }) => <BrandCard p={item} i={i} exact={index.facetsExact} />}
        />
        <EdgeFade />
      </View>
    </View>
  );
}

/** Beyaz kart üstünde disk zeminleri (sis tonu beyazda kaybolduğu için yok). */
const BRAND_TINTS = [colors.lilac, colors.peach, colors.sunSoft] as const;

const m = StyleSheet.create({
  card: { width: BRAND_W, padding: space.m, borderRadius: radius.l, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, ...shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s },
  disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  go: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mist },
  name: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.2, color: colors.text },
  count: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.text, marginTop: 2 },
});

/* ───── Größte Unterkategorien: pastel görsel karolar ───── */

/** Sayfa zemini sisli olduğu için burada sis tonu kullanılmaz. */
const TILE_TINTS = [colors.lilac, colors.peach, colors.sunSoft] as const;

function SubTile({ sub, width, tint, visible }: { sub: SubRef; width: number; tint: string; visible: boolean }) {
  const rep = useRepresentative(scopeKey(sub.key, sub.sub), visible);
  const oneWord = !/[\s-]/.test(sub.name.trim());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sub.name}, ${sub.catLabel}, ${nProdukte(sub.n)}`}
      onPress={() => router.push(href.kategorie(sub.key, { sub: sub.sub }))}
      style={({ pressed }) => [t.tile, { width, backgroundColor: tint }, pressed && { opacity: 0.8 }]}
    >
      <View style={t.media}>
        {rep ? <ProductImage img={rep.img} size={240} blend style={{ width: '100%', height: '100%' }} /> : null}
      </View>
      {/* Tek sözcüklü ad satır ortasından bölünmez: tek satırda kalır, gerekirse küçülür. Çok sözcüklü ad iki satıra yayılır */}
      <View style={t.nameBox}>
        <Text style={t.name} numberOfLines={oneWord ? 1 : 2} adjustsFontSizeToFit={oneWord} minimumFontScale={0.8}>{sub.name}</Text>
      </View>
      <Text style={typo.caption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{nProdukte(sub.n)}</Text>
    </Pressable>
  );
}

/** 3 sütunlu (geniş ekranda 6) karo ızgarası; görseller bölüm ekrana girince yüklenir. */
export function SubcategoryShowcase({ index, visible }: { index: Index; visible: boolean }) {
  const { width } = useWindowDimensions();
  const subs = useMemo(() => biggestSubs(index, 6), [index]);
  if (subs.length === 0) return null;
  const cols = width < GRID_WIDE_MIN ? 3 : 6;
  const gap = space.m;
  const tileW = Math.floor((width - space.l * 2 - gap * (cols - 1)) / cols);
  return (
    <View>
      <SectionHeader title={T.largestSubs} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: space.l }}>
        {subs.map((x, i) => (
          // Satır başına bir kaydırılan renk sırası: aynı renk alt alta gelmez
          <SubTile key={`${x.key}/${x.sub}`} sub={x} width={tileW} tint={TILE_TINTS[(i + Math.floor(i / cols)) % TILE_TINTS.length]} visible={visible} />
        ))}
      </View>
    </View>
  );
}

const t = StyleSheet.create({
  tile: { borderRadius: radius.l, padding: 10, gap: 2 },
  media: { width: '100%', aspectRatio: 1.15, marginBottom: 6 },
  nameBox: { minHeight: 32 },
  name: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 16, color: colors.text },
});

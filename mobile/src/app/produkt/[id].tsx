import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chunkCount, getProduct, getProductCached, imageUrl, loadChunk, productSnapshot, scopeKey, subIndexOf } from '../../api/shop';
import type { Product } from '../../api/shop';
import type { IconName } from '../../categoryIcons';
import {
  BottomBar, BottomSheet, Btn, CardGroup, EmptyState, ErrorBox, HeaderTitleFade, IconButton, IconDisc, Loading, Price, ProductImage,
  ProductRail, ScreenHeader, addResultText, useToast,
} from '../../components/ui';
import { useListPicker } from '../../components/ListPicker';
import { SHIP_FEE } from '../../config';
import { useAsync, useFreeShip, useIndex } from '../../hooks';
import { href } from '../../routes';
import { useShop, type Snap } from '../../store/shopStore';
import { T, cardTitle, fmt } from '../../strings';
import { colors, eurShort, fonts, radius, shadow, sizes, space, typo } from '../../theme';

/** Sayfanın çizdiği ürün; fresh = fiyat/durum sunucudan doğrulandı, gone = sunucu 404 verdi (anlık görüntüden çizilir). */
type PageProduct = { p: Snap; fresh: boolean; gone: boolean };

/** Rafa aynı ürün iki kez girmesin (parça satırları arasında yinelenen id olabilir). */
function uniq(list: Product[]): Product[] {
  const seen = new Set<string>();
  return list.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/**
 * Marka rafı alt kategorinin ilk parçasında 3 üründen azsa: kategorinin parçaları dörderli gruplarla taranır, aynı markanın
 * satıştaki ürünlerinden 6 bulununca ya da en çok 8 parçadan sonra durur (markalar parçalarda kümelenir).
 */
async function brandFromCategory(cat: string, vendor: string, exclude: string): Promise<Product[]> {
  const total = Math.min(8, await chunkCount(cat));
  let found: Product[] = [];
  for (let i = 0; i < total && found.length < 6; i += 4) {
    const ids = Array.from({ length: Math.min(4, total - i) }, (_, k) => i + k);
    const lists = await Promise.all(ids.map(k => loadChunk(cat, k).catch(() => [] as Product[])));
    found = uniq([...found, ...lists.flat().filter(x => x.vendor === vendor && x.id !== exclude && !x.na)]);
  }
  return found;
}

/** Raf yalnız en az bu kadar ürünle çizilir (tek kartlık yarı boş panel olmasın). */
const RAIL_MIN = 3;

export default function ProduktScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id);
  const insets = useSafeAreaInsets();
  const { addToCart, isFav, toggleFav, addRecent, recent, cart } = useShop();
  const picker = useListPicker();
  const fs = useFreeShip();
  const toast = useToast();
  const { data: idx } = useIndex();
  const [imgOpen, setImgOpen] = useState(false);
  const [sheet, setSheet] = useState(false);

  // Canlı okuma. Kayıt efektte değil söz zincirinde yapılır; 404 (null) için addRecent çağrılmaz.
  const { data: live, error, retry } = useAsync(
    () => getProduct(id).then(prod => { if (prod) addRecent(prod); return prod; }),
    id,
  );
  // Bellek içi anlık görüntü (kartlar ve katalog parçaları doldurur) ya da kayıtlı "Zuletzt angesehen" kaydı: anında ilk veri
  const snapshot: Snap | undefined = productSnapshot(id) ?? recent.find(r => r.id === id);

  const view: PageProduct | null | undefined = live
    ? { p: live, fresh: true, gone: false }
    : live === null
      ? (snapshot ? { p: { ...snapshot, na: true }, fresh: true, gone: true } : null)
      : snapshot ? { p: snapshot, fresh: false, gone: false } : undefined;
  const p = view?.p;

  // Alt kategori sırası: si bilinmiyorsa ada göre dizinden bulunur.
  const si = useMemo(() => {
    if (!p) return -1;
    if (p.si >= 0) return p.si;
    return idx ? subIndexOf(idx, p.cat, p.sub) : -1;
  }, [p, idx]);
  const scope = p && si >= 0 ? scopeKey(p.cat, si) : '';
  const { data: chunk } = useAsync<Product[]>(() => (scope ? loadChunk(scope, 0) : Promise.resolve([])), scope || 'none');

  // Raflar: güncel ürün hariç, satışta olanlar, yinelenensiz; marka rafındakiler alt kategori rafında tekrarlanmaz
  const sameSub = useMemo(() => (p && chunk ? uniq(chunk.filter(x => x.id !== p.id && !x.na)) : []), [p, chunk]);
  const sameBrand = useMemo(() => (p ? sameSub.filter(x => x.vendor === p.vendor) : []), [p, sameSub]);
  const otherSub = useMemo(() => (sameBrand.length ? sameSub.filter(x => x.vendor !== p?.vendor) : sameSub), [p, sameSub, sameBrand]);
  const recentOthers = useMemo(() => (p ? recent.filter(x => x.id !== p.id) : []), [p, recent]);
  // Marka rafı 3 üründen azsa kategoriden doldurulur; yine azsa hiç çizilmez
  const needBrandFill = !!p && !!chunk && sameBrand.length < RAIL_MIN;
  const { data: brandMore } = useAsync<Product[]>(
    () => (needBrandFill && p ? brandFromCategory(p.cat, p.vendor, p.id) : Promise.resolve([])),
    needBrandFill && p ? `${p.cat}|${p.vendor}|${p.id}` : 'none',
  );
  const brandRail = useMemo(() => {
    const list = sameBrand.length >= RAIL_MIN ? sameBrand : uniq([...sameBrand, ...(brandMore ?? [])]);
    return list.length >= RAIL_MIN ? list : [];
  }, [sameBrand, brandMore]);

  // Kaydırma: büyük başlık çıkınca başlıkta kısa ad, fiyat kartı çıkınca alt çubukta fiyat (ilk görünümde fiyat iki kez yazılmaz)
  const stageH = useRef(0);
  const wrapY = useRef(0);
  const priceBottom = useRef(0);
  const [scrolled, setScrolled] = useState({ title: false, price: false });
  const onScroll = (y: number) => {
    const title = stageH.current > 0 && y > stageH.current - 48;
    const price = priceBottom.current > 0 && y > wrapY.current + priceBottom.current - 8;
    if (title !== scrolled.title || price !== scrolled.price) setScrolled({ title, price });
  };

  const header = (
    <Stack.Screen
      options={{
        title: '',
        // Başlık boş başlar (marka zaten sayfada üç kez yazmasın); büyük başlık kayınca kısa ad solarak gelir
        headerTitle: scrolled.title && p ? () => <HeaderTitleFade text={cardTitle(p.vendor, p.title)} /> : '',
        headerRight: () => <IconButton icon="search" label={T.a11ySearchOpen} onPress={() => router.push(href.suche())} />,
      }}
    />
  );

  if (!view && error) return <>{header}<ErrorBox text={T.loadError} onRetry={retry} /></>;
  if (view === undefined) return <>{header}<Loading /></>;
  if (view === null || !p) {
    return (
      <>
        {header}
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
          <EmptyState
            icon="alert-circle-outline"
            tint="peach"
            title={T.productNotFoundTitle}
            text={T.productNotFoundText}
            action={{ label: T.backToShop, onPress: () => (router.canGoBack() ? router.back() : router.navigate(href.start())) }}
          />
        </View>
      </>
    );
  }

  const fav = isFav(p.id);
  const catLabel = idx?.cats.find(c => c.k === p.cat)?.label ?? p.cat;
  const subLabel = fmt(T.moreFromSub, { sub: p.sub });
  const hasWas = view.fresh && !p.na && p.was > p.price;
  const pct = hasWas ? Math.floor(((p.was - p.price) / p.was) * 100 + 1e-9) : 0;
  const inCartQty = cart.find(l => l.p.id === p.id)?.qty ?? 0;
  const stale = !view.fresh && !!error;

  const goCart = () => {
    setSheet(false);
    router.navigate(href.warenkorb());
  };
  const addNow = (q: Snap) => {
    const r = addToCart(q);
    if (r === 'added' || r === 'incremented') setSheet(true);
    else toast.show({ text: addResultText(r), tone: 'info' });
  };
  // Doğrulanmamış anlık görüntüyle eklenmez: önce güncel ürün alınır (404 → eklenemez)
  const onAdd = () => {
    if (view.fresh) { addNow(p); return; }
    getProductCached(id).then(
      f => (f ? addNow(f) : toast.show({ text: T.notAvailable, tone: 'info' })),
      () => toast.show({ text: T.loadError, tone: 'info' }),
    );
  };

  // Kargo: eşik sunucudan geldiyse ve fiyat eşiğin üstündeyse yalnız "Kostenloser Versand"; eşik bilinmiyorsa "Annahme" etiketi
  const freeHere = fs.fromServer && p.price >= fs.freeShip;
  const shipLabel = freeHere ? T.freeShipping : T.shipping;
  const shipValue = freeHere
    ? undefined
    : fs.fromServer
      ? fmt(T.shippingRule, { fee: eurShort(SHIP_FEE), x: eurShort(fs.freeShip) })
      : fs.loading ? '…' : fmt(T.freeShipFallback, { x: eurShort(fs.freeShip) });

  const infoRow = (icon: IconName, tint: 'lilac' | 'sun' | 'peach', label: string, value?: string) => (
    <View style={s.infoRow} accessible accessibilityLabel={value ? `${label}: ${value}` : label}>
      <IconDisc icon={icon} tint={tint} />
      <View style={{ flex: 1 }}>
        <Text style={typo.h3}>{label}</Text>
        {value ? <Text style={typo.rowSub}>{value}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: space.xl }}
        onScroll={e => onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
      >
        {/* Sahne: beyaz zemin, yuvarlak alt köşe; üstte kategori izi, ortada sis karoda görsel, altta marka + başlık */}
        <View style={s.stage} onLayout={e => { stageH.current = e.nativeEvent.layout.height; }}>
          <View style={s.crumbs}>
            <Pressable onPress={() => router.push(href.kategorie(p.cat))} accessibilityRole="link" accessibilityLabel={`${T.category}: ${catLabel}`} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }} style={s.crumb}>
              <Text style={s.crumbText} numberOfLines={1}>{catLabel}</Text>
            </Pressable>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            {si >= 0 ? (
              <Pressable onPress={() => router.push(href.kategorie(p.cat, { sub: si }))} accessibilityRole="link" accessibilityLabel={`${T.subcategory}: ${p.sub}`} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }} style={[s.crumb, { flexShrink: 1 }]}>
                <Text style={s.crumbText} numberOfLines={1}>{p.sub}</Text>
              </Pressable>
            ) : (
              <View style={[s.crumb, { backgroundColor: colors.mist, flexShrink: 1 }]}>
                <Text style={[s.crumbText, { color: colors.muted }]} numberOfLines={1}>{p.sub}</Text>
              </View>
            )}
          </View>

          <Pressable onPress={() => setImgOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={T.enlargeImage} style={s.tile}>
            <ProductImage img={p.img} size={900} blend style={[s.tileImg, p.na && { opacity: 0.5 }]} />
            {pct >= 1 ? (
              <View style={s.badge}>
                <Text style={s.badgeText}>−{pct} %</Text>
              </View>
            ) : null}
            <View style={s.zoom} pointerEvents="none">
              <Ionicons name="expand-outline" size={18} color={colors.text} />
            </View>
          </Pressable>

          <View style={{ paddingHorizontal: space.l, gap: space.xs }}>
            <Pressable
              onPress={() => router.push(href.kategorie(p.cat, { marke: p.vendor }))}
              accessibilityRole="link"
              accessibilityLabel={`${T.brand}: ${p.vendor}`}
              hitSlop={8}
              style={s.brandLink}
            >
              <Text style={s.brand} numberOfLines={1}>{p.vendor}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
            <Text style={[s.title, p.title.length > 70 && { fontSize: 20, lineHeight: 26 }]} accessibilityRole="header">{p.title}</Text>
          </View>
        </View>

        <View style={{ gap: sizes.groupGap, marginTop: sizes.groupGap }} onLayout={e => { wrapY.current = e.nativeEvent.layout.y; }}>
          {/* Fiyat bloğu */}
          <View style={s.priceCard} onLayout={e => { priceBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <View style={{ flexShrink: 1 }}>
                <Price price={p.price} was={hasWas ? p.was : undefined} size="l" muted={!view.fresh || p.na} />
              </View>
              {pct >= 1 ? (
                <View style={s.pctPill}>
                  <Text style={s.pctText}>−{pct} %</Text>
                </View>
              ) : null}
            </View>
            <Text style={typo.meta}>{T.vatNote}</Text>
            {p.na ? (
              <View style={s.note}>
                <Ionicons name="information-circle" size={20} color={colors.accent} />
                <Text style={[typo.small, { flex: 1 }]}>{view.gone ? T.unavailableText : T.notAvailable}</Text>
              </View>
            ) : null}
            {stale ? (
              <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel={T.retry} style={s.note}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />
                <Text style={[typo.small, { flex: 1 }]}>{T.staleText}</Text>
                <Text style={s.noteAction}>{T.retry}</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Bilgi satırları (marka, kategori ve alt kategori sayfada zaten yazılı: ayrı "Details" kartı yok) */}
          <CardGroup>
            {infoRow(freeHere ? 'checkmark-circle-outline' : 'cube-outline', 'sun', shipLabel, shipValue)}
            {p.na
              ? infoRow('close-circle-outline', 'peach', view.gone ? T.currentlyUnavailable : T.notAvailable)
              : infoRow('checkmark-circle-outline', 'lilac', T.available)}
          </CardGroup>
          <Text style={s.dataNote}>{T.dataNote}</Text>
        </View>

        {/* Şeritler: ana sayfadaki gibi panellerde */}
        <ProductRail
          tone="white"
          title={subLabel}
          data={otherSub.length >= RAIL_MIN ? otherSub : []}
          onAll={si >= 0 ? () => router.push(href.kategorie(p.cat, { sub: si })) : undefined}
        />
        <ProductRail
          tone="sun"
          title={fmt(T.moreFromBrand, { brand: p.vendor })}
          data={brandRail}
          onAll={() => router.push(href.kategorie(p.cat, { marke: p.vendor }))}
        />
        {/* Tek kartlık yarı boş panel çizilmez */}
        <ProductRail tone="navy" live title={T.recentlyViewed} data={recentOthers.length >= 2 ? recentOthers : []} />
      </ScrollView>

      {/* Yapışık alt çubuk */}
      <BottomBar>
        <View style={s.barRow}>
          {scrolled.price ? (
            <View style={{ flexShrink: 1, minWidth: 72 }}>
              <Price price={p.price} was={hasWas ? p.was : undefined} muted={!view.fresh || p.na} />
            </View>
          ) : null}
          <Pressable
            onPress={() => toggleFav(p)}
            onLongPress={() => picker.open(p)}
            accessibilityRole="button"
            accessibilityLabel={fav ? T.favRemove : T.favAdd}
            accessibilityHint={T.favLongPressHint}
            accessibilityState={{ selected: fav }}
            accessibilityActions={[{ name: 'longpress', label: T.addToList }]}
            onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'longpress') picker.open(p); }}
            style={({ pressed }) => [s.heart, pressed && { backgroundColor: colors.mist }]}
          >
            <Ionicons name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? colors.accent : colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            {/* Sepetteyse birincil eylem sepete götürür (adet sepette değişir) */}
            {inCartQty > 0 && !p.na ? (
              <Btn label={fmt(T.inCartN, { n: inCartQty })} icon="checkmark" onPress={() => router.navigate(href.warenkorb())} />
            ) : (
              <Btn label={p.na ? T.notAvailable : T.addToCart} icon={p.na ? undefined : 'cart'} disabled={p.na} onPress={onAdd} />
            )}
          </View>
        </View>
      </BottomBar>

      {/* Tam ekran görsel (tek Modal; sheet ile aynı anda açılamaz) */}
      <Modal visible={imgOpen} animationType="fade" onRequestClose={() => setImgOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={{ flex: 1, backgroundColor: colors.card, paddingBottom: insets.bottom }}>
          {/* Ortak marka başlığı: açık renkli durum çubuğu her ekranda okunur kalır */}
          <ScreenHeader title={p.vendor} right={<IconButton icon="close" label={T.close} onPress={() => setImgOpen(false)} />} />
          <Image source={{ uri: imageUrl(p.img, 1400) }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel={p.title} />
        </View>
      </Modal>

      {/* "Hinzugefügt" katmanı; toast gösterilmez */}
      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={T.addedTitle}
        icon={<IconDisc icon="checkmark" tint="sun" iconColor={colors.navy} />}
      >
        <View style={s.sheetItem}>
          <View style={s.sheetThumb}>
            <ProductImage img={p.img} size={240} blend style={{ width: '100%', height: '100%' }} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.sheetName} numberOfLines={2}>{p.title}</Text>
            <Price price={p.price} was={hasWas ? p.was : undefined} />
            {inCartQty > 0 ? <Text style={typo.meta}>{fmt(T.inCartQty, { n: inCartQty })}</Text> : null}
          </View>
        </View>
        <View style={{ gap: space.s, marginVertical: space.m }}>
          <Btn label={T.toCart} icon="cart" onPress={goCart} />
          <Btn label={T.continueShopping} kind="ghost" onPress={() => setSheet(false)} />
        </View>
        {/* Arkadaki sayfanın ilk rafını tekrar etmemek için katmanda marka rafı (en az 3 ürün varsa).
            Şerit kendi 16 dp payını taşır: katmanın yan boşluğu geri alınır, başlık metinle hizalı kalır */}
        {brandRail.length > 0 ? (
          <View style={{ marginHorizontal: -space.l }}>
            <ProductRail title={fmt(T.moreFromBrand, { brand: p.vendor })} data={brandRail} onBeforeNavigate={() => setSheet(false)} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { backgroundColor: colors.card, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: space.l, gap: space.m, ...shadow.soft },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: space.l, paddingTop: space.m },
  crumb: { minHeight: 36, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: colors.lilac, justifyContent: 'center', maxWidth: '100%' },
  crumbText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.primary },
  tile: { marginHorizontal: space.l, aspectRatio: 1, borderRadius: radius.l, backgroundColor: colors.mist, overflow: 'hidden' },
  tileImg: { width: '100%', height: '100%' },
  badge: { position: 'absolute', left: space.m, top: space.m, backgroundColor: colors.sun, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.bold, color: colors.navy, fontSize: 13, lineHeight: 16 },
  zoom: { position: 'absolute', right: space.m, bottom: space.m, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  brandLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28 },
  brand: { ...typo.eyebrow, flexShrink: 1 },
  title: { ...typo.title, fontSize: 24, lineHeight: 30 },
  priceCard: { marginHorizontal: space.l, backgroundColor: colors.card, borderRadius: radius.l, padding: space.l, gap: space.s, ...shadow.card },
  pctPill: { backgroundColor: colors.sun, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pctText: { fontFamily: fonts.bold, color: colors.navy, fontSize: 13, lineHeight: 16 },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: colors.peach, borderRadius: radius.m, padding: space.m, marginTop: space.xs },
  noteAction: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.primary },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: sizes.row },
  dataNote: { ...typo.meta, marginHorizontal: space.l },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  heart: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  sheetThumb: { width: 72, height: 72, borderRadius: radius.m, backgroundColor: colors.mist, overflow: 'hidden' },
  sheetName: { ...typo.h3 },
});

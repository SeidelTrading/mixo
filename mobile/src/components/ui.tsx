import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageLoadEventData, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  type ViewStyle,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProductCached, imageUrl, primeProduct } from '../api/shop';
import { useLiveProducts, withLive } from '../hooks';
import type { IconName } from '../categoryIcons';
import { GRID_WIDE_MIN, RAIL_MAX, UNDO_MS } from '../config';
import { href } from '../routes';
import { useShop, type AddResult, type ProductLike } from '../store/shopStore';
import { cardTitle, fmt, T } from '../strings';
import { colors, discTints, type DiscTint, eur, fonts, gradients, radius, shadow, shadowPad, sizes, space, typo } from '../theme';
import { useListPicker } from './listPickerContext';

/* ───── görsel ───── */

/*
 * Yüklenemeyen görseller (çevrimdışı açılış gibi) kart yeniden kurulmadan kendiliğinden yeniden denenir.
 * Ortak bir "dönem" sayacı vardır: ağdan bir görsel başarıyla gelince (bağlantı dönmüş demektir) ya da bekleme süresi dolunca
 * sayaç ilerler; hata durumundaki görseller yeni dönemde arka planda bir kez daha yüklenmeyi dener.
 */
const IMG_RETRY_MIN_MS = 5_000;
const IMG_RETRY_MAX_MS = 60_000;
let imgEpoch = 0;
let imgEpochAt = 0;
let imgHasFailed = false;
let imgRetryMs = IMG_RETRY_MIN_MS;
let imgTimer: ReturnType<typeof setTimeout> | null = null;
const imgSubs = new Set<() => void>();
const subscribeImgEpoch = (fn: () => void) => {
  imgSubs.add(fn);
  return () => { imgSubs.delete(fn); };
};
const getImgEpoch = () => imgEpoch;
function nextImgEpoch() {
  if (imgTimer) { clearTimeout(imgTimer); imgTimer = null; }
  imgEpochAt = Date.now();
  imgHasFailed = false;
  imgEpoch += 1;
  imgSubs.forEach(fn => fn());
}
function noteImageFailed() {
  imgHasFailed = true;
  if (imgTimer) return;
  // Kimse yeni görsel yüklemese de denenir; aralık her seferinde uzar (5 sn → 60 sn)
  imgTimer = setTimeout(() => { imgTimer = null; nextImgEpoch(); }, imgRetryMs);
  imgRetryMs = Math.min(imgRetryMs * 2, IMG_RETRY_MAX_MS);
}
function noteImageLoaded(fromNetwork: boolean) {
  if (!fromNetwork) return;
  imgRetryMs = IMG_RETRY_MIN_MS;
  if (imgHasFailed && Date.now() - imgEpochAt >= IMG_RETRY_MIN_MS) nextImgEpoch();
}

/**
 * Ürün görseli. `blend`: beyaz zeminli fotoğraf pastel karonun rengine karışır (multiply);
 * yalnız renkli/sisli bir zemin üstünde kullanılır, beyaz kartta gerekmez.
 */
export function ProductImage({ img, size = 480, style, blend }: { img: string; size?: number; style?: StyleProp<ImageStyle>; blend?: boolean }) {
  const uri = imageUrl(img, size);
  const epoch = useSyncExternalStore(subscribeImgEpoch, getImgEpoch);
  // Hata, adres ve dönemle birlikte tutulur: adres değişince yer tutucu kendiliğinden kalkar, yeni dönemde yeniden denenir (efekt gerekmez)
  const [failed, setFailed] = useState<{ uri: string; epoch: number } | null>(null);
  const failedHere = !!uri && failed?.uri === uri;
  const onError = () => {
    setFailed({ uri, epoch });
    noteImageFailed();
  };
  const onLoad = (e: ImageLoadEventData) => {
    if (failedHere) setFailed(null);
    noteImageLoaded(e.cacheType === 'none');
  };
  if (!uri || failedHere) {
    // Görsel yok ya da yüklenemedi: boş alan yerine nötr yer tutucu; yeniden deneme görünmeden, yer tutucunun üstünde yapılır
    const retry = failedHere && failed?.epoch !== epoch;
    return (
      <View style={[s.imgPlaceholder, blend && { backgroundColor: 'transparent' }, style as StyleProp<ViewStyle>]} accessible={false}>
        <Ionicons name="image-outline" size={28} color={colors.muted} />
        {retry ? <Image source={{ uri }} style={s.retryImg} onError={onError} onLoad={onLoad} /> : null}
      </View>
    );
  }
  if (blend) {
    // Karışım sarmalayıcı View'e verilir: üst öğe sıradan bir View olduğu için her platformda uygulanır
    return (
      <View style={[style as StyleProp<ViewStyle>, s.blend]}>
        <Image source={{ uri }} style={s.fill} contentFit="contain" transition={120} onError={onError} onLoad={onLoad} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: colors.card }, style]}
      contentFit="contain"
      transition={120}
      onError={onError}
      onLoad={onLoad}
    />
  );
}

/* ───── fiyat ───── */

/** Eski fiyat ve mercan vurgusu yalnız sunucu was > price gönderdiyse; `muted`: satışta olmayan ürün. */
export function Price({ price, was, size = 'm', muted }: { price: number; was?: number; size?: 'm' | 'l'; muted?: boolean }) {
  const big = size === 'l';
  const hasWas = was != null && was > price;
  const color = muted ? colors.muted : hasWas ? colors.accent : colors.text;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'baseline', columnGap: 6, flexWrap: 'wrap' }}
      // Üstü çizili eski fiyat ekran okuyucuda ikinci bir fiyat gibi okunmasın
      accessible
      accessibilityLabel={hasWas ? T.a11yPriceWas(eur(price), eur(was)) : eur(price)}
    >
      {/* Dar kartta uzun tutar ikiye bölünmez: tek satırda kalır, gerekirse küçülür */}
      <Text
        style={[typo.price, { color, flexShrink: 1 }, big && { fontSize: 24, lineHeight: 30, letterSpacing: -0.5 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {eur(price)}
      </Text>
      {hasWas ? (
        <Text style={{ fontFamily: fonts.regular, color: colors.muted, textDecorationLine: 'line-through', fontSize: big ? 15 : 12, lineHeight: big ? 20 : 16 }}>{eur(was)}</Text>
      ) : null}
    </View>
  );
}

/* ───── ürün kartı ───── */

export type CardProduct = ProductLike;
/** live=false iken canlı fiyat kancasına verilen sabit boş dizi (ağ isteği yok, yeniden hesaplama yok). */
const NO_PRODUCTS: CardProduct[] = [];

/**
 * `unconfirmed`: kayıtlı anlık görüntünün (Merkliste, liste, son bakılanlar) güncel fiyatı henüz sunucudan doğrulanmadı.
 * O sürede indirim rozeti ve eski fiyat çizilmez, fiyat soluk yazılır; kalp, liste ve sepet önce güncel ürünü ister
 * (eski fiyat sepete ya da "Preis beim Merken" olarak listeye girmez; sunucuda yoksa sepete eklenmez).
 */
export function ProductCard({ p, width, footer, onBeforeNavigate, unconfirmed, onRemove }: {
  p: CardProduct;
  width?: number;
  footer?: React.ReactNode;
  onBeforeNavigate?: () => void;
  unconfirmed?: boolean;
  /** Eigene Liste: kalp yerine görselin sol üstünde "×" (listeden çıkar); kalp yalnız Merkliste anlamı taşır. */
  onRemove?: { label: string; onPress: () => void };
}) {
  const { isFav, toggleFav, addToCart, cart } = useShop();
  const inCart = cart.find(l => l.p.id === p.id)?.qty ?? 0;
  const toast = useToast();
  const picker = useListPicker();
  const router = useRouter();
  const fav = isFav(p.id);
  // Katman içindeki kartta (onBeforeNavigate verilmiş) uzun basma yalnız iOS'ta kapalı: iOS iki kardeş Modal'ı sunamaz;
  // Android'de liste seçici katmanın üstüne açılır
  const longPressOn = !onBeforeNavigate || Platform.OS !== 'ios';
  const hasWas = p.was > p.price && !unconfirmed;
  // Aşağı yuvarlanır: indirim hiçbir zaman olduğundan büyük gösterilmez; %1'in altında rozet yok
  const pct = hasWas ? Math.floor(((p.was - p.price) / p.was) * 100 + 1e-9) : 0;
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  /** Eylem doğrulanmış ürünle çalışır: fiyat doğrulanmamışsa önce güncel ürün alınır (404 → nicht verfügbar). */
  const withFresh = (fn: (q: CardProduct) => void) => {
    if (!unconfirmed) { fn(p); return; }
    getProductCached(p.id).then(
      f => fn(withLive(p, { [p.id]: f ? { price: f.price, was: f.was } : null })),
      () => toast.show({ text: T.loadError, tone: 'info' }),
    );
  };
  const addNow = (q: CardProduct) => {
    const r = addToCart(q);
    const ok = r === 'added' || r === 'incremented';
    const msg = addResultText(r);
    if (onBeforeNavigate) {
      // Katmandaki kart: kök toast Modal'ın altında kalır; yerinde kısa geri bildirim
      if (!ok) { toast.show({ text: msg, tone: 'info' }); return; }
      setAdded(true);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), 1500);
    } else {
      toast.show({ text: msg, tone: ok ? 'ok' : 'info' });
    }
  };
  // Görünen başlıkta marka tekrarı yok ve baştaki model kodları sona alınır; erişilebilirlik etiketi tam başlığı korur
  const shortTitle = cardTitle(p.vendor, p.title);

  const body = (
    <>
      <View style={s.cardMedia}>
        <ProductImage img={p.img} size={360} blend style={[s.cardImg, p.na && { opacity: 0.45 }]} />
        {hasWas && pct >= 1 && !p.na ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>−{pct} %</Text>
          </View>
        ) : null}
      </View>
      <View style={s.cardText}>
        <Text style={[s.vendor, p.na && { color: colors.muted }]} numberOfLines={1}>{p.vendor}</Text>
        <Text style={[s.title, p.na && { color: colors.muted }]} numberOfLines={2}>{shortTitle}</Text>
      </View>
    </>
  );

  return (
    <View style={[s.card, width ? { width } : { flex: 1 }]}>
      {onBeforeNavigate ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${p.vendor} ${p.title}`}
          style={s.cardLink}
          onPressIn={() => primeProduct(p)}
          onPress={() => {
            onBeforeNavigate();
            router.push(href.produkt(p.id));
          }}
        >
          {body}
        </Pressable>
      ) : (
        <Link href={href.produkt(p.id)} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${p.vendor} ${p.title}`} style={s.cardLink} onPressIn={() => primeProduct(p)}>
            {body}
          </Pressable>
        </Link>
      )}

      {/* Bağlantının dışında: ekran okuyucu ayrı bir metin olarak okur; dokunuş alttaki bağlantıya geçer */}
      {p.na ? (
        <View style={s.naTag} pointerEvents="none">
          <Text style={s.naText} numberOfLines={1}>{T.notAvailable}</Text>
        </View>
      ) : null}

      {onRemove ? (
        <Pressable
          onPress={onRemove.onPress}
          accessibilityRole="button"
          accessibilityLabel={onRemove.label}
          hitSlop={4}
          style={({ pressed }) => [s.removeBtn, pressed && { backgroundColor: colors.peach }]}
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      ) : (
      <Pressable
        // Kaldırma fiyat gerektirmez; ekleme kayıt fiyatını güncel üründen alır
        onPress={() => (fav ? toggleFav(p) : withFresh(toggleFav))}
        onLongPress={longPressOn ? () => withFresh(picker.open) : undefined}
        accessibilityRole="button"
        accessibilityLabel={fav ? T.favRemove : T.favAdd}
        accessibilityHint={longPressOn ? T.favLongPressHint : undefined}
        accessibilityState={{ selected: fav }}
        accessibilityActions={longPressOn ? [{ name: 'longpress', label: T.addToList }] : undefined}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'longpress') withFresh(picker.open);
        }}
        hitSlop={6}
        style={s.heart}
      >
        <Ionicons name={fav ? 'heart' : 'heart-outline'} size={18} color={fav ? colors.accent : colors.text} />
      </Pressable>
      )}

      <View style={s.priceRow}>
        <View style={{ flex: 1 }}>
          <Price price={p.price} was={hasWas ? p.was : undefined} muted={p.na || unconfirmed} />
        </View>
        <Pressable
          onPress={() => withFresh(addNow)}
          disabled={p.na}
          accessibilityRole="button"
          accessibilityLabel={added ? T.addedToCart : inCart > 0 ? `${T.addToCart}, ${fmt(T.inCartQty, { n: inCart })}` : T.addToCart}
          accessibilityState={{ disabled: p.na }}
          hitSlop={4}
          style={({ pressed }) => [s.cartBtn, pressed && { backgroundColor: colors.primaryDark }, p.na && s.cartBtnOff]}
        >
          <Ionicons name={added ? 'checkmark' : 'cart'} size={18} color={p.na ? colors.muted : colors.onPrimary} />
          {/* Sepetteki adet: dairenin sağ üstünde küçük mercan rozet */}
          {inCart > 0 && !p.na ? (
            <View style={s.cartCount} pointerEvents="none">
              <Text style={s.cartCountText}>{inCart > 99 ? '99+' : inCart}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {footer ? <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>{footer}</View> : null}
    </View>
  );
}

/** addToCart sonucunu kullanıcı metnine çevirir: yalnız gerçekten eklendiyse "eklendi" denir. */
export function addResultText(r: AddResult): string {
  if (r === 'added' || r === 'incremented') return T.addedToCart;
  return r === 'full' ? T.cartFull : r === 'maxQty' ? T.maxQty : T.notAvailable;
}

/* ───── ızgara ve şerit ───── */

/** Dikey ızgara: genişlik < GRID_WIDE_MIN → 2 sütun, değilse 3 (sonsuz kaydırma için onEnd). */
export function ProductGrid({ data: raw, onEnd, header, footer, empty, renderFooter, bottomInset = true, live = false, removeAction }: {
  data: CardProduct[];
  /** Eigene Liste: her kartta "×" düğmesi (etiket ve eylem). */
  removeAction?: { label: string; onPress: (p: CardProduct) => void };
  onEnd?: () => void;
  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  empty?: React.ReactElement | null;
  renderFooter?: (p: CardProduct) => React.ReactNode;
  /** Yığın ekranında son satır gezinme çubuğunun / ana çizginin altında kalmasın; sekme ekranında false verilir. */
  bottomInset?: boolean;
  /** Kayıtlı anlık görüntüler (Merkliste, liste): güncel fiyat/durum sunucudan alınır. */
  live?: boolean;
}) {
  const lp = useLiveProducts(live ? raw : NO_PRODUCTS);
  const data = live ? lp.items : raw;
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [boxW, setBoxW] = useState(0);
  const width = boxW || win.width;
  const cols = width < GRID_WIDE_MIN ? 2 : 3;
  const gap = space.m;
  const side = space.l;
  // Son satırdaki tek kart sütun genişliğini aşmasın
  const itemW = Math.floor((width - side * 2 - gap * (cols - 1)) / cols);
  const onLayout = useCallback((e: LayoutChangeEvent) => setBoxW(Math.round(e.nativeEvent.layout.width)), []);

  return (
    <FlatList
      key={`cols-${cols}`}
      data={data}
      keyExtractor={p => p.id}
      numColumns={cols}
      onLayout={onLayout}
      columnWrapperStyle={{ gap, paddingHorizontal: side }}
      contentContainerStyle={{ gap, paddingBottom: space.xl + (bottomInset ? insets.bottom : 0) }}
      renderItem={({ item }) => (
        <View style={{ flex: 1, maxWidth: itemW }}>
          <ProductCard
            p={item}
            footer={renderFooter ? renderFooter(item) : undefined}
            unconfirmed={live && lp.prices[item.id] === undefined}
            onRemove={removeAction ? { label: removeAction.label, onPress: () => removeAction.onPress(item) } : undefined}
          />
        </View>
      )}
      // Binlerce ürünlük listede kaydırma hafif kalsın: küçük ilk parti, dar pencere
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={7}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={header ?? undefined}
      ListFooterComponent={footer ?? undefined}
      ListEmptyComponent={empty ?? undefined}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export type RailTone = 'plain' | 'white' | 'sun' | 'peach' | 'navy';
const RAIL_BG: Record<RailTone, string | undefined> = {
  plain: undefined,
  white: colors.card,
  sun: colors.sunSoft,
  peach: colors.peach,
  navy: colors.navy,
};

/** Bölüm başlığının üst boşluğu: 24 dp'lik bölüm aralığından satır kutusunun payı düşülmüş hâli. */
const SECTION_TOP = space.xl - space.xs;
/** Panelin yan boşluğu (sayfa yan boşluğuyla aynı) ve iç boşluğu. */
const PANEL_SIDE = space.l;
const PANEL_PAD = space.m;

/**
 * Şerit kartı genişliği: tam görünen kartların ardından bir sonrakinin yaklaşık %40'ı görünür
 * (yarım kalmış harf parçaları değil, bilinçli bir "devamı var" payı). `inset`: şeridin iki yanındaki toplam pay.
 */
export function railCardWidth(screenW: number, inset = 0, lead: number = space.l): number {
  const gap = space.m;
  const avail = screenW - inset - lead - gap * 2;
  // Geniş ekranda tam görünen kart sayısı artar; kart ~190 dp'yi geçmez
  const full = Math.max(2, Math.floor(avail / 190));
  return Math.max(128, Math.floor((avail - (full - 2) * gap) / (full + 0.4)));
}

/**
 * Yatay şerit; boşsa hiçbir şey çizmez.
 * `tone` verilirse şerit, köşeleri yuvarlak renkli bir panelin içine oturur (ana sayfada ritim için).
 * Kart genişliği ekrandan hesaplanır (`railCardWidth`); `cardWidth` yalnız özel durumda verilir.
 */
export function ProductRail({ title, data: raw, cardWidth, onBeforeNavigate, tone = 'plain', icon, onAll, live = false, fadeColor }: {
  title: string; data: CardProduct[]; cardWidth?: number; onBeforeNavigate?: () => void;
  tone?: RailTone; icon?: IconName; onAll?: () => void;
  /** Sağ kenar solmasının rengi = şeridin durduğu zemin. Varsayılan: panel rengi; katmanda (onBeforeNavigate) beyaz; yoksa sayfa zemini. */
  fadeColor?: string;
  /** Kayıtlı anlık görüntüler (Zuletzt angesehen): güncel fiyat/durum sunucudan alınır (yalnız şeritte görünen kadar). */
  live?: boolean;
}) {
  const liveRaw = useMemo(() => (live ? raw.slice(0, RAIL_MAX) : NO_PRODUCTS), [live, raw]);
  const lp = useLiveProducts(liveRaw);
  const data = live ? lp.items : raw;
  const win = useWindowDimensions();
  const [boxW, setBoxW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setBoxW(Math.round(e.nativeEvent.layout.width)), []);
  const [atEnd, setAtEnd] = useState(false);
  if (data.length === 0) return null;
  const panel = tone !== 'plain';
  const dark = tone === 'navy';
  const lead = panel ? PANEL_PAD : space.l;
  // Katman gibi dar bir kapta ekran değil kabın genişliği esas alınır
  const w = cardWidth ?? railCardWidth(boxW || win.width - (panel ? PANEL_SIDE * 2 : 0), 0, lead);
  return (
    <View onLayout={onLayout} style={panel ? [s.panel, { backgroundColor: RAIL_BG[tone] }, tone === 'white' && shadow.soft] : undefined}>
      <SectionHeader title={title} icon={icon} onAll={onAll} dark={dark} inset={lead} top={panel ? space.l : undefined} />
      <View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data.slice(0, RAIL_MAX)}
        keyExtractor={p => p.id}
        // Sağ kenar solması sonda kalkar (son kartın kenarı solmasın); durum yalnız değişince yazılır
        onScroll={e => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const end = contentOffset.x + layoutMeasurement.width >= contentSize.width - space.l;
          if (end !== atEnd) setAtEnd(end);
        }}
        scrollEventThrottle={64}
        // Dikey listenin içindeki yatay şerit: Android'in görünmeyen alt görünümleri sökmesi kapalı. Açıkken, üstteki içerik
        // kısalıp şerit yukarı kayınca (ör. sepetten satır silme) kartların alt kısmı (fiyat, sepet düğmesi) çizilmeden kalıyordu
        removeClippedSubviews={false}
        // Alt boşluk: kart gölgesi liste sınırında kesilmesin; panelsiz şeritte bu pay eksi kenar boşluğuyla geri alınır
        // (bölümler arası boşluk her yerde 24 dp kalır)
        style={panel ? undefined : { marginBottom: -shadowPad.card }}
        contentContainerStyle={{ gap: space.m, paddingHorizontal: lead, paddingTop: 2, paddingBottom: panel ? PANEL_PAD : shadowPad.card }}
        renderItem={({ item }) => (
          <ProductCard p={item} width={w} onBeforeNavigate={onBeforeNavigate} unconfirmed={live && lp.prices[item.id] === undefined} />
        )}
      />
      {/* Kenarda yarım kalan kartın harf parçaları panel rengine solar: "devamı var" payı, kırık metin değil */}
      {atEnd ? null : <EdgeFade color={fadeColor ?? RAIL_BG[tone] ?? (onBeforeNavigate ? colors.card : colors.bg)} width={28} />}
      </View>
    </View>
  );
}

/* ───── temel öğeler ───── */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ paddingVertical: space.xxl, paddingHorizontal: space.xl, alignItems: 'center', gap: space.m }}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={[typo.small, { color: colors.muted, textAlign: 'center' }]}>{label}</Text> : null}
    </View>
  );
}

/**
 * Izgara yüklenirken iskelet: ürün kartı biçiminde soluk karolar (görsel karosu + iki satır + fiyat), yavaş nabız.
 * Boş beyaz alan ya da tek dönen çark yerine sayfanın düzeni önceden görünür.
 */
export function SkeletonGrid({ count = 4 }: { count?: number }) {
  const [pulse] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.6, duration: 650, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  const rows = Math.ceil(count / 2);
  return (
    <Animated.View style={{ opacity: pulse, paddingHorizontal: space.l, gap: space.m, paddingTop: space.xs }} accessible accessibilityLabel={T.loading} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: space.m }}>
          {[0, 1].map(c => (
            <View key={c} style={[s.card, { flex: 1 }]}>
              <View style={[s.cardMedia, { backgroundColor: colors.lineSoft }]} />
              <View style={{ padding: space.s, gap: 6 }}>
                <View style={[s.skLine, { width: '40%' }]} />
                <View style={[s.skLine, { width: '90%' }]} />
                <View style={[s.skLine, { width: '70%' }]} />
                <View style={[s.skLine, { width: '35%', height: 14, marginTop: space.xs }]} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: space.xxl, paddingHorizontal: space.xl, alignItems: 'center', gap: space.m }}>
      <View style={[s.stateDisc, { backgroundColor: colors.peach }]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.accent} />
      </View>
      <Text style={[typo.body, { color: colors.muted, textAlign: 'center' }]}>{text}</Text>
      {onRetry ? <Btn label={T.retry} onPress={onRetry} kind="ghost" /> : null}
    </View>
  );
}

/**
 * Mavi marka başlığının (ScreenHeader) içinde mi? İçerideki ikon düğmeleri beyaz, arama alanı beyaz zeminli çizilir;
 * böylece ekranların `headerRight`/`headerTitle` öğeleri renk vermeden okunur kalır.
 */
const OnBrand = createContext(false);
export const useOnBrand = (): boolean => useContext(OnBrand);

/**
 * Düğme (48 dp kapsül). primary: mavi (basılı: koyu mavi) · ghost: beyaz, ince çizgili ikincil ·
 * danger: yıkıcı eylem, beyaz zeminde mercan yazı. `icon`: yazının solunda ikon.
 * Devre dışı birincil düğme soluk mavi değil, bilerek kapalı görünür: gri-lila zemin, soluk yazı (isteğe bağlı kilit ikonu ile).
 */
export function Btn({ label, onPress, kind = 'primary', disabled, accessibilityLabel, icon }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; accessibilityLabel?: string; icon?: IconName;
}) {
  const off = !!disabled;
  const fg = off ? colors.muted : kind === 'primary' ? colors.onPrimary : kind === 'danger' ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' ? { backgroundColor: pressed ? colors.primaryDark : colors.primary } : s.btnGhost,
        kind === 'ghost' && pressed && { backgroundColor: colors.mist },
        kind === 'danger' && pressed && { backgroundColor: colors.peach },
        off && (kind === 'primary' ? s.btnOff : { opacity: 0.45 }),
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[typo.button, { color: fg, flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** 44 dp yuvarlak ikon düğmesi. Renk verilmezse lacivert; mavi başlığın içinde beyaz (basılı: yarı saydam beyaz). */
export function IconButton({ icon, label, onPress, disabled, color, size = 22 }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; color?: string; size?: number;
}) {
  const onBrand = useOnBrand();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: onBrand ? colors.onBrandPress : colors.lilac }, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={size} color={color ?? (onBrand ? colors.onPrimary : colors.text)} />
    </Pressable>
  );
}

/**
 * Başlıktaki metinli eylem (ör. "Meine Listen"): mavi zeminde yarı saydam beyaz kapsül, beyaz yazı.
 * 36 dp yüksek, hitSlop ile 44 dp dokunma alanı; sağ kenardan 12 dp içeride durur.
 */
export function HeaderAction({ label, icon, onPress, role = 'button' }: { label: string; icon?: IconName; onPress: () => void; role?: 'button' | 'link' }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityRole={role}
      accessibilityLabel={label}
      style={({ pressed }) => [s.hAction, pressed && { backgroundColor: colors.onBrandPress }]}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.onPrimary} /> : null}
      <Text style={s.hActionText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </Pressable>
  );
}

/** Kapsül: beyaz + ince çizgi; seçili: mavi dolgu, beyaz yazı. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const fg = active ? colors.onPrimary : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      // Kapsül 36 dp yüksek: dikey hitSlop ile dokunma alanı 44 dp'ye çıkar (yatay boşluk kapsüller arası)
      hitSlop={{ top: 4, bottom: 4 }}
      style={[s.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, color: fg, fontSize: 13, lineHeight: 18 }}>{label}</Text>
    </Pressable>
  );
}

/** Küçük sayı/durum rozeti: mercan zemin, beyaz yazı. */
export function Badge({ label }: { label: string | number }) {
  return (
    <View style={s.countBadge}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.onPrimary }}>{label}</Text>
    </View>
  );
}

/** Demo notu: ince, sakin lila şerit. Tam açıklama dokununca açılan "Über diese Demo" ekranında. */
export function DemoBanner() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href.ueber())}
      accessibilityRole="button"
      accessibilityLabel={`${T.demoBanner} ${T.aboutDemo}`}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [s.demo, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="information-circle" size={16} color={colors.primary} />
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.text }} numberOfLines={2}>{T.demoShort}</Text>
      {/* Dokunma alanı satırın tamamı (en az 40 dp + hitSlop); "Mehr ›" yalnız işaret */}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.primary }}>{T.more}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
    </Pressable>
  );
}

/**
 * Bölüm başlığı: Fraunces 22/28 (afiş ve marka yazısıyla aynı aile).
 * Boşluk: üstte 20, altta 8 dp; satır kutusunun payıyla gözle görünen aralık önceki içeriğe ~24, sonraki içeriğe ~12 dp olur.
 * `onAll` yalnız gerçek bir hedef varsa verilir ("Alle" bağlantısı). `icon`: güneş disk üstünde lacivert ikon (her zeminde).
 * `dark`: lacivert panel üstünde beyaz yazı. `inset`: yan boşluk (varsayılan 16).
 */
export function SectionHeader({ title, icon, onAll, dark, inset = space.l, top = SECTION_TOP }: {
  title: string; icon?: IconName; onAll?: () => void; dark?: boolean; inset?: number; top?: number;
}) {
  const fg = dark ? colors.onPrimary : colors.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: inset, paddingTop: top, paddingBottom: space.s }}>
      {icon ? (
        <View style={s.headIcon}>
          <Ionicons name={icon} size={15} color={colors.navy} />
        </View>
      ) : null}
      <Text style={[typo.title, { flex: 1, color: fg }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {onAll ? (
        <Pressable
          onPress={onAll}
          accessibilityRole="link"
          accessibilityLabel={fmt(T.seeAllA11y, { k: title })}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: dark ? colors.sun : colors.primary }}>{T.seeAll}</Text>
          <Ionicons name="chevron-forward" size={14} color={dark ? colors.sun : colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <SectionHeader title={children} />;
}

/** "Birinci cümle. Gerisi." → ["Birinci cümle", "Gerisi."]; tek cümlede ikinci öğe boş. */
export function splitLead(text: string): [string, string] {
  const m = /^(.+?)[.!]\s+(\S[\s\S]*)$/.exec(text.trim());
  return m ? [m[1], m[2]] : [text.trim(), ''];
}

/**
 * Boş durum: kendi araçlarımızla küçük bir "illüstrasyon" (büyük pastel disk, içinde beyaz disk + mavi ikon,
 * çevresinde güneş ve mercan noktalar), Fraunces başlık, tek satırlık dostça açıklama, birincil kapsül eylem.
 * `text` verilmez ve başlık birden çok cümleyse ilk cümle başlık, gerisi açıklama olur.
 */
export function EmptyState({ title, text, children, icon = 'bag-handle-outline', tint = 'lilac', action }: {
  title: string; text?: string; children?: React.ReactNode; icon?: IconName; tint?: DiscTint;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  const [head, rest] = text ? [title, text] : splitLead(title);
  return (
    <View style={{ paddingVertical: space.xxl, paddingHorizontal: space.xl, alignItems: 'center', gap: space.s }}>
      <View style={s.emptyArt} accessible={false}>
        <View style={[s.emptyDisc, { backgroundColor: discTints[tint] }]}>
          <View style={s.emptyInner}>
            <Ionicons name={icon} size={32} color={colors.primary} />
          </View>
        </View>
        <View style={[s.emptyDot, { width: 18, height: 18, borderRadius: 9, right: 6, top: 10, backgroundColor: colors.sun }]} />
        <View style={[s.emptyDot, { width: 10, height: 10, borderRadius: 5, left: 10, bottom: 14, backgroundColor: colors.accent }]} />
        <View style={[s.emptyDot, { width: 8, height: 8, borderRadius: 4, right: 0, bottom: 30, backgroundColor: colors.primary, opacity: 0.35 }]} />
      </View>
      <Text style={[typo.title, { textAlign: 'center' }]} accessibilityRole="header">{head}</Text>
      {rest ? <Text style={[typo.body, { color: colors.muted, textAlign: 'center', maxWidth: 340 }]}>{rest}</Text> : null}
      {action || children ? (
        <View style={{ marginTop: space.m, alignSelf: 'stretch', alignItems: 'center', gap: space.s }}>
          {action ? <Btn label={action.label} onPress={action.onPress} icon={action.icon} /> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** İlerleme çubuğu: lila iz, mavi dolgu; `good` (hedefe ulaşıldı) güneş dolgu. Yeşil kullanılmaz. */
export function ProgressBar({ value, tone = 'neutral' }: { value: number; tone?: 'neutral' | 'good' }) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View
      style={s.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
    >
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: 4, backgroundColor: tone === 'good' ? colors.sun : colors.primary }} />
    </View>
  );
}

/** Onay kutusu: 24 dp kutu (köşe 8), seçili mavi dolgu + beyaz onay; dokunma alanı en az 44 × 44 dp. */
export function Checkbox({ checked, onPress, label, text, disabled }: { checked: boolean; onPress: () => void; label: string; text?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      hitSlop={6}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: sizes.touch, minWidth: sizes.touch - 12 }, disabled && { opacity: 0.45 }]}
    >
      <View style={[s.box, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
      </View>
      {text ? <Text style={[typo.body, { flexShrink: 1 }]}>{text}</Text> : null}
    </Pressable>
  );
}

/**
 * Seçim satırı (katman ve listelerde): en az 52 dp, solda metin, sağda yuvarlak seçim (`radio`) ya da onay dairesi (`check`).
 * Seçili: mavi halka/dolgu ve yarı kalın etiket. `sub`: alt yazı.
 */
export function ChoiceRow({ label, sub, value, selected, onPress, kind = 'radio', disabled, leading, inCard }: {
  label: string; sub?: string; value?: string; selected: boolean; onPress: () => void; kind?: 'radio' | 'check'; disabled?: boolean;
  leading?: React.ReactNode;
  /** `CardGroup` içinde: 16 dp iç boşluk, köşesiz basılı zemin (kartın kenarına kadar). */
  inCard?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityLabel={[label, sub, value].filter(Boolean).join(', ')}
      accessibilityState={kind === 'radio' ? { selected, disabled: !!disabled } : { checked: selected, disabled: !!disabled }}
      style={({ pressed }) => [s.choice, inCard && s.choiceCard, pressed && { backgroundColor: colors.mist }, disabled && { opacity: 0.45 }]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={[typo.body, selected && { fontFamily: fonts.semibold }]} numberOfLines={2}>{label}</Text>
        {sub ? <Text style={typo.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[typo.smallStrong, { color: colors.muted }]} numberOfLines={1}>{value}</Text> : null}
      {kind === 'radio' ? (
        <View style={[s.radio, selected && { borderColor: colors.primary }]}>
          {selected ? <View style={s.radioDot} /> : null}
        </View>
      ) : (
        <View style={[s.checkCircle, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {selected ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Adet seçici: çizgili kapsül, iki 44 dp düğme ve ortada sayı. En küçük değerde `onRemove` verilmişse eksi yerine
 * mercan çöp kutusu çizilir. Sayı ekran okuyucuya `valueLabel` ile okunur.
 */
export function QtyStepper({ value, onChange, min = 1, max = 99, onRemove, labels }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; onRemove?: () => void;
  labels: { less: string; more: string; remove?: string; value: string };
}) {
  const atMin = value <= min;
  const removeMode = atMin && !!onRemove;
  return (
    <View style={s.stepper}>
      <Pressable
        onPress={removeMode ? onRemove : () => onChange(value - 1)}
        disabled={atMin && !removeMode}
        accessibilityRole="button"
        accessibilityLabel={removeMode ? labels.remove ?? labels.less : labels.less}
        accessibilityState={{ disabled: atMin && !removeMode }}
        style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: colors.lilac }, atMin && !removeMode && { opacity: 0.35 }]}
      >
        <Ionicons name={removeMode ? 'trash-outline' : 'remove'} size={18} color={removeMode ? colors.accent : colors.primary} />
      </Pressable>
      <Text style={s.stepValue} accessibilityLabel={labels.value}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={labels.more}
        accessibilityState={{ disabled: value >= max }}
        style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: colors.lilac }, value >= max && { opacity: 0.35 }]}
      >
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** Bölümlü seçim (2–4 seçenek): sis izli kapsül, her bölüm 44 dp; seçili bölüm mavi dolgu + beyaz yazı. */
export function Segmented<K extends string>({ options, value, onChange, label }: {
  options: readonly { key: K; label: string }[]; value: K; onChange: (k: K) => void; label?: string;
}) {
  return (
    <View style={s.segTrack} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={[s.seg, on && s.segOn]}
          >
            <Text style={[typo.smallStrong, { color: on ? colors.onPrimary : colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───── arama kutusu ve satır ───── */

/**
 * Arama alanı görünümlü düğme. Beyaz yüzey üstünde: sisli zemin + ince çizgi (44 dp).
 * Mavi başlığın içinde (ScreenHeader) kendiliğinden beyaz zeminli olur; `hero`: ana sayfa başlığı, beyaz, 48 dp + gölge.
 */
export function SearchBox({ onPress, hero }: { onPress: () => void; hero?: boolean }) {
  const onBrand = useOnBrand();
  const white = hero || onBrand;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={T.a11ySearchOpen}
      style={[s.searchBox, white && s.searchWhite, hero && s.searchHero]}
    >
      <Ionicons name="search" size={hero ? 20 : 18} color={white ? colors.primary : colors.muted} />
      <Text style={{ flex: 1, fontFamily: fonts.regular, color: colors.muted, fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
        {T.searchPlaceholder}
      </Text>
    </Pressable>
  );
}

/** Satır ikon diski: 40 dp pastel daire (lila / şeftali / güneş), içinde mavi ikon; yıkıcıda şeftali + mercan. */
export function IconDisc({ icon, tint = 'lilac', danger, size = sizes.disc, iconColor }: {
  icon: IconName; tint?: DiscTint; danger?: boolean; size?: number; /** yalnız özel durum: "Hinzugefügt" onayı lacivert */ iconColor?: string;
}) {
  return (
    <View style={[s.iconBox, { width: size, height: size, borderRadius: size / 2, backgroundColor: danger ? colors.peach : discTints[tint] }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={danger ? colors.accent : iconColor ?? colors.primary} />
    </View>
  );
}

/**
 * Liste satırı (en az 56 dp): baş öğe 40 dp pastel ikon diski (`icon` + `tint`) ya da `leading` (ör. `CategoryDisc`),
 * başlık Inter yarı kalın 15 lacivert, isteğe bağlı alt yazı soluk 13, sonda `value` ve/veya ok.
 * `danger`: yıkıcı eylem; etiket ve ikon mercan, disk şeftali (yıkıcı satırlar ayrı, en alttaki grupta durur).
 * Satırlar `CardGroup` içine konur; tam genişlik çıplak satır listesi yapılmaz. `iconBox={false}`: disksiz düz ikon.
 */
export function ListRow({ label, sub, icon, iconBox = true, tint, leading, height = sizes.row, onPress, chevron = true, value, disabled, danger, accessibilityLabel }: {
  label: string; sub?: string; icon?: IconName; iconBox?: boolean; tint?: DiscTint; leading?: React.ReactNode; height?: number;
  onPress: () => void; chevron?: boolean; value?: string; disabled?: boolean; danger?: boolean; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, sub, value].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.row, { minHeight: Math.max(sizes.row, height) }, pressed && { backgroundColor: colors.mist }]}
    >
      <View style={[s.rowInner, disabled && { opacity: 0.45 }]}>
        {leading ?? (icon ? (
          iconBox ? <IconDisc icon={icon} tint={tint} danger={danger} /> : <Ionicons name={icon} size={22} color={danger ? colors.accent : colors.primary} />
        ) : null)}
        <View style={{ flex: 1 }}>
          <Text style={[typo.h3, danger && { color: colors.accent }]} numberOfLines={2}>{label}</Text>
          {sub ? <Text style={typo.rowSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {value ? <Text style={[typo.smallStrong, { color: colors.muted }]} numberOfLines={1}>{value}</Text> : null}
        {chevron ? <Ionicons name="chevron-forward" size={18} color={danger ? colors.accent : colors.muted} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * Grup başlığı: ana sayfadaki bölüm başlığıyla aynı dil (Fraunces 22 lacivert), kartın 8 dp üstünde.
 * `action`: sağda mavi metin bağlantısı (44 dp dokunma alanı).
 */
export function GroupTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.xs, marginTop: space.m }}>
      <Text style={[typo.title, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.primary }}>{action.label}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Liste grubu kartı: sis zemin üstünde beyaz kart (köşe 16, 16 yan boşluk, yumuşak lacivert gölge); satırlar arasına
 * ince çizgi girer (soldan `divider` kadar içeride; varsayılan ikon diskinden sonra). `title`: grubun üstünde Fraunces başlık.
 * Gruplar arası boşluk 12 dp: ekran `PageScroll` (ya da `gap: sizes.groupGap`) ile dizer.
 */
export function CardGroup({ children, title, action, divider = space.l + sizes.disc + space.m, style }: {
  children: React.ReactNode; title?: string; action?: { label: string; onPress: () => void }; divider?: number; style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginHorizontal: space.l, gap: space.s }, style]}>
      {title ? <GroupTitle title={title} action={action} /> : null}
      <View style={s.group}>
        <View style={s.groupClip}>
          {items.map((child, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <View style={[s.groupLine, { marginLeft: divider }]} /> : null}
              {child}
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Gruplu ekran gövdesi: sis zemin, üstte 16 dp, gruplar arası 12 dp, altta 24 dp (+ yığın ekranında ana çizgi payı).
 * Sekme ekranında `bottomInset={false}` (sekme çubuğu güvenli alanı zaten ayırır).
 */
export function PageScroll({ children, bottomInset = true }: { children: React.ReactNode; bottomInset?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: space.l, gap: sizes.groupGap, paddingBottom: space.xl + (bottomInset ? insets.bottom : 0) }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * Yapışık alt çubuk (sepet toplamı, kasa, süzgeç "Anzeigen"): beyaz, üst köşeler 20, yukarı doğru yumuşak gölge, 16 yan boşluk.
 * `safe`: alt güvenli alan payı (yığın ekranı ve tam ekran katman); sekme ekranında sekme çubuğu bu payı verir → false.
 */
export function BottomBar({ children, safe = true, onLayout }: { children: React.ReactNode; safe?: boolean; onLayout?: (e: LayoutChangeEvent) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View onLayout={onLayout} style={[s.bar, { paddingBottom: safe ? Math.max(insets.bottom, space.m) + space.xs : space.m }]}>
      {children}
    </View>
  );
}

/* ───── ekran başlığı ───── */

/**
 * Ana sayfa dışındaki tüm ekranların başlığı: ana sayfanın mavi geçişinin kısa hâli (56 dp + güvenli alan),
 * beyaz Fraunces 22 başlık, beyaz geri oku ve eylemler, alt kenar düz + lacivert gölge. İçindeki `IconButton` ve
 * `SearchBox` kendiliğinden beyaza döner (bağlam); metinli eylem için `HeaderAction`.
 * Sekme ve yığın gezginleri bunu `header` seçeneğiyle çizer (bkz. app/_layout.tsx); arama gibi kendi başlığını
 * çizen ekran doğrudan kullanır. `onBack` → solda geri oku; `left` onun yerine özel öğe; `children` başlık yazısının
 * yerine geçer (ör. arama alanı); `right` sağdaki eylemler. `inset={false}`: üst güvenli alan payı verilmez.
 */
export function ScreenHeader({ title, onBack, left, right, children, inset = true }: {
  title?: string; onBack?: () => void; left?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; inset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const lead = left ?? (onBack ? <IconButton icon="arrow-back" label={T.a11yBack} onPress={onBack} /> : null);
  return (
    <OnBrand.Provider value>
      <View style={s.headerWrap}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, inset && { paddingTop: insets.top }]}>
          {/* ana sayfa başlığındaki yarı saydam halkanın küçüğü (yalnız süs) */}
          <View pointerEvents="none" style={s.headerRing} />
          <View style={[s.headerRow, !lead && { paddingLeft: space.l }]}>
            {lead}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {children ?? (title ? (
                <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2} accessibilityRole="header">
                  {title}
                </Text>
              ) : null)}
            </View>
            {right ? <View style={s.headerRight}>{right}</View> : null}
          </View>
        </LinearGradient>
      </View>
    </OnBrand.Provider>
  );
}

/**
 * Başlıkta sonradan beliren kısa başlık (ör. ürün sayfası: büyük başlık kaydırılıp çıkınca). Beyaz Fraunces, tek satır,
 * gerekirse küçülür ve kesilir; görünürken 180 ms'de solarak gelir.
 */
export function HeaderTitleFade({ text }: { text: string }) {
  const [op] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [op]);
  return (
    <Animated.Text
      style={[s.headerTitle, { fontSize: 19, lineHeight: 24, opacity: op }]}
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
      accessibilityRole="header"
    >
      {text}
    </Animated.Text>
  );
}

type HeaderSideFn = (props: { tintColor?: string; canGoBack: boolean }) => React.ReactNode;

/** Gezginin başlık seçeneklerinden (title, headerTitle, headerLeft, headerRight) `ScreenHeader` üretir; sekme ve yığın için ortak. */
export function navHeader({ options, fallback, onBack }: {
  options: {
    title?: string;
    headerTitle?: string | ((props: { children: string; tintColor?: string }) => React.ReactNode);
    headerLeft?: HeaderSideFn;
    headerRight?: HeaderSideFn;
  };
  fallback: string;
  onBack?: () => void;
}) {
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : options.title ?? fallback;
  const tint = colors.onPrimary;
  const custom = typeof options.headerTitle === 'function' ? options.headerTitle({ children: title, tintColor: tint }) : undefined;
  const left = options.headerLeft?.({ tintColor: tint, canGoBack: !!onBack });
  return (
    <ScreenHeader title={title} onBack={onBack} left={left ?? undefined} right={options.headerRight?.({ tintColor: tint, canGoBack: !!onBack })}>
      {custom}
    </ScreenHeader>
  );
}

/** Yatay kaydırılan satırın (kapsül şeridi) sağ kenarındaki solma: devamı olduğunu gösterir. Satırı saran View'in içine konur. */
export function EdgeFade({ color = colors.bg, width = 24 }: { color?: string; width?: number }) {
  // Saydam uç aynı rengin saydam hâli olmalı (aksi hâlde geçiş griye kayar)
  const clear = color.length === 7 ? `${color}00` : 'transparent';
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[clear, color]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width }}
    />
  );
}

/** Metin giriş alanı stili (TextInput): beyaz, 12 köşe, 1 dp çizgi, 48 dp; odakta kenar `colors.primary` yapılır. */
export const inputStyle = {
  minHeight: 48, paddingHorizontal: 14, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line,
  backgroundColor: colors.card, color: colors.text, fontFamily: fonts.regular, fontSize: 16,
} as const;

/* ───── katmanlar (Modal) ───── */

/**
 * Onay diyaloğu: beyaz, köşe 20, iç 24, yükseltilmiş gölge; üstte ikon diski (yıkıcıda şeftali + mercan çöp kutusu),
 * Fraunces başlık, soluk açıklama; solda `ghost` vazgeç, sağda `primary`/`danger` onay.
 */
export function ConfirmDialog({ visible, title, text, confirmLabel, cancelLabel = T.cancel, destructive, onConfirm, onCancel, icon }: {
  visible: boolean; title: string; text?: string; confirmLabel: string; cancelLabel?: string;
  destructive?: boolean; onConfirm: () => void; onCancel: () => void; icon?: IconName;
}) {
  const glyph = icon ?? (destructive ? 'trash-outline' : undefined);
  const stacked = Math.max(confirmLabel.length, cancelLabel.length) > 12;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <View style={s.dialogWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={T.close} accessibilityRole="button" />
        <View style={s.dialog} accessibilityViewIsModal>
          {glyph ? <View style={{ marginBottom: space.xs }}><IconDisc icon={glyph} danger={destructive} size={48} /></View> : null}
          <Text style={[typo.title, { fontSize: 21, lineHeight: 26 }]} accessibilityRole="header">{title}</Text>
          {text ? <Text style={[typo.body, { color: colors.muted, fontSize: 14, lineHeight: 20 }]}>{text}</Text> : null}
          {/* Uzun etiket yan yana sığmaz ve kesilirdi: düğmeler alt alta dizilir (onay üstte) */}
          <View style={{ flexDirection: stacked ? 'column-reverse' : 'row', gap: space.s, marginTop: space.m }}>
            <View style={stacked ? undefined : { flex: 1 }}><Btn label={cancelLabel} kind="ghost" onPress={onCancel} /></View>
            <View style={stacked ? undefined : { flex: 1 }}><Btn label={confirmLabel} kind={destructive ? 'danger' : 'primary'} onPress={onConfirm} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Alttan açılan katman: beyaz, üst köşeler 20, tutamak, Fraunces başlık + kapat, alt güvenli alan payı.
 * onDismiss iOS'ta kapanış animasyonu bitince çağrılır.
 */
export function BottomSheet({ visible, onClose, onDismiss, title, icon, children }: {
  visible: boolean; onClose: () => void; onDismiss?: () => void; title?: string; /** başlığın solunda (ör. onay diski) */ icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={s.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={T.close} accessibilityRole="button" />
        <View
          style={[s.sheet, { maxHeight: '90%' }, { paddingBottom: Math.max(insets.bottom, space.l) }]}
          accessibilityViewIsModal
        >
          <View style={s.grabber} />
          {title ? (
            <View style={[s.sheetHead, icon ? { gap: space.m } : null]}>
              {icon}
              <Text style={[typo.title, { flex: 1 }]} numberOfLines={2} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label={T.close} onPress={onClose} />
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/* ───── bildirim (toast) ───── */

/** `tone`: 'ok' (varsayılan, onay işareti) · 'info' (eklenemedi, hata vb.; onay işareti yerine bilgi ikonu). */
export type ToastInput = { text: string; action?: { label: string; onPress: () => void }; ms?: number; onHide?: () => void; tone?: 'ok' | 'info' };
/** `setOffset`: ekranın alt kısmında yapışık çubuk varsa (ör. sepetteki Kasse çubuğu) toast o kadar yukarı kayar; ayrılırken 0. */
type ToastApi = { show: (t: ToastInput) => void; setOffset: (h: number) => void };

const NOOP_TOAST: ToastApi = { show: () => {}, setOffset: () => {} };
const ToastCtx = createContext<ToastApi>(NOOP_TOAST);

/** Sekme çubuğu yüksekliği (kök seviyede ölçülemez; sabit pay). */
const TAB_BAR_H = 56;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [cur, setCur] = useState<ToastInput | null>(null);
  const [offset, setOffsetState] = useState(0);
  const setOffset = useCallback((h: number) => setOffsetState(Math.max(0, Math.round(h))), []);
  const insets = useSafeAreaInsets();
  const hideCb = useRef<(() => void) | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Geçerli bildirimi kapatır; onHide tam bir kez çalışır. */
  const finish = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const cb = hideCb.current;
    hideCb.current = undefined;
    setCur(null);
    cb?.();
  }, []);

  const show = useCallback((t: ToastInput) => {
    // yenisi gelince eskisi kapanır (onHide çağrılır)
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const prev = hideCb.current;
    hideCb.current = t.onHide;
    setCur(t);
    prev?.();
    timer.current = setTimeout(finish, t.ms ?? (t.action ? UNDO_MS : 2500));
  }, [finish]);

  // Bileşen sökülürken zamanlayıcı ve bekleyen onHide temizlenir
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const cb = hideCb.current;
    hideCb.current = undefined;
    cb?.();
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, setOffset }), [show, setOffset]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {cur ? (
        <View pointerEvents="box-none" style={[s.toastWrap, { bottom: insets.bottom + TAB_BAR_H + offset + space.m }]}>
          <View style={s.toast} accessibilityLiveRegion="polite">
            <Ionicons name={cur.tone === 'info' ? 'information-circle' : 'checkmark-circle'} size={18} color={colors.sun} />
            <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.onPrimary, fontSize: 14, lineHeight: 20 }}>{cur.text}</Text>
            {cur.action ? (
              <Pressable
                onPress={() => {
                  const a = cur.action;
                  a?.onPress();
                  finish();
                }}
                accessibilityRole="button"
                accessibilityLabel={cur.action.label}
                hitSlop={12}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.sun }}>{cur.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

/* ───── stiller ───── */

const s = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  blend: { mixBlendMode: 'multiply' },
  imgPlaceholder: { backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  retryImg: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  /* ürün kartı: beyaz, 16 köşe, yumuşak gölge + çok ince kenar (beyaz panel üstünde de ayrışır); görsel 12 köşeli sisli karoda */
  card: { backgroundColor: colors.card, borderRadius: radius.l, padding: 6, borderWidth: 1, borderColor: colors.lineSoft, ...shadow.card },
  cardLink: { flexGrow: 1 },
  cardMedia: { width: '100%', aspectRatio: 1, borderRadius: radius.m, backgroundColor: colors.mist, padding: 10, overflow: 'hidden' },
  cardImg: { width: '100%', height: '100%' },
  cardText: { paddingHorizontal: 4, paddingTop: space.s, gap: 2 },
  vendor: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.primary },
  title: { fontFamily: fonts.regular, color: colors.text, fontSize: 13, lineHeight: 18, minHeight: 36 },
  badge: { position: 'absolute', left: 6, top: 6, backgroundColor: colors.sun, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.bold, color: colors.navy, fontSize: 11, lineHeight: 14 },
  naTag: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  naText: { fontFamily: fonts.semibold, color: colors.muted, fontSize: 10.5, lineHeight: 14 },
  heart: {
    position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow.soft,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: 4, paddingTop: space.s, paddingBottom: 4 },
  cartBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cartBtnOff: { backgroundColor: colors.line },
  skLine: { height: 10, borderRadius: 5, backgroundColor: colors.lineSoft },
  cartCount: {
    position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  cartCountText: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 12, color: colors.onPrimary },
  removeBtn: {
    position: 'absolute', top: 6, left: 6, width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow.soft,
  },

  panel: { marginHorizontal: PANEL_SIDE, marginTop: space.xl, borderRadius: radius.xl, overflow: 'hidden' },
  headIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sun },
  stateDisc: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' },

  btn: {
    minHeight: 48, paddingVertical: 12, paddingHorizontal: space.xl, borderRadius: radius.pill,
    flexDirection: 'row', gap: space.s, alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  btnOff: { backgroundColor: colors.disabledBg },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space.m, marginRight: space.s,
    borderRadius: radius.pill, backgroundColor: colors.onBrandSurface,
  },
  hActionText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.onPrimary },
  emptyArt: { width: 136, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.s },
  emptyDisc: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  emptyInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  emptyDot: { position: 'absolute' },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 52, paddingVertical: space.s,
    paddingHorizontal: space.s, marginHorizontal: -space.s, borderRadius: radius.m,
  },
  choiceCard: { paddingHorizontal: space.l, marginHorizontal: 0, borderRadius: 0 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepper: {
    flexDirection: 'row', alignItems: 'center', height: sizes.touch, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  stepBtn: { width: sizes.touch, height: sizes.touch - 2, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 28, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  segTrack: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.lineSoft },
  seg: { flex: 1, minHeight: sizes.touch - 6, paddingHorizontal: space.m, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.primary, ...shadow.soft },
  bar: {
    backgroundColor: colors.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.l, paddingTop: space.m, gap: space.s, ...shadow.bar,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  countBadge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  // Demo şeridi: en az 40 dp, tüm satır dokunma alanı (hitSlop ile 48 dp)
  demo: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginHorizontal: space.l,
    paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.m, backgroundColor: colors.lilac,
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.lilac, overflow: 'hidden' },
  box: { width: 24, height: 24, borderRadius: radius.s, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: space.s, flex: 1, minHeight: 44, paddingHorizontal: 14,
    borderRadius: radius.m, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.line,
  },
  searchWhite: { backgroundColor: colors.card, borderWidth: 0 },
  searchHero: { minHeight: 48, gap: 10, ...shadow.card },
  row: { backgroundColor: colors.card, paddingHorizontal: space.l, justifyContent: 'center' },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  group: { borderRadius: radius.l, backgroundColor: colors.card, ...shadow.card },
  groupClip: { borderRadius: radius.l, overflow: 'hidden' },
  groupLine: { height: 1, marginRight: space.l, backgroundColor: colors.lineSoft },
  headerWrap: { zIndex: 2, ...shadow.header },
  header: { overflow: 'hidden' },
  headerRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -56, bottom: -118, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: sizes.headerRow, paddingHorizontal: space.xs },
  headerTitle: { ...typo.title, color: colors.onPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  // ikon diski: ana sayfadaki disklerle aynı dil (daire)
  iconBox: { width: sizes.disc, height: sizes.disc, borderRadius: sizes.disc / 2, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' },
  dialogWrap: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.sheet, padding: space.xl, gap: space.s, ...shadow.raised },
  sheetWrap: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.l, paddingTop: space.s, width: '100%', maxWidth: 720, alignSelf: 'center', ...shadow.bar,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.s },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: space.s },
  toastWrap: { position: 'absolute', left: space.l, right: space.l, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: colors.navy, borderRadius: radius.m,
    paddingHorizontal: space.l, paddingVertical: space.m, width: '100%', maxWidth: 520, ...shadow.raised,
  },
});

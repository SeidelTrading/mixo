import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banners, HEADER_BASE_H, HEADER_RADIUS, HomeHeader } from '../../components/Banners';
import { BrandRail, CategoryCircles, SubcategoryShowcase } from '../../components/home';
import { DemoBanner, ErrorBox, Loading, ProductRail } from '../../components/ui';
import { useConfig, useHome, useIndex } from '../../hooks';
import { BUDGET_MAX, PREMIUM_MIN } from '../../config';
import { dailyMix } from '../../filters';
import { href } from '../../routes';
import { useShop } from '../../store/shopStore';
import { bestTitle, T } from '../../strings';
import { colors, shadowPad, space } from '../../theme';

type ViewToken = { key: string };
type SectionId = 'demo' | 'cats' | 'banners' | 'brands' | 'subs' | 'recent' | 'homeState' | 'deals' | 'best' | 'budget' | 'from120';
/** Bu bölümler ekrana girince görsel parçası ister (0. parçalar). */
const LAZY: ReadonlySet<string> = new Set(['cats', 'banners', 'subs']);

export default function HomeScreen() {
  const { data: index, error, retry } = useIndex();
  const { data: home, error: homeError, retry: homeRetry } = useHome();
  const config = useConfig();
  // Kargo eşiği yalnız sunucu yanıtından gösterilir (aynı home isteği); yanıt yoksa eşik iddiası yazılmaz
  const freeShip = home ? home.freeShip : null;
  const { recent } = useShop();
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());

  // Görünürlük işleyicisi ve yapılandırması FlatList'e verildikten sonra değişemez: bir kez oluşturulur
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = viewableItems.map(v => String(v.key)).filter(k => LAZY.has(k));
    if (ids.length === 0) return;
    setSeen(s => (ids.every(i => s.has(i)) ? s : new Set([...s, ...ids])));
  });
  const [viewConfig] = useState(() => ({ itemVisiblePercentThreshold: 10 }));

  // Başlık listenin üstünde yüzer ve kaydırmayla daralır: kaydırma konumu yerel sürücüyle (JS'e uğramadan) izlenir
  const insets = useSafeAreaInsets();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [onScroll] = useState(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }));
  // Ölçüm gelene kadar hesaplanan yükseklik kullanılır (içerik başlığın altında kalmasın)
  const [measuredH, setMeasuredH] = useState(0);
  const headerH = measuredH || insets.top + HEADER_BASE_H;
  // İçerik, başlığın yuvarlak köşeleri kadar yukarıdan başlar: beyaz yüzey köşelerin altına uzanır
  const topPad = headerH - HEADER_RADIUS;

  // Şerit başlığı gösterilen fiyatla tutarlı olsun: başlığa uymayan ürün gösterilmez
  const budget = useMemo(() => (home?.budget ?? []).filter(p => p.price < BUDGET_MAX), [home]);
  const premium = useMemo(() => (home?.premium ?? []).filter(p => p.price >= PREMIUM_MIN), [home]);
  // "Aus dem Sortiment" her gün başka sırada ve kategoriler dönüşümlü (sepette ve aramada bu şerit yok)
  const best = useMemo(() => (home?.bestSource === 'behavior' ? home.best : dailyMix(home?.best ?? [])), [home]);

  const sections = useMemo<SectionId[]>(() => {
    const out: SectionId[] = ['demo', 'cats', 'banners', 'brands', 'subs'];
    if (home) {
      if (home.deals.length > 0) out.push('deals');
      out.push('best');
      if (budget.length > 0) out.push('budget');
      if (premium.length > 0) out.push('from120');
    } else {
      // Vitrin şeritleri gelmediyse sessizce bitmez: yükleniyor ya da hata + yeniden dene
      out.push('homeState');
    }
    if (recent.length > 0) out.push('recent');
    return out;
  }, [recent.length, home, budget.length, premium.length]);

  const renderItem = ({ item }: { item: SectionId }) => {
    // Demo notu ve kategori daireleri aynı beyaz yüzeyde; yüzey başlık bloğunun yuvarlak köşelerinin altına uzanır
    if (item === 'demo') return <View style={st.topA}><DemoBanner /></View>;
    if (!index) return null;
    switch (item) {
      case 'cats': return <View style={st.topB}><CategoryCircles index={index} visible={seen.has('cats')} /></View>;
      case 'banners': return <Banners index={index} home={home} announcement={config?.announcement ?? ''} visible={seen.has('banners')} />;
      case 'brands': return <BrandRail index={index} />;
      case 'subs': return <SubcategoryShowcase index={index} visible={seen.has('subs')} />;
      case 'homeState': return homeError ? <ErrorBox text={T.loadError} onRetry={homeRetry} /> : <Loading />;
      // "Alle" yalnız gerçek hedefi olan şeritte: indirimli ürünler süzgeci
      case 'deals': return <ProductRail tone="peach" icon="flame" title={T.deals} data={home?.deals ?? []} onAll={() => router.push(href.kategorie('all', { reduziert: true }))} />;
      case 'best': return <ProductRail tone="white" title={bestTitle(home?.bestSource ?? 'curated')} data={best} />;
      case 'budget': return <ProductRail tone="sun" icon="pricetag" title={T.budget} data={budget} />;
      case 'from120': return <ProductRail tone="navy" icon="diamond" title={T.from120} data={premium} />;
      // Son bakılanlar cihazda saklanan anlık görüntüdür: fiyat/durum sunucudan doğrulanır
      case 'recent': return <ProductRail live title={T.recentlyViewed} data={recent} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {error ? (
        <View style={{ paddingTop: headerH }}><ErrorBox text={T.loadError} onRetry={() => { retry(); if (homeError) homeRetry(); }} /></View>
      ) : !index ? (
        <View style={{ paddingTop: headerH }}><Loading /></View>
      ) : (
        <Animated.FlatList
          data={sections}
          keyExtractor={s => s}
          renderItem={renderItem}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          // Alt boşluk: son şeridin kart gölgesi ve sekme çubuğu üstünde nefes payı
          contentContainerStyle={{ paddingTop: topPad, paddingBottom: space.xxl + shadowPad.card }}
        />
      )}
      {/* Başlık en son çizilir: listenin üstünde yüzer, içerik yuvarlak köşelerinin altından kayar */}
      <HomeHeader onSearch={() => router.push(href.suche())} freeShip={freeShip} scrollY={scrollY} onHeight={setMeasuredH} />
    </View>
  );
}

const st = StyleSheet.create({
  topA: { backgroundColor: colors.card, paddingTop: HEADER_RADIUS + space.m },
  topB: {
    backgroundColor: colors.card, paddingTop: space.l, paddingBottom: space.m,
    borderBottomLeftRadius: HEADER_RADIUS, borderBottomRightRadius: HEADER_RADIUS,
  },
});

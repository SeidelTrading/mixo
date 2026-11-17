import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { CategoryDisc } from '../../components/home';
import { CardGroup, ErrorBox, IconButton, IconDisc, ListRow, Loading, PageScroll } from '../../components/ui';
import { categoryIcon } from '../../categoryIcons';
import { scopeKey } from '../../api/shop';
import { useIndex } from '../../hooks';
import { href } from '../../routes';
import { fmt, nProdukte, T } from '../../strings';
import { num } from '../../theme';

// 2. seviye satırı: alt kategori sırası dizindeki sıradır (href.kategorie sub parametresi)
type SubRow = { key: string; label: string; sub?: string; value?: string; a11y?: string; subIndex: number | null };

export default function Kategorien() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: idx, error, retry } = useIndex();
  // Seçili kategori anahtarı; null = 1. seviye
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Android donanım geri tuşu: 2. seviyedeyken 1. seviyeye döner, sekmeden çıkmaz
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (openKey === null) return false;
        setOpenKey(null);
        return true;
      });
      return () => sub.remove();
    }, [openKey]),
  );

  const cat = useMemo(() => (idx && openKey ? idx.cats.find(c => c.k === openKey) ?? null : null), [idx, openKey]);

  const subRows = useMemo<SubRow[]>(() => {
    if (!cat) return [];
    return [
      { key: 'all', label: fmt(T.allIn, { k: cat.label }), value: num(cat.n), a11y: `${fmt(T.allIn, { k: cat.label })}, ${nProdukte(cat.n)}`, subIndex: null },
      ...cat.subs.map((s, i) => ({ key: `s${i}`, label: s.name, value: num(s.n), a11y: `${s.name}, ${nProdukte(s.n)}`, subIndex: i })),
    ];
  }, [cat]);

  // 2. seviyede sekme başlığı kategori adını ve geri okunu taşır (ayrı bir alt başlık çubuğu yok)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: cat ? cat.label : T.tabKategorien,
      headerLeft: cat ? () => <IconButton icon="arrow-back" label={T.a11yBack} onPress={() => setOpenKey(null)} /> : undefined,
    });
  }, [navigation, cat]);

  if (error) return <ErrorBox text={T.categoriesLoadError} onRetry={retry} />;
  if (!idx) return <Loading />;

  if (cat) {
    const ci = idx.cats.indexOf(cat);
    return (
      <PageScroll key={cat.k} bottomInset={false}>
        <CardGroup divider={16 + 44 + 12}>
          {subRows.map(r => (
            <ListRow
              key={r.key}
              label={r.label}
              sub={r.sub}
              value={r.value}
              // "Alle in …" üst kapsam: lila diskte kategori ikonu (alt kategorilerin görseliyle karışmaz);
              // alt kategori satırlarında kendi 0. parçasından temsilci ürün görseli
              leading={r.subIndex === null
                ? <IconDisc icon={categoryIcon(cat.k)} tint="lilac" size={44} />
                : <CategoryDisc scope={scopeKey(cat.k, r.subIndex)} i={r.subIndex + ci} size={44} />}
              height={64}
              accessibilityLabel={r.a11y}
              onPress={() => router.push(href.kategorie(cat.k, r.subIndex === null ? undefined : { sub: r.subIndex }))}
            />
          ))}
        </CardGroup>
      </PageScroll>
    );
  }

  const showOffers = (idx.facets.all?.sale ?? 0) > 0;
  return (
    <PageScroll bottomInset={false}>
      {/* Satırın baş öğesi ana sayfadaki kategori diski (pastel disk + temsilci ürün görseli) */}
      <CardGroup divider={16 + 52 + 12}>
        {idx.cats.map((item, i) => (
          <ListRow
            key={item.k}
            label={item.label}
            sub={nProdukte(item.n)}
            leading={<CategoryDisc scope={item.k} i={i} size={52} />}
            height={72}
            onPress={() => setOpenKey(item.k)}
          />
        ))}
      </CardGroup>
      {showOffers ? (
        <CardGroup>
          <ListRow
            label={T.offers}
            icon="pricetag-outline"
            tint="peach"
            height={64}
            onPress={() => router.push(href.kategorie('all', { reduziert: true }))}
          />
        </CardGroup>
      ) : null}
    </PageScroll>
  );
}

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exactName, nearestName, suggest, topBrandPairs, type Index, type Suggestion } from '../api/shop';
import { categoryIcon } from '../categoryIcons';
import { FilterBar, FilterSheet, SortSheet, type FilterGroupId } from '../components/listing';
import {
  Btn,
  CardGroup,
  ConfirmDialog,
  GroupTitle,
  EmptyState,
  ErrorBox,
  IconButton,
  ListRow,
  ProductGrid,
  SkeletonGrid,
  ProductRail,
  ProgressBar,
  ScreenHeader,
} from '../components/ui';
import { EMPTY_FILTERS, activeFilterCount, applyFilters, brandGroupForResults, sortRows, type ListFilters, type SortKey } from '../filters';
import { useCatalogScan, useIndex } from '../hooks';
import { href, hrefForSuggestion } from '../routes';
import { useShop } from '../store/shopStore';
import { fmt, hitsPartialLabel, nErgebnisse, nProdukte, T } from '../strings';
import { colors, fonts, num, radius, shadow, space, typo } from '../theme';

/** Öneri satırı için ikon: marka etiket, alt kategori albüm, kategori kendi ikonu */
const sugIcon = (s: Suggestion) =>
  s.kind === 'marke' ? ('pricetag-outline' as const) : s.kind === 'unterkategorie' ? ('albums-outline' as const) : categoryIcon(s.key);

const sugKey = (s: Suggestion) =>
  s.kind === 'marke' ? `m:${s.marke}:${s.key}:${s.sub ?? ''}` : s.kind === 'unterkategorie' ? `u:${s.key}:${s.sub}` : `k:${s.key}`;

/** Alt kategori önerisinin yalnız alt kategori adı ("Uhren › Herrenuhren" → "Herrenuhren"). */
const subName = (s: Suggestion) => (s.kind === 'unterkategorie' ? s.label.split('›').pop()!.trim() : s.label);

/** Son arama kapsülü: yazıya dokun = yeniden ara; sağdaki çarpı = bu kaydı sil (her iki alan 44 dp). */
function RecentChip({ label, onPress, onRemove }: { label: string; onPress: () => void; onRemove: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
        backgroundColor: colors.card,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.lineSoft,
        ...shadow.soft,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: space.m, justifyContent: 'center' }}
      >
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: colors.text, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={fmt(T.a11yRemoveSearch, { q: label })}
        style={{ width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Durum satırının sağındaki metin eylemi ("Abbrechen" / "Fortsetzen"): mavi yarı kalın, 44 dp dokunma alanı. */
function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Boş aramada ve sonuçsuz aramada aynı keşif bloğu: son aramalar (silinebilir kapsüller) ve ürün sayısı en büyük markalar
 * (marka satır başlığı, kategori alt yazı, kategori ikonu).
 */
function Discover({ idx, searches, onSearch, onRemove, onClear }: {
  idx: Index | undefined; searches: string[]; onSearch: (q: string) => void; onRemove: (q: string) => void; onClear: () => void;
}) {
  const router = useRouter();
  const pairs = useMemo(() => (idx ? topBrandPairs(idx, 8) : []), [idx]);
  const exact = idx?.facetsExact ?? false;
  return (
    <>
      {searches.length > 0 ? (
        <View style={{ marginHorizontal: space.l }}>
          <GroupTitle title={T.recentSearches} action={{ label: T.clearHistory, onPress: onClear }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s }}>
            {searches.slice(0, 10).map(r => (
              <RecentChip key={r} label={r} onPress={() => onSearch(r)} onRemove={() => onRemove(r)} />
            ))}
          </View>
        </View>
      ) : null}
      {pairs.length > 0 ? (
        <CardGroup title={T.topBrands}>
          {pairs.map(p => (
            <ListRow
              key={`${p.key}:${p.marke}`}
              label={p.marke}
              sub={exact ? `${p.catLabel} · ${nProdukte(p.n)}` : p.catLabel}
              icon={categoryIcon(p.key)}
              tint="sun"
              onPress={() => router.push(href.kategorie(p.key, { marke: p.marke }))}
            />
          ))}
        </CardGroup>
      ) : null}
    </>
  );
}

export default function Suche() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { q: qRaw } = useLocalSearchParams<{ q?: string | string[] }>();
  const qParam = (Array.isArray(qRaw) ? qRaw[0] : qRaw)?.trim() ?? '';

  const { searches, addSearch, removeSearch, clearSearches, recent } = useShop();
  const index = useIndex();
  const scan = useCatalogScan();
  const { start: scanStart } = scan;

  const [text, setText] = useState(qParam);
  const [hint, setHint] = useState(false); // < 2 harf gönderildi
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('standard');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState<FilterGroupId | undefined>(undefined);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Android'de yığın geçişi sırasında autoFocus klavyeyi açmayabilir: kısa gecikmeyle odakla
  // Yalnız ilk odakta ve gönderilmiş arama yokken: üründen dönünce klavye sonuçların üstüne açılmasın
  const didAutoFocus = useRef(false);
  const hasQueryRef = useRef(false);
  useEffect(() => { hasQueryRef.current = scan.query !== '' || qParam.length >= 2; });
  useFocusEffect(
    useCallback(() => {
      if (didAutoFocus.current || hasQueryRef.current) return;
      const t = setTimeout(() => {
        didAutoFocus.current = true;
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }, []),
  );

  const submit = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (t.length < 2) {
        setHint(true);
        return;
      }
      setHint(false);
      Keyboard.dismiss(); // sonuçlar açılırken klavye kapanır (son aramaya dokununca da)
      setText(t);
      setFilters(EMPTY_FILTERS);
      setSort('standard');
      addSearch(t);
      scanStart(t);
    },
    [addSearch, scanStart],
  );

  // ?q= ile gelindiğinde giriş dolar ve tarama başlar (durum güncellemesi efektin dışına ertelenir)
  useEffect(() => {
    if (qParam.length >= 2) queueMicrotask(() => submit(qParam));
  }, [qParam, submit]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.navigate(href.start());
  };

  const q = text.trim();
  const submitted = scan.query !== '' && q === scan.query;
  const idx = index.data;
  const exact = idx?.facetsExact ?? false;
  const showSale = (idx?.facets.all?.sale ?? 0) > 0;

  const { complete, percent, results, stopped } = scan;
  const running = scan.busy && !stopped;
  const effSort: SortKey = complete ? sort : 'standard';
  const filterCount = activeFilterCount(filters);
  const shown = useMemo(() => {
    const filtered = filterCount > 0 ? applyFilters(results, filters) : results;
    return effSort === 'standard' ? filtered : sortRows(filtered, effSort);
  }, [results, filters, filterCount, effSort]);

  const brands = useMemo(() => brandGroupForResults(results, percent), [results, percent]);

  const didYouMean = useMemo(
    () => (submitted && idx && complete && !scan.error && results.length === 0 ? nearestName(idx, scan.query) : null),
    [submitted, idx, complete, scan.error, scan.query, results.length],
  );
  // Sorgu bir marka/kategori adıyla birebir aynıysa sonuçların başında o kapsama kısa yol
  const exactHit = useMemo(() => (submitted && idx ? exactName(idx, scan.query) : null), [submitted, idx, scan.query]);

  const sugs = useMemo(() => (idx && !submitted && q.length >= 2 ? suggest(idx, q) : []), [idx, submitted, q]);

  const onChangeText = (v: string) => {
    setText(v);
    setHint(false);
  };
  const clearInput = () => {
    setText('');
    setHint(false);
    scan.reset();
    inputRef.current?.focus();
  };

  const discover = (
    <Discover idx={idx} searches={searches} onSearch={submit} onRemove={removeSearch} onClear={() => setConfirmClear(true)} />
  );

  const confirmDialog = (
    <ConfirmDialog
      visible={confirmClear}
      title={T.clearSearchHistory}
      text={T.clearSearchHistoryConfirm}
      confirmLabel={T.delete}
      destructive
      onConfirm={() => {
        clearSearches();
        setConfirmClear(false);
      }}
      onCancel={() => setConfirmClear(false)}
    />
  );

  /* ───── başlık satırı: ortak marka başlığı, içinde beyaz arama alanı ───── */
  const header = (
    <ScreenHeader onBack={goBack}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: radius.m,
          paddingLeft: space.m,
          minHeight: 44,
          marginRight: space.m,
        }}
      >
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={() => submit(text)}
          placeholder={T.searchPlaceholder}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={T.a11ySearchInput}
          style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: space.s }}
        />
        {text.length > 0 ? <IconButton icon="close-circle" label={T.a11yClearInput} onPress={clearInput} color={colors.muted} /> : null}
      </View>
    </ScreenHeader>
  );

  /* ───── gönderilmiş: sonuçlar (katalog kendiliğinden sonuna kadar taranır, isabetler akarak gelir) ───── */
  if (submitted) {
    let empty: React.ReactElement | null = null;
    if (complete && !scan.error && shown.length === 0) {
      empty = results.length > 0 ? (
        <EmptyState
          title={T.noProducts}
          icon="search"
          tint="sun"
          action={{ label: T.resetFilters, onPress: () => setFilters(EMPTY_FILTERS) }}
        />
      ) : (
        <View style={{ gap: 12, paddingBottom: space.l }}>
          <EmptyState
            title={fmt(T.noHits, { q: scan.query })}
            text={T.noHitsText}
            icon="search"
            tint="sun"
            action={
              didYouMean
                ? { label: fmt(T.didYouMean, { name: subName(didYouMean) }), onPress: () => router.push(hrefForSuggestion(didYouMean)) }
                : { label: T.showCategories, icon: 'grid-outline', onPress: () => router.navigate(href.kategorien()) }
            }
          >
            {didYouMean ? <Btn kind="ghost" label={T.showCategories} onPress={() => router.navigate(href.kategorien())} /> : null}
          </EmptyState>
          {discover}
        </View>
      );
    }

    let footer: React.ReactElement | null = null;
    if (scan.error) footer = <ErrorBox text={T.loadError} onRetry={scan.resume} />;
    else if (running && results.length === 0) footer = <SkeletonGrid />;

    // Tek durum satırı: çalışırken yüzde + ince çubuk + "Abbrechen"; durdurulunca etiketli kısmi sayı + "Fortsetzen"; bitince yalnız sonuç sayısı
    let status: React.ReactElement | null = null;
    if (complete) {
      status = shown.length > 0 ? <Text style={[typo.h3, { color: colors.text }]}>{nErgebnisse(shown.length)}</Text> : null;
    } else if (running) {
      status = (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Text style={[typo.meta, { flex: 1 }]}>{fmt(T.searchRunning, { p: num(percent) })}</Text>
            <TextAction label={T.cancel} onPress={scan.stop} />
          </View>
          <ProgressBar value={percent / 100} />
        </>
      );
    } else if (stopped) {
      const stopText = fmt(T.searchStopped, { p: num(percent) });
      status = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Text style={[typo.meta, { flex: 1 }]}>{results.length > 0 ? `${hitsPartialLabel(results.length)} · ${stopText}` : stopText}</Text>
          <TextAction label={T.searchResume} onPress={scan.resume} />
        </View>
      );
    }
    const partialNote = !complete && filterCount > 0 ? fmt(T.filterPartial, { p: num(percent) }) : null;

    // Birebir marka/kategori adı: kapsamın tam listesine kısa yol (güneş disk)
    const brandAllN = exactHit?.kind === 'marke' ? idx?.facets.all?.b.find(([m]) => m === exactHit.marke)?.[1] : undefined;
    const exactRow = exactHit ? (
      <View style={{ paddingTop: space.m, paddingBottom: space.xs }}>
        <CardGroup>
          <ListRow
            label={exactHit.kind === 'marke' ? fmt(T.allFromBrand, { m: exactHit.marke }) : fmt(T.allInScope, { k: subName(exactHit) })}
            sub={exactHit.kind === 'marke' ? (brandAllN !== undefined && exact ? nProdukte(brandAllN) : undefined) : nProdukte(exactHit.n)}
            icon={exactHit.kind === 'marke' ? 'pricetag-outline' : categoryIcon(exactHit.key)}
            tint="sun"
            onPress={() => router.push(exactHit.kind === 'marke' ? href.kategorie('all', { marke: exactHit.marke }) : hrefForSuggestion(exactHit))}
          />
        </CardGroup>
      </View>
    ) : null;

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        {results.length > 0 ? (
          <FilterBar
            filters={filters}
            onChange={setFilters}
            onOpenFilter={f => {
              setFocus(f);
              setFilterOpen(true);
            }}
            sort={effSort}
            onOpenSort={() => setSortOpen(true)}
            sortDisabled={!complete}
            showSale={showSale}
          />
        ) : null}
        {status || partialNote ? (
          <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.xs, gap: 6 }} accessibilityLiveRegion="polite">
            {status}
            {partialNote ? <Text style={typo.meta}>{partialNote}</Text> : null}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <ProductGrid data={shown} header={exactRow} empty={empty} footer={footer} />
        </View>

        <SortSheet
          visible={sortOpen}
          value={effSort}
          onSelect={setSort}
          onClose={() => setSortOpen(false)}
          priceBlockedReason={complete ? null : T.sortAfterFull}
        />
        <FilterSheet
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          value={filters}
          onApply={setFilters}
          focus={focus}
          subs={null}
          brands={brands}
          priceFacet={null}
          showSale={showSale}
          preview={d => ({
            matched: applyFilters(results, d).length,
            loaded: results.length,
            complete,
            note: complete ? undefined : fmt(T.hitsPartialSearch, { n: num(applyFilters(results, d).length), p: num(percent) }),
          })}
          scanNote={complete ? null : fmt(T.filterPartial, { p: num(percent) })}
        />
        {confirmDialog}
      </View>
    );
  }

  /* ───── boş giriş / yazarken ───── */
  const cats = sugs.filter(s => s.kind !== 'marke');
  const marken = sugs.filter(s => s.kind === 'marke');
  const typing = q.length >= 2;
  const catLabel = (k: string) => idx?.cats.find(c => c.k === k)?.label ?? '';

  // Öneri satırı: pastel ikon diski (kategori lila, alt kategori şeftali, marka güneş); marka başlık, kategori alt yazı
  const sugRow = (s: Suggestion) => (
    <ListRow
      key={sugKey(s)}
      label={s.label}
      sub={
        s.kind === 'marke'
          ? (exact ? `${catLabel(s.key)} · ${nProdukte(s.n)}` : catLabel(s.key))
          : nProdukte(s.n)
      }
      icon={sugIcon(s)}
      tint={s.kind === 'marke' ? 'sun' : s.kind === 'unterkategorie' ? 'peach' : 'lilac'}
      onPress={() => router.push(hrefForSuggestion(s))}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: space.l, gap: 12, paddingBottom: space.xl + insets.bottom }}
      >
        {hint ? (
          <View style={{ marginHorizontal: space.l, flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: colors.peach, borderRadius: radius.m, padding: space.m }}>
            <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
            <Text style={[typo.small, { flex: 1, color: colors.text }]}>{T.min2}</Text>
          </View>
        ) : null}

        {typing ? (
          <>
            {/* İlk satır her zaman aramanın kendisi: eşleşen ad olmasa da tek dokunuşla katalogda aranır */}
            <CardGroup>
              <ListRow label={fmt(T.searchFor, { q })} icon="search" tint="sun" onPress={() => submit(text)} />
            </CardGroup>
            {cats.length > 0 ? <CardGroup title={T.sugCategories}>{cats.map(sugRow)}</CardGroup> : null}
            {marken.length > 0 ? <CardGroup title={T.sugBrands}>{marken.map(sugRow)}</CardGroup> : null}
          </>
        ) : (
          discover
        )}

        {/* Yazılmış bir sorgunun altında ilgisiz ürün gösterilmez; boş girişte yalnız gerçek "Zuletzt angesehen" */}
        {text.length === 0 && recent.length > 0 ? <ProductRail live title={T.recentlyViewed} data={recent} /> : null}
      </ScrollView>
      {confirmDialog}
    </View>
  );
}

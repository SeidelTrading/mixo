import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { scopeInfo, scopeKey, type Index, type ScopeInfo } from '../../api/shop';
import { SubCircles } from '../../components/home';
import { Btn, EmptyState, ErrorBox, Loading, ProductGrid, SearchBox, SkeletonGrid } from '../../components/ui';
import { CountLine, FilterBar, FilterSheet, ScopeBand, SortSheet, type FilterGroupId } from '../../components/listing';
import { AUTOLOAD_MAX_CHUNKS, PAGE, SORT_CHUNK_LIMIT } from '../../config';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyFilters,
  brandGroupForScope,
  countLine,
  sortRows,
  type ListFilters,
  type SortKey,
} from '../../filters';
import { useIndex, useScopeList } from '../../hooks';
import { href, parseKategorieParams } from '../../routes';
import { T, fmt } from '../../strings';
import { colors } from '../../theme';

/** Dış ekran: parametreleri çözer, dizini bekler; iç bileşen kapsam/süzgeç başlangıcı değişince yeniden kurulur. */
export default function KategorieScreen() {
  const raw = useLocalSearchParams();
  const router = useRouter();
  const win = useWindowDimensions();
  const p = parseKategorieParams(raw);
  const { data: idx, error, retry } = useIndex();
  const scope = scopeKey(p.key, p.sub);
  const info = idx ? scopeInfo(idx, scope) : null;

  const options = {
    title: info?.label ?? T.category,
    headerTitle: () => (
      <View style={{ width: Math.max(160, win.width - 120) }}>
        <SearchBox onPress={() => router.push(href.suche())} />
      </View>
    ),
  };

  let body: React.ReactElement;
  if (error) body = <ErrorBox text={T.loadError} onRetry={retry} />;
  else if (!idx) body = <Loading />;
  else if (!info) {
    // Bilinmeyen kapsam çıkmaz sokak olmasın: kategori listesine yönlendir
    body = (
      <View>
        <ErrorBox text={T.scopeUnknown} />
        <View style={{ paddingHorizontal: 16 }}>
          <Btn label={T.chooseCategory} kind="ghost" onPress={() => router.navigate(href.kategorien())} />
        </View>
      </View>
    );
  }
  else {
    body = (
      <KategorieListe
        key={`${scope}|${p.marke ?? ''}|${p.reduziert}`}
        idx={idx}
        info={info}
        marke={p.marke}
        reduziert={p.reduziert}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={options} />
      {body}
    </View>
  );
}

function KategorieListe({ idx, info, marke, reduziert }: { idx: Index; info: ScopeInfo; marke: string | null; reduziert: boolean }) {
  const router = useRouter();
  const list = useScopeList(info.scope);
  const { rows, complete, loading, error } = list;

  const [filters, setFilters] = useState<ListFilters>(() => ({
    ...EMPTY_FILTERS,
    brands: marke ? [marke] : [],
    onlySale: reduziert,
  }));
  const [sort, setSort] = useState<SortKey>('standard');
  const [shown, setShown] = useState(PAGE);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState<FilterGroupId | undefined>(undefined);

  const filtersActive = activeFilterCount(filters) > 0;
  const showSale = (info.facet?.sale ?? 0) > 0;
  // Fiyat sıralaması yalnız kapsam tamamen yüklendiğinde uygulanır
  const sortActive = sort !== 'standard' && complete;
  const sorting = sort !== 'standard' && !complete;

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const sorted = useMemo(() => sortRows(filtered, sortActive ? sort : 'standard'), [filtered, sort, sortActive]);

  // ?marke= ile gelinen markanın dizindeki sayısı (yoksa undefined)
  const brandN = marke ? info.facet?.b.find(([name]) => name === marke)?.[1] : undefined;
  // Yalnız marka süzgeci (parametredeki marka): yükleme hedefi dizindeki marka sayısıdır (gizli ürünler varsa yaklaşık)
  const brandOnly = !!marke && filters.brands.length === 1 && filters.brands[0] === marke && !filters.price && !filters.onlyAvail && !filters.onlySale;
  const brandGoal = marke && brandOnly && brandN !== undefined ? { marke, n: brandN } : null;
  // Sayı satırında "{x} von {n}" yalnız sayı kesinse (facetsExact); değilse "unter … geladenen" etiketi kalır
  const brandEntry = brandGoal && idx.facetsExact ? brandGoal : null;

  const matchCount = (r: typeof rows) => applyFilters(r, filters).length;

  const loadForward = (extra = PAGE) => {
    const target = shown + extra;
    if (!filtersActive) list.loadMore();
    else if (brandGoal) list.loadUntil(r => matchCount(r) >= target || matchCount(r) >= brandGoal.n);
    // Yalnız gelinen marka, sayısı dizinde yok (ilk 16 dışında): sayfa dolana kadar parça sınırı olmadan yüklenir
    else if (brandOnly) list.loadUntil(r => matchCount(r) >= target);
    else list.loadUntil(r => matchCount(r) >= target, AUTOLOAD_MAX_CHUNKS);
  };
  const loadForwardRef = useRef(loadForward);
  useEffect(() => { loadForwardRef.current = loadForward; });

  // Süzgeçli liste ilk sayfayı dolduramıyorsa (ör. ?marke= ile gelindi, ilk parçada 2 eşleşme) her süzgeç durumu için
  // BİR kez kendiliğinden en çok AUTOLOAD_MAX_CHUNKS parça yüklenir; sonra "Weitere Produkte laden" düğmesi kalır.
  // onEndReached kısa listede güvenilir tetiklenmez. Efekt yalnız dış yükleyiciyi çağırır (eşzamanlı setState yok).
  const autoFilled = useRef<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const needsFill = filtersActive && !complete && !loading && !error && !sorting && rows.length > 0 && sorted.length < shown;
  useEffect(() => {
    if (!needsFill || autoFilled.current === filterKey) return;
    autoFilled.current = filterKey;
    loadForwardRef.current(0);
  }, [needsFill, filterKey]);

  const onEnd = () => {
    if (shown < sorted.length) {
      setShown(s => s + PAGE);
    } else if (!complete && !loading && !sorting && !error) {
      if (brandGoal && sorted.length >= brandGoal.n) return;
      loadForward();
      setShown(s => s + PAGE);
    }
  };

  const brandDone = !!brandGoal && sorted.length >= brandGoal.n;
  const loadMoreBtn = filtersActive && !complete && !loading && !sorting && !brandDone ? (
    <View style={{ padding: 16 }}>
      <Btn label={T.loadMoreProducts} kind="ghost" onPress={() => { loadForward(); setShown(s => s + PAGE); }} />
    </View>
  ) : null;

  const priceBlocked = info.chunks > SORT_CHUNK_LIMIT;
  const blockedReason = priceBlocked ? (info.key === 'all' ? T.sortNeedsCat : T.sortNeedsSub) : null;
  const blockedAction = priceBlocked
    ? info.key === 'all'
      ? { label: T.chooseCategory, onPress: () => router.navigate(href.kategorien()) }
      : { label: T.chooseSub, onPress: () => { setFocus('unterkategorie'); setFilterOpen(true); } }
    : null;

  const selectSort = (k: SortKey) => {
    setSort(k);
    setShown(PAGE);
    if (k !== 'standard' && !complete) {
      list.loadAll().then(ok => { if (!ok) setSort(s => (s === k ? 'standard' : s)); });
    }
  };

  const brandList = brandGroupForScope(info.facet, idx.facetsExact, rows, complete, filters.brands);
  const catSubs = idx.cats.find(c => c.k === info.key)?.subs ?? [];
  const subs = info.key !== 'all' && catSubs.length > 0
    ? {
        items: catSubs,
        selected: info.sub,
        onSelect: (sub: number | null) => router.replace(href.kategorie(info.key, { sub, marke: filters.brands.length === 1 ? filters.brands[0] : null, reduziert: filters.onlySale })),
      }
    : null;

  const count = countLine({ matched: filtered.length, filtersActive, complete, brandEntry });
  // Üst kategoride alt kategori daireleri (ana sayfadaki kısayol dili); alt kategori ve "all" kapsamında yok
  const catIndex = idx.cats.findIndex(c => c.k === info.key);
  const circles = info.sub === null && catIndex >= 0 && idx.cats[catIndex].subs.length > 1
    ? <SubCircles cat={idx.cats[catIndex]} ci={catIndex} />
    : null;

  const initial = rows.length === 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ zIndex: 1 }}>
        <FilterBar
          filters={filters}
          onChange={f => { setFilters(f); setShown(PAGE); }}
          onOpenFilter={f => { setFocus(f); setFilterOpen(true); }}
          sort={sort}
          onOpenSort={() => setSortOpen(true)}
          showSale={showSale}
        />
        {sorting ? <CountLine progress={list.progress} progressLabel={fmt(T.loadingAll, { p: Math.round(list.progress * 100) })} /> : null}
      </View>
      {error && initial ? (
        <ErrorBox text={T.loadError} onRetry={list.retry} />
      ) : (
        <View style={{ flex: 1 }}>
          <ProductGrid
            data={sorted.slice(0, shown)}
            onEnd={onEnd}
            header={
              <View>
                <ScopeBand label={info.label} n={info.n} facet={info.facet} showRange={idx.facetsExact} count={count} />
                {circles}
              </View>
            }
            empty={
              loading ? <SkeletonGrid /> : (
                <EmptyState
                  icon="search"
                  tint="sun"
                  title={T.noProducts}
                  action={filtersActive ? { label: T.resetFilters, onPress: () => { setFilters(EMPTY_FILTERS); setShown(PAGE); } } : undefined}
                >
                  {!complete && !error ? (
                    <Btn label={T.loadMoreProducts} kind="ghost" onPress={() => { loadForward(); setShown(s => s + PAGE); }} />
                  ) : null}
                </EmptyState>
              )
            }
            footer={
              loading && !initial ? <Loading /> : error ? <ErrorBox text={T.loadError} onRetry={list.retry} /> : sorted.length > 0 ? loadMoreBtn : null
            }
          />
        </View>
      )}
      <SortSheet
        visible={sortOpen}
        value={sort}
        onSelect={selectSort}
        onClose={() => setSortOpen(false)}
        priceBlockedReason={blockedReason}
        blockedAction={blockedAction}
      />
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={f => { setFilters(f); setShown(PAGE); }}
        focus={focus}
        subs={subs}
        brands={brandList}
        priceFacet={info.facet}
        showSale={showSale}
        preview={d => ({ matched: applyFilters(rows, d).length, loaded: rows.length, complete })}
      />
    </View>
  );
}

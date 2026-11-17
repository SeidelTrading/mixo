import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { Facet, SubCategory } from '../api/shop';
import { PRICE_RANGES } from '../config';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  priceRangesFor,
  showButtonLabel,
  type BrandGroup,
  type ListFilters,
  type SortKey,
} from '../filters';
import { fmt, nProdukte, priceRangeLabel, T } from '../strings';
import { colors, eur, fonts, num, radius, shadow, space, typo } from '../theme';
import { BottomBar, BottomSheet, Btn, CardGroup, Chip, ChoiceRow, IconButton, ProgressBar, ScreenHeader } from './ui';

export type FilterGroupId = 'unterkategorie' | 'marke' | 'preis' | 'verfuegbarkeit' | 'reduziert';

/* ───── çubuk ───── */

/** Yatay çubuk: [Filter + sayaç] [Sortieren] + kapsüller Marke, Preis, Nur verfügbar, (Reduziert). */
export function FilterBar({ filters, onChange, onOpenFilter, sort, onOpenSort, sortDisabled, showSale }: {
  filters: ListFilters;
  onChange: (f: ListFilters) => void;
  onOpenFilter: (focus?: FilterGroupId) => void;
  sort: SortKey;
  onOpenSort: () => void;
  sortDisabled?: boolean;
  showSale: boolean;
}) {
  const count = activeFilterCount(filters);
  const range = PRICE_RANGES.find(r => r.id === filters.price);
  const priceLabel = range ? priceRangeLabel(range) : T.price;
  const sorted = sort !== 'standard';
  // Etkin sıralama kapsülün kendisinde okunur ("Preis ↑" / "Preis ↓")
  const sortLabel = sort === 'preis-auf' ? T.sortAscShort : sort === 'preis-ab' ? T.sortDescShort : T.sort;
  return (
    // Beyaz yapışık şerit: sis zemin üstünde ayrışır, kapsüller 44 dp yükseklikte
    <View style={st.barWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Yatay ScrollView sütun düzeninde boş dikey alanı doldurmasın (aramada başlık ile çubuk arası boşluk)
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingVertical: space.s, alignItems: 'center' }}
      >
        <Pressable
          onPress={() => onOpenFilter()}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `${T.filter} (${count})` : T.filter}
          style={[st.barBtn, count > 0 && st.barBtnOn]}
        >
          <Ionicons name="options-outline" size={20} color={count > 0 ? colors.onPrimary : colors.primary} />
          <Text style={[st.barTxt, { color: count > 0 ? colors.onPrimary : colors.text }]}>{T.filter}</Text>
          {count > 0 ? <View style={st.barCount}><Text style={st.barCountTxt}>{count}</Text></View> : null}
        </Pressable>
        <Pressable
          onPress={onOpenSort}
          disabled={sortDisabled}
          accessibilityRole="button"
          accessibilityLabel={sorted ? `${T.sort}: ${sort === 'preis-auf' ? T.sortAsc : T.sortDesc}` : T.sort}
          accessibilityState={{ disabled: !!sortDisabled, selected: sorted }}
          style={[st.barBtn, sorted && st.barBtnOn, sortDisabled && { opacity: 0.4 }]}
        >
          <Ionicons name="swap-vertical-outline" size={20} color={sorted ? colors.onPrimary : colors.primary} />
          <Text style={[st.barTxt, { color: sorted ? colors.onPrimary : colors.text }]}>{sortLabel}</Text>
        </Pressable>
        <BarChip
          label={filters.brands.length ? `${T.brand} (${filters.brands.length})` : T.brand}
          active={filters.brands.length > 0}
          onPress={() => onOpenFilter('marke')}
        />
        <BarChip label={priceLabel} active={filters.price !== null} onPress={() => onOpenFilter('preis')} />
        <BarChip
          label={T.onlyAvailable}
          active={filters.onlyAvail}
          onPress={() => onChange({ ...filters, onlyAvail: !filters.onlyAvail })}
        />
        {showSale ? (
          <BarChip label={T.reduced} active={filters.onlySale} onPress={() => onChange({ ...filters, onlySale: !filters.onlySale })} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Çubuk kapsülü: 44 dp yükseklik (ortak Chip 36 dp; çubuk daha rahat dokunma ister). */
function BarChip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[st.barBtn, active && st.barBtnOn]}
    >
      <Text style={[st.barTxt, { color: active ? colors.onPrimary : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/* ───── sıralama ───── */

const SORT_OPTIONS: { key: SortKey; label: string; price: boolean }[] = [
  { key: 'standard', label: T.sortStandard, price: false },
  { key: 'preis-auf', label: T.sortAsc, price: true },
  { key: 'preis-ab', label: T.sortDesc, price: true },
];

export function SortSheet({ visible, value, onSelect, onClose, onDismiss, priceBlockedReason, blockedAction }: {
  visible: boolean; value: SortKey;
  onSelect: (k: SortKey) => void; onClose: () => void;
  onDismiss?: () => void;
  priceBlockedReason?: string | null;
  blockedAction?: { label: string; onPress: () => void } | null;
}) {
  const pending = useRef<(() => void) | null>(null);
  const flush = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={T.sort}
      onDismiss={() => {
        flush();
        onDismiss?.();
      }}
    >
      <View>
        {SORT_OPTIONS.map(o => (
          <ChoiceRow
            key={o.key}
            label={o.label}
            selected={value === o.key}
            disabled={o.price && !!priceBlockedReason}
            onPress={() => {
              onSelect(o.key);
              onClose();
            }}
          />
        ))}
        {priceBlockedReason ? (
          <View style={{ paddingTop: space.m, gap: space.s }}>
            <Text style={[typo.rowSub, { fontSize: 14, lineHeight: 20 }]}>{priceBlockedReason}</Text>
            {blockedAction ? (
              <Btn
                kind="ghost"
                label={blockedAction.label}
                onPress={() => {
                  pending.current = blockedAction.onPress;
                  onClose();
                  // iOS'ta onDismiss çalıştırır; diğer platformlarda kapanıştan hemen sonra
                  if (Platform.OS !== 'ios') setTimeout(flush, 0);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/* ───── süzgeç katmanı ───── */

/** Süzgeç grubu başlığı: Fraunces (bölüm başlıklarıyla aynı aile, katmanda bir adım küçük), altında isteğe bağlı soluk not. */
function GroupTitle({ children, note }: { children: string; note?: string | null }) {
  return (
    <View style={{ paddingTop: space.xl, paddingBottom: space.s, gap: 2 }}>
      <Text style={[typo.title, { fontSize: 20, lineHeight: 26 }]} accessibilityRole="header">{children}</Text>
      {note ? <Text style={typo.rowSub}>{note}</Text> : null}
    </View>
  );
}

export function FilterSheet({ visible, onClose, value, onApply, focus, subs, brands, priceFacet, showSale, preview, scanNote }: {
  visible: boolean; onClose: () => void;
  value: ListFilters; onApply: (f: ListFilters) => void;
  focus?: FilterGroupId;
  subs?: { items: SubCategory[]; selected: number | null; onSelect: (sub: number | null) => void } | null;
  brands: BrandGroup;
  priceFacet: Facet | null;
  showSale: boolean;
  preview: (draft: ListFilters) => { matched: number; loaded: number; complete: boolean; note?: string };
  scanNote?: string | null;
}) {
  const [draft, setDraft] = useState<ListFilters>(value);
  const [wasVisible, setWasVisible] = useState(visible);
  // Açılırken taslak uygulanmış değerden başlar (render sırasında durum eşitleme)
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [ys] = useState<Partial<Record<FilterGroupId, number>>>(() => ({})); // grup y konumları (olay işleyicilerinde yazılır)
  const mark = (id: FilterGroupId) => (e: { nativeEvent: { layout: { y: number } } }) => {
    ys[id] = e.nativeEvent.layout.y;
  };

  const toggleBrand = (name: string) =>
    setDraft(d => ({ ...d, brands: d.brands.includes(name) ? d.brands.filter(b => b !== name) : [...d.brands, name] }));

  const pv = preview(draft);
  // Süzgeç yokken "500 Treffer unter 500 geladenen" gibi anlamsız kısmi not yazılmaz
  const label = activeFilterCount(draft) === 0 && !pv.complete
    ? { button: T.show, note: null }
    : { ...showButtonLabel(pv.matched, pv.complete), ...(pv.note && !pv.complete ? { note: pv.note } : {}) };
  const ranges = priceRangesFor(priceFacet);
  const brandText = (b: { name: string; n: number | null }) => (b.n == null ? b.name : `${b.name} (${num(b.n)})`);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      // Android kenardan kenara: katman durum ve gezinme çubuğunun altına kadar uzanır; boşluklar insets ile
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => {
        const y = focus ? ys[focus] : undefined;
        if (y != null) scroller.current?.scrollTo({ y, animated: false });
      }}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Tam ekran katman: ekranlarla aynı mavi marka başlığı, sağda kapat */}
        <ScreenHeader title={T.filter} right={<IconButton icon="close" label={T.close} onPress={onClose} />} />

        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          {scanNote ? (
            <View style={{ backgroundColor: colors.warn, borderRadius: radius.m, padding: space.m, marginTop: space.l }}>
              <Text style={[typo.small, { color: colors.warnText }]}>{scanNote}</Text>
            </View>
          ) : null}

          {subs && subs.items.length > 0 ? (
            <View onLayout={mark('unterkategorie')}>
              <GroupTitle>{T.subcategory}</GroupTitle>
              {/* Seçenekler beyaz kartta (sis zemin üstünde), satırlar arası ince çizgi */}
              <CardGroup style={st.sheetCard} divider={space.l}>
                <ChoiceRow inCard label={T.allSubs} selected={subs.selected === null} onPress={() => { subs.onSelect(null); onClose(); }} />
                {subs.items.map((it, i) => (
                  <ChoiceRow
                    inCard
                    key={it.name}
                    label={it.name}
                    value={num(it.n)}
                    selected={subs.selected === i}
                    onPress={() => { subs.onSelect(i); onClose(); }}
                  />
                ))}
              </CardGroup>
            </View>
          ) : null}

          <View onLayout={mark('marke')}>
            <GroupTitle note={brands.note}>{T.brand}</GroupTitle>
            <View style={st.wrap}>
              {brands.top.map(b => (
                <Chip key={b.name} label={brandText(b)} active={draft.brands.includes(b.name)} onPress={() => toggleBrand(b.name)} />
              ))}
            </View>
            {brands.more.length > 0 ? (
              <>
                <Text style={[typo.smallStrong, { color: colors.muted, paddingTop: space.m, paddingBottom: space.s }]}>{T.moreBrands}</Text>
                <View style={st.wrap}>
                  {brands.more.map(b => (
                    <Chip key={b.name} label={brandText(b)} active={draft.brands.includes(b.name)} onPress={() => toggleBrand(b.name)} />
                  ))}
                </View>
              </>
            ) : null}
          </View>

          <View onLayout={mark('preis')}>
            <GroupTitle>{T.price}</GroupTitle>
            <View style={st.wrap}>
              {ranges.map(r => (
                <Chip key={r.id} label={priceRangeLabel(r)} active={draft.price === r.id} onPress={() => setDraft(d => ({ ...d, price: d.price === r.id ? null : r.id }))} />
              ))}
            </View>
          </View>

          <View onLayout={mark('verfuegbarkeit')}>
            <GroupTitle>{T.availability}</GroupTitle>
            <CardGroup style={st.sheetCard} divider={space.l}>
              <ChoiceRow inCard kind="check" label={T.onlyAvailable} selected={draft.onlyAvail} onPress={() => setDraft(d => ({ ...d, onlyAvail: !d.onlyAvail }))} />
              {showSale ? (
                <ChoiceRow inCard kind="check" label={T.reduced} selected={draft.onlySale} onPress={() => setDraft(d => ({ ...d, onlySale: !d.onlySale }))} />
              ) : null}
            </CardGroup>
          </View>
        </ScrollView>

        <BottomBar>
          {label.note ? <Text style={[typo.rowSub, { textAlign: 'center' }]}>{label.note}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {/* Sıfırla doğal genişliğinde (etiket kırılmaz), Göster kalan alanı doldurur */}
            <View style={{ flexShrink: 0 }}><Btn kind="ghost" label={T.reset} onPress={() => setDraft(EMPTY_FILTERS)} /></View>
            <View style={{ flex: 1 }}>
              <Btn
                label={label.button}
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              />
            </View>
          </View>
        </BottomBar>
      </View>
    </Modal>
  );
}

/* ───── liste üstü bantlar ───── */

/**
 * Liste başlık bloğu: Fraunces başlık ve TEK sayı satırı.
 * Süzgeçsiz (`count` null): başlığın altında kapsamın kesin toplamı (+ kesinse fiyat aralığı); kısmi yükleme sessizdir,
 * ilerleme izi yoktur (sonsuz kaydırma). Süzgeçli: toplam başlık satırına iner ("Herrenuhren · 2.804"), altında
 * kesin isabet sayısı birincil satır ya da "mind. … · weitere werden geladen" soluk satır.
 */
export function ScopeBand({ label, n, facet, showRange, count }: {
  label: string; n: number; facet: Facet | null; showRange: boolean;
  /** countLine() çıktısı; null = süzgeç yok */
  count: { text: string; exact: boolean } | null;
}) {
  const range = facet && showRange ? fmt('{a} – {b}', { a: eur(facet.min), b: eur(facet.max) }) : null;
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.m, gap: 2 }} accessibilityLiveRegion="polite">
      <Text style={typo.title} numberOfLines={2} accessibilityRole="header">
        {label}
        {count ? <Text style={st.titleTotal}>{`  ·  ${num(n)}`}</Text> : null}
      </Text>
      {count ? (
        <Text style={count.exact ? [typo.h3, { color: colors.text }] : typo.meta}>{count.text}</Text>
      ) : (
        <Text style={typo.rowSub}>{range ? `${nProdukte(n)} · ${range}` : nProdukte(n)}</Text>
      )}
    </View>
  );
}

/** Sıralama için tüm kapsam yüklenirken çubuğun altında beliren ilerleme şeridi (progress 0..1). */
export function CountLine({ progress, progressLabel }: { progress: number; progressLabel?: string }) {
  return (
    <View style={{ backgroundColor: colors.card, paddingHorizontal: space.l, paddingTop: space.xs, paddingBottom: space.m, gap: 6 }}>
      <ProgressBar value={progress} />
      {progressLabel ? <Text style={typo.meta}>{progressLabel}</Text> : null}
    </View>
  );
}

const st = {
  barWrap: { backgroundColor: colors.card, ...shadow.soft, zIndex: 1 },
  barBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6,
    minWidth: 44, height: 44, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  barTxt: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  barCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  barCountTxt: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.onPrimary },
  barBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  wrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s },
  sheetCard: { marginHorizontal: 0 },
  titleTotal: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.muted },
};

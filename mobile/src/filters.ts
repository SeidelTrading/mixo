import type { Facet, Product } from './api/shop';
import { PRICE_RANGES } from './config';
import { T, brandsTotalLabel, fmt, hitsExactLabel, hitsPartialLabel, showNLabel } from './strings';

export type SortKey = 'standard' | 'preis-auf' | 'preis-ab';
export type ListFilters = {
  brands: string[]; // vendor tam eşleşmesi
  price: string | null; // PRICE_RANGES[].id
  onlyAvail: boolean; // !na
  onlySale: boolean; // was > price
};
export const EMPTY_FILTERS: ListFilters = { brands: [], price: null, onlyAvail: false, onlySale: false };

/** Dolu grup sayısı (marka: en az bir seçim = 1). */
export function activeFilterCount(f: ListFilters): number {
  return (f.brands.length > 0 ? 1 : 0) + (f.price ? 1 : 0) + (f.onlyAvail ? 1 : 0) + (f.onlySale ? 1 : 0);
}

export function applyFilters<T extends Pick<Product, 'vendor' | 'price' | 'was' | 'na'>>(rows: T[], f: ListFilters): T[] {
  const range = f.price ? PRICE_RANGES.find(r => r.id === f.price) : undefined;
  const brands = f.brands.length ? new Set(f.brands) : null;
  return rows.filter(p => {
    if (brands && !brands.has(p.vendor)) return false;
    if (range && !(p.price >= range.min && p.price < range.max)) return false;
    if (f.onlyAvail && p.na) return false;
    if (f.onlySale && !(p.was > p.price)) return false;
    return true;
  });
}

/** 'standard' = gelen sıra; diğerleri kararlı sıralama (eşit fiyatta gelen sıra korunur). */
export function sortRows<T extends Pick<Product, 'price'>>(rows: T[], k: SortKey): T[] {
  if (k === 'standard') return rows;
  const dir = k === 'preis-auf' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.price - b.r.price) * dir || a.i - b.i)
    .map(x => x.r);
}

/** Kapsamın [min,max] fiyat aralığıyla kesişen hazır aralıklar; facet yoksa tümü. */
export function priceRangesFor(facet: Facet | null): typeof PRICE_RANGES {
  if (!facet) return PRICE_RANGES;
  return PRICE_RANGES.filter(r => r.min <= facet.max && r.max > facet.min);
}

const collator = new Intl.Collator('de-DE');

/** Çoktan aza; eşitlikte de-DE alfabetik. */
export function countBrands(rows: Pick<Product, 'vendor'>[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.vendor) m.set(r.vendor, (m.get(r.vendor) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
}

export type BrandOption = { name: string; n: number | null }; // n null = sayı yazılmaz
export type BrandGroup = { top: BrandOption[]; more: BrandOption[]; note: string | null };

/** Kategori kapsamı için "Marke" grubu: kesin sayı (dizin ya da tam yükleme) ile sayısız marka karıştırılmaz. */
/** selected: seçili markalar (ör. ?marke=); listede yoksa da eklenir ki tek başına kaldırılabilsin. */
export function brandGroupForScope(
  facet: Facet | null, facetsExact: boolean, rows: Pick<Product, 'vendor'>[], complete: boolean, selected: readonly string[] = [],
): BrandGroup {
  if (complete) {
    const top: BrandOption[] = countBrands(rows).map(([name, n]) => ({ name, n }));
    const have = new Set(top.map(b => b.name));
    for (const name of selected) if (!have.has(name)) { top.push({ name, n: 0 }); have.add(name); } // tam yükleme: kesin 0
    return { top, more: [], note: null };
  }
  const top: BrandOption[] = (facet?.b ?? []).map(([name, n]) => ({ name, n: facetsExact ? n : null }));
  const seen = new Set(top.map(b => b.name));
  const names = new Set(countBrands(rows).map(([name]) => name).filter(name => !seen.has(name)));
  for (const name of selected) if (!seen.has(name)) names.add(name); // sayı yazılmaz (kısmi)
  const more = [...names]
    .sort(collator.compare)
    .map((name): BrandOption => ({ name, n: null }));
  return { top, more, note: facet ? brandsTotalLabel(facet.nb) : null };
}

/** Arama sonuçları için: tarama bitmediyse sayısız, "durchsuchten {p} %" notuyla. */
export function brandGroupForResults(rows: Pick<Product, 'vendor'>[], percent: number): BrandGroup {
  const counted = countBrands(rows);
  if (percent >= 100) return { top: counted.map(([name, n]) => ({ name, n })), more: [], note: null };
  return { top: counted.map(([name]) => ({ name, n: null })), more: [], note: fmt(T.brandsPartial, { p: percent }) };
}

export type CountInput = {
  matched: number; // süzgeçten geçen (yüklenen kısımda)
  filtersActive: boolean;
  complete: boolean;
  brandEntry: { marke: string; n: number } | null; // yalnız ?marke= ile gelindi, marke facet.b içinde, facetsExact, başka süzgeç yok
};

/**
 * Liste başlığındaki TEK sayı satırı (ScopeBand). Süzgeçsizken null: başlık bloğu kapsamın kesin toplamını yazar,
 * kısmi yükleme sessizdir (sonsuz kaydırma). Süzgeçliyken kesin sayı birincil satırdır; kısmi sayı "mind." etiketiyle
 * ve "weitere werden geladen" ekiyle soluk yazılır: kesin ve kısmi sayı etiketsiz karışmaz.
 */
export function countLine(c: CountInput): { text: string; exact: boolean } | null {
  if (!c.filtersActive) return null;
  if (c.brandEntry) return { text: hitsExactLabel(c.brandEntry.n), exact: true };
  if (c.complete) return { text: hitsExactLabel(c.matched), exact: true };
  return { text: `${hitsPartialLabel(c.matched)} · ${T.moreLoading}`, exact: false };
}

/** FilterSheet alt düğmesi: kesin sayı biliniyorsa düğmede, değilse düğme sayısız ve altında "mind." notu. */
export function showButtonLabel(matched: number, complete: boolean): { button: string; note: string | null } {
  if (complete) return { button: showNLabel(matched), note: null };
  return { button: T.show, note: `${hitsPartialLabel(matched)} · ${T.moreOnScroll}` };
}

/**
 * Günün karışımı (ana sayfa "Aus dem Sortiment"): aynı liste her gün başka sırada, kategoriler sırayla dönerek
 * (yan yana iki kart aynı kategoriden gelmez, mümkünse). Tohum yerel tarihtir; aynı gün her açılışta aynı sıra.
 * Ürün eklenmez, çıkarılmaz: yalnız sıra değişir.
 */
export function dailyMix<T extends { id: string; cat: string }>(list: readonly T[], day: Date = new Date()): T[] {
  let seed = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
  const rnd = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Kategori kovaları karışık sırada; her turda her kovadan bir ürün
  const buckets = new Map<string, T[]>();
  for (const x of a) (buckets.get(x.cat) ?? buckets.set(x.cat, []).get(x.cat)!).push(x);
  const out: T[] = [];
  const qs = [...buckets.values()];
  while (out.length < a.length) for (const q of qs) { const x = q.shift(); if (x) out.push(x); }
  return out;
}

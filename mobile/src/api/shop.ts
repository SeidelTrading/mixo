/**
 * Veri erişiminin TEK noktası. Yalnız GET (okuma) çağrıları yapılır:
 *   /api/config, /api/shop/home, /api/shop/product  → JSON
 *   /data/index.js, /data/<anahtar>-<n>.js          → vitrinin statik katalog parçaları (JSONP biçimi)
 * Sahte olay, sepet kaydı, sipariş ve yönetici uçları BİLEREK çağrılmaz.
 *
 * Shopify Storefront API'ye geçişte bu dosyadaki dışa aktarılan işlevlerin imzaları korunur, içleri değişir.
 */
import { API_BASE, CHUNK_CONCURRENCY, FREE_SHIPPING_FALLBACK, HOME_TTL_MS, IMAGE_CDN } from '../config';
import { T } from '../strings';

export type Product = {
  id: string;
  title: string;
  vendor: string;
  price: number;
  was: number; // 0 = indirim yok
  img: string;
  cat: string; // kategori anahtarı, ör. 'uhren'
  sub: string; // alt kategori adı
  si: number; // alt kategori sırası (cats[].subs içindeki konum); bilinmiyorsa -1
  na: boolean; // true = şu an satışta değil
  lq: boolean; // düşük kalite bayrağı (parça satırının 10. alanı === 1); getProduct için her zaman false
};

export type SubCategory = { name: string; n: number };
export type Category = { k: string; label: string; n: number; subs: SubCategory[] };
/** Süzgeç özeti; anahtar kapsamdır: 'all' | 'uhren' | 'uhren/2' */
export type Facet = {
  b: [brand: string, n: number][]; // kapsamın tamamı için ilk 16 marka ve sayıları (çoktan aza)
  nb: number; // kapsamdaki toplam marka sayısı
  min: number;
  max: number;
  sale: number; // was > price olan ürün sayısı
};
export type Index = {
  total: number;
  cats: Category[]; // gizli kategoriler çıkarılmış, ad ve sayılar yapılandırmayla düzeltilmiş
  lists: Record<string, number>; // kapsam → parça sayısı
  facets: Record<string, Facet>;
  facetsExact: boolean; // false: yönetici ürün gizlemiş; marka sayıları kesin sayılmaz
};
export type BestSource = 'behavior' | 'curated';
export type Home = {
  deals: Product[];
  best: Product[];
  budget: Product[];
  premium: Product[]; // sunucu alan adı; arayüzde görünmez
  bestSource: BestSource;
  freeShip: number;
};
export type PublicConfig = {
  announcement: string; // boş = duyuru yok
  hidden: string[];
  hiddenCounts: { total: number; cats: Record<string, number>; subs: Record<string, number> };
  overrides: Record<string, Partial<Pick<Product, 'title' | 'price' | 'was' | 'na' | 'img'>>>;
  categories: Record<string, { label?: string; hidden?: boolean }>;
};

type RawIndex = { total: number; cats: Category[]; lists: Record<string, number>; facets: Record<string, Facet> };

const ALL_LABEL = T.allProducts; // 'all' kapsamının adı (metin strings.ts'te)

/** Zaman aşımı: takılan bir bağlantı parça kuyruğundaki yuvayı sonsuza dek tutmasın. */
const FETCH_TIMEOUT_MS = 15_000;
/** Gövde okunana kadar sayaç sürer (takılan r.text() de kesilir). 404 → null. */
async function fetchText(url: string, allow404 = false): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (allow404 && r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
async function getText(path: string): Promise<string> {
  return (await fetchText(API_BASE + path)) as string;
}
const getJson = async <T>(path: string): Promise<T> => JSON.parse(await getText(path)) as T;

/** Görsel adresi: fix/ → sunucu, img/ → sunucu, http → olduğu gibi, düz ad → CDN (genişlik parametreli). */
export function imageUrl(img: string, width = 480): string {
  if (!img) return '';
  if (img.startsWith('fix/')) return `${API_BASE}/img/${img}`;
  if (img.startsWith('img/')) return `${API_BASE}/${img}`;
  if (img.startsWith('http')) return img;
  return `${IMAGE_CDN}${img}?width=${width}`;
}

/* ───── yapılandırma ───── */
const EMPTY_CONFIG: PublicConfig = { announcement: '', hidden: [], hiddenCounts: { total: 0, cats: {}, subs: {} }, overrides: {}, categories: {} };

let cfgC: { t: number; p: Promise<PublicConfig> } | null = null;
/**
 * HOME_TTL_MS süreli önbellek; hata → boş yapılandırma, hata önbelleğe alınmaz.
 * Yalnız katalog DIŞI çağıranlar için (duyuru vb.): katalog verisi cfgResult().ok ister.
 */
export function getConfig(): Promise<PublicConfig> {
  return cfgResult().then(r => r.cfg);
}
/** ok=false: sunucuya ulaşılamadı, boş yapılandırma döndü. */
async function cfgResult(): Promise<{ cfg: PublicConfig; ok: boolean }> {
  if (!cfgC || Date.now() - cfgC.t >= HOME_TTL_MS) cfgC = { t: Date.now(), p: getJson<Partial<PublicConfig>>('/api/config').then(c => ({
    announcement: typeof c.announcement === 'string' ? c.announcement.trim() : '',
    hidden: c.hidden ?? [],
    hiddenCounts: { total: c.hiddenCounts?.total ?? 0, cats: c.hiddenCounts?.cats ?? {}, subs: c.hiddenCounts?.subs ?? {} },
    overrides: c.overrides ?? {},
    categories: c.categories ?? {},
  })) };
  const entry = cfgC;
  try {
    return { cfg: await entry.p, ok: true };
  } catch {
    if (cfgC === entry) cfgC = null;
    return { cfg: EMPTY_CONFIG, ok: false };
  }
}

/* ───── dizin ───── */
let rawIdxP: Promise<RawIndex> | null = null;
/** Ham dizin: parça satırlarındaki katIdx bu dizine göre çözülür (gizli kategori çıkarılınca sıra kayar). */
function getRawIndex(): Promise<RawIndex> {
  rawIdxP ??= getText('/data/index.js')
    .then(t => JSON.parse(t.replace(/^\s*window\.MX_INDEX\s*=\s*/, '').replace(/;\s*$/, '')) as RawIndex)
    .catch(e => {
      rawIdxP = null;
      throw e;
    });
  return rawIdxP;
}

function buildIndex(raw: RawIndex, c: PublicConfig): Index {
  const hc = c.hiddenCounts;
  // Gizli kategorinin bütün ürünleri düşülür; o kategorideki tek tek gizlenmişler (hc.cats) iki kez düşülmesin.
  const hiddenCats = raw.cats.filter(k => c.categories[k.k]?.hidden);
  const removed = hc.total + hiddenCats.reduce((a, k) => a + k.n - (hc.cats[k.k] ?? 0), 0);
  const cats: Category[] = raw.cats
    .filter(k => !c.categories[k.k]?.hidden)
    .map(k => ({
      k: k.k,
      label: c.categories[k.k]?.label || k.label,
      n: Math.max(0, k.n - (hc.cats[k.k] ?? 0)),
      subs: k.subs.map((s, i) => ({ name: s.name, n: Math.max(0, s.n - (hc.subs[`${k.k}/${i}`] ?? 0)) })),
    }));
  return {
    total: Math.max(0, raw.total - removed), cats, lists: raw.lists ?? {}, facets: raw.facets ?? {},
    facetsExact: hc.total === 0 && hiddenCats.length === 0, // 'all' facet'leri gizli kategoriyi de sayar
  };
}

/** Yapılandırma gelmezse katalog açılmaz (gizli ürün/kategori sızmasın); hata + yeniden dene gösterilir. */
async function catalogConfig(): Promise<PublicConfig> {
  const { cfg, ok } = await cfgResult();
  if (!ok) throw new Error('config');
  return cfg;
}

// Dizin, kurulduğu yapılandırma nesnesine bağlıdır: yapılandırma yenilenince (TTL) yeniden kurulur.
let indexC: { cfg: PublicConfig; idx: Index } | null = null;
export async function getIndex(): Promise<Index> {
  const [raw, cfg] = await Promise.all([getRawIndex(), catalogConfig()]);
  if (indexC?.cfg !== cfg) indexC = { cfg, idx: buildIndex(raw, cfg) };
  return indexC.idx;
}

/** Yönetici düzenlemelerini (başlık/fiyat/stok/görsel) uygular; gizli ürün ve kategorileri eler. Girdi değiştirilmez. */
async function applyConfig(list: Product[]): Promise<Product[]> {
  const c = await catalogConfig();
  const hid = new Set(c.hidden);
  return list
    .filter(p => !hid.has(p.id) && !c.categories[p.cat]?.hidden)
    .map(p => (c.overrides[p.id] ? { ...p, ...c.overrides[p.id] } : p));
}

/* ───── katalog parçaları ───── */
// aynı anda en çok CHUNK_CONCURRENCY parça indirilir
let active = 0;
const waiters: (() => void)[] = [];
async function queued<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CHUNK_CONCURRENCY) await new Promise<void>(res => waiters.push(res));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

// Ham satırlar önbellekte; yapılandırma her okumada uygulanır (yenilenen yapılandırma yeniden indirmeden geçerli olur).
const chunkCache = new Map<string, Promise<Product[]>>();
/** key: 'all' | 'uhren' | 'uhren/2'; i: parça sırası. Satır: [id,başlık,marka,fiyat,eski,görsel,katIdx,altIdx,uygun?,düşükKalite?] (son iki alan çoğu satırda yok). */
export function loadChunk(key: string, i: number): Promise<Product[]> {
  const ck = `${key}#${i}`;
  let p = chunkCache.get(ck);
  if (!p) {
    p = (async () => {
      const [raw, txt] = await Promise.all([getRawIndex(), queued(() => getText(`/data/${key.replace('/', '_')}-${i}.js`))]);
      const body = txt.replace(/^\s*MXC\(\s*"[^"]*"\s*,\s*\d+\s*,\s*/, '').replace(/\)\s*;?\s*$/, '');
      const rows = JSON.parse(body) as (string | number)[][];
      const list: Product[] = [];
      for (const r of rows) {
        const c = raw.cats[r[6] as number];
        if (!c) continue;
        const si = typeof r[7] === 'number' ? r[7] : -1;
        list.push({
          id: r[0] as string,
          title: r[1] as string,
          vendor: r[2] as string,
          price: r[3] as number,
          was: r[4] as number,
          img: r[5] as string,
          cat: c.k,
          sub: c.subs[si]?.name ?? '',
          si,
          na: r[8] === 0,
          lq: r[9] === 1,
        });
      }
      return list;
    })();
    p.catch(() => chunkCache.delete(ck));
    chunkCache.set(ck, p);
  }
  return p.then(applyConfig).then(list => { for (const x of list) primeProduct(x); return list; });
}

export const chunkCount = async (key: string) => (await getRawIndex()).lists[key] ?? 0;

/* ───── vitrin ve ürün ayrıntısı ───── */
type ServerRow = Partial<Product>;
const toProduct = (r: ServerRow): Product => ({
  id: r.id ?? '',
  title: r.title ?? '',
  vendor: r.vendor ?? '',
  price: r.price ?? 0,
  was: r.was ?? 0,
  img: r.img ?? '',
  cat: r.cat ?? '',
  sub: r.sub ?? '',
  si: typeof r.si === 'number' ? r.si : -1,
  na: !!r.na,
  lq: false,
});

let homeC: { t: number; p: Promise<Home> } | null = null;
export function getHome(): Promise<Home> {
  if (homeC && Date.now() - homeC.t < HOME_TTL_MS) return homeC.p;
  const p = getJson<Partial<Record<keyof Home, unknown>>>('/api/shop/home').then((h): Home => {
    const rows = (v: unknown): Product[] => (Array.isArray(v) ? (v as ServerRow[]).map(toProduct) : []).map(x => { primeProduct(x); return x; });
    const fs = h.freeShip;
    return {
      deals: rows(h.deals),
      best: rows(h.best),
      budget: rows(h.budget),
      premium: rows(h.premium),
      bestSource: h.bestSource === 'behavior' ? 'behavior' : 'curated',
      freeShip: typeof fs === 'number' && Number.isFinite(fs) ? fs : FREE_SHIPPING_FALLBACK,
    };
  });
  const entry = { t: Date.now(), p };
  homeC = entry;
  p.catch(() => {
    if (homeC === entry) homeC = null;
  });
  return p;
}

/* ───── bellek içi ürün anlık görüntüleri ───── */
// Kartlar (dokunma), katalog parçaları ve vitrin satırları doldurur. Ürün sayfası bunu anında ilk veri olarak
// gösterir; sunucu 404 verirse sayfa anlık görüntüden "derzeit nicht verfügbar" durumuyla çizilir.
const SNAP_MAX = 6000;
const snapshots = new Map<string, Product>();
export function primeProduct(p: Omit<Product, 'si' | 'lq'> & { si?: number; lq?: boolean }): void {
  if (!p.id) return;
  snapshots.delete(p.id); // sona taşı: en eski kayıt önce düşer
  snapshots.set(p.id, { id: p.id, title: p.title, vendor: p.vendor, price: p.price, was: p.was, img: p.img, cat: p.cat, sub: p.sub, si: p.si ?? -1, na: !!p.na, lq: !!p.lq });
  if (snapshots.size > SNAP_MAX) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
}
export const productSnapshot = (id: string): Product | undefined => snapshots.get(id);

/** 404 → null: gizli, gizli kategoride, satışta olmayan ya da var olmayan ürün (nedeni ayırt edilemez). */
/** Canlı okuma; sonucu getProductCached önbelleğine de yazar (ürün sayfası ile listeler aynı fiyatı görsün). */
export async function getProduct(id: string): Promise<Product | null> {
  const txt = await fetchText(`${API_BASE}/api/shop/product?id=${encodeURIComponent(id)}`, true);
  const p = txt === null ? null : toProduct(JSON.parse(txt) as ServerRow);
  if (p) primeProduct(p);
  productCache.set(id, { t: Date.now(), p: Promise.resolve(p) });
  return p;
}

const productCache = new Map<string, { t: number; p: Promise<Product | null> }>();
/** HOME_TTL_MS süreli önbellek (null dahil); ağ hatası önbelleğe alınmaz, fırlatır. */
export function getProductCached(id: string): Promise<Product | null> {
  const hit = productCache.get(id);
  if (hit && Date.now() - hit.t < HOME_TTL_MS) return hit.p;
  const entry = { t: Date.now(), p: getProduct(id) };
  entry.p.catch(() => { if (productCache.get(id) === entry) productCache.delete(id); });
  productCache.set(id, entry);
  return entry.p;
}

/* ───── kapsam yardımcıları (saf, senkron) ───── */
export type ScopeInfo = {
  scope: string; // 'all' | 'uhren' | 'uhren/2'
  key: string; // 'all' | 'uhren'
  sub: number | null;
  label: string;
  catLabel: string | null; // alt kategori kapsamında üst kategori adı
  n: number; // kesin ürün sayısı (dizinden, gizlenenler düşülmüş)
  chunks: number;
  facet: Facet | null;
  subs: SubCategory[]; // kategori kapsamında alt kategoriler; diğerlerinde []
};

export const scopeKey = (key: string, sub?: number | null): string => (key === 'all' || sub == null ? key : `${key}/${sub}`);

/** Bilinmeyen ya da gizli kapsam → null. */
export function scopeInfo(idx: Index, scope: string): ScopeInfo | null {
  const [key, subS] = scope.split('/');
  const facet = idx.facets[scope] ?? null;
  const chunks = idx.lists[scope] ?? 0;
  if (scope === 'all') return { scope, key: 'all', sub: null, label: ALL_LABEL, catLabel: null, n: idx.total, chunks, facet, subs: [] };
  const cat = idx.cats.find(c => c.k === key);
  if (!cat) return null;
  if (subS === undefined) return { scope, key, sub: null, label: cat.label, catLabel: null, n: cat.n, chunks, facet, subs: cat.subs };
  const si = /^\d+$/.test(subS) ? Number(subS) : -1;
  const s = cat.subs[si];
  if (!s) return null;
  return { scope, key, sub: si, label: s.name, catLabel: cat.label, n: s.n, chunks, facet, subs: [] };
}

export function subIndexOf(idx: Index, cat: string, subName: string): number {
  return idx.cats.find(c => c.k === cat)?.subs.findIndex(s => s.name === subName) ?? -1;
}

/* ───── arama yardımcıları: büyük/küçük harf, aksan ve tire farkına duyarsız (vitrin ile aynı kural) ───── */
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
export function makeMatcher(q: string): (p: Product) => boolean {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const flatTok = (t: string) => t.replace(/[^a-z0-9]/g, '');
  return p => {
    const h = norm(`${p.title} ${p.vendor} ${p.sub}`);
    // Bitişik yazım ("usbc" ~ "USB-C") yalnız tek alan içinde aranır: alanlar birleşince
    // "...Armbanduhr" + "Nautica" gibi yapay eşleşmeler ("uhrn") çıkıyordu.
    const flats = [p.title, p.vendor, p.sub].map(f => flatTok(norm(f)));
    return toks.every(t => {
      if (h.includes(t)) return true;
      const ft = flatTok(t);
      // yalnız noktalama içeren belirteç ("-") her ürüne uymasın
      return ft.length > 0 && flats.some(f => f.includes(ft));
    });
  };
}

export type BrandPair = {
  marke: string;
  key: string;
  catLabel: string;
  n: number; // facets[key].b içindeki kesin sayı
  chipLabel: string; // "{Marke}" ya da aynı marka iki kez çıkarsa "{Marke} · {Kategorie}"
  rowLabel: string; // her zaman "{Marke} · {Kategorie}"
};

/** 10 kategorinin facets[k].b listelerinden (marka, kategori) çiftleri, n'ye göre azalan, ilk `limit`. */
export function topBrandPairs(idx: Index, limit = 16): BrandPair[] {
  const all: { marke: string; key: string; catLabel: string; n: number }[] = [];
  for (const c of idx.cats) for (const [marke, n] of idx.facets[c.k]?.b ?? []) all.push({ marke, key: c.k, catLabel: c.label, n });
  const top = all
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.n - a.p.n || a.i - b.i)
    .slice(0, limit)
    .map(x => x.p);
  const seen = new Map<string, number>();
  for (const p of top) seen.set(norm(p.marke), (seen.get(norm(p.marke)) ?? 0) + 1);
  return top.map(p => ({
    ...p,
    chipLabel: (seen.get(norm(p.marke)) ?? 0) > 1 ? `${p.marke} · ${p.catLabel}` : p.marke,
    rowLabel: `${p.marke} · ${p.catLabel}`,
  }));
}

export type Suggestion =
  | { kind: 'kategorie'; key: string; label: string; n: number }
  | { kind: 'unterkategorie'; key: string; sub: number; label: string; n: number } // label: "Kategorie › Unterkategorie"
  | { kind: 'marke'; marke: string; key: string; sub: number | null; label: string; n: number };

type BrandTarget = { marke: string; nm: string; key: string; sub: number | null; n: number };
const brandCache = new WeakMap<Index, BrandTarget[]>();
/** Her marka için hedef kapsam: en yüksek sayıyla geçtiği kategori; yalnız alt kategori facet'lerinde varsa o alt kategori. */
function brandTargets(idx: Index): BrandTarget[] {
  const hit = brandCache.get(idx);
  if (hit) return hit;
  const best = new Map<string, BrandTarget>();
  const consider = (marke: string, key: string, sub: number | null, n: number) => {
    const nm = norm(marke);
    const cur = best.get(nm);
    if (!cur || n > cur.n) best.set(nm, { marke, nm, key, sub, n });
  };
  for (const c of idx.cats) for (const [m, n] of idx.facets[c.k]?.b ?? []) consider(m, c.k, null, n);
  const inCat = new Set(best.keys());
  const subBest = new Map<string, BrandTarget>();
  for (const c of idx.cats) {
    c.subs.forEach((_s, i) => {
      for (const [m, n] of idx.facets[`${c.k}/${i}`]?.b ?? []) {
        const nm = norm(m);
        if (inCat.has(nm)) continue;
        const cur = subBest.get(nm);
        if (!cur || n > cur.n) subBest.set(nm, { marke: m, nm, key: c.k, sub: i, n });
      }
    });
  }
  const out = [...best.values(), ...subBest.values()];
  brandCache.set(idx, out);
  return out;
}

/** Dizindeki kategori, alt kategori ve marka adlarında norm(q) alt dizgi araması (q en az 2 harf). Sıra: kategoriler, alt kategoriler, markalar. */
export function suggest(idx: Index, q: string, perKind = 6): Suggestion[] {
  const nq = norm(q).trim();
  if (nq.length < 2) return [];
  // önek eşleşmesi önce, sonra büyük sayı
  const rank = <T extends { nm: string; n: number }>(a: T[]) =>
    a
      .map((x, i) => ({ x, i }))
      .sort((p, r) => Number(r.x.nm.startsWith(nq)) - Number(p.x.nm.startsWith(nq)) || r.x.n - p.x.n || p.i - r.i)
      .slice(0, perKind)
      .map(v => v.x);
  const cats = rank(idx.cats.filter(c => norm(c.label).includes(nq)).map(c => ({ nm: norm(c.label), n: c.n, c })));
  const subs = rank(
    idx.cats.flatMap(c => c.subs.map((s, i) => ({ nm: norm(s.name), n: s.n, c, s, i })).filter(x => x.nm.includes(nq))),
  );
  const brands = rank(brandTargets(idx).filter(b => b.nm.includes(nq)));
  return [
    ...cats.map((x): Suggestion => ({ kind: 'kategorie', key: x.c.k, label: x.c.label, n: x.n })),
    ...subs.map((x): Suggestion => ({ kind: 'unterkategorie', key: x.c.k, sub: x.i, label: `${x.c.label} › ${x.s.name}`, n: x.n })),
    ...brands.map((b): Suggestion => ({ kind: 'marke', marke: b.marke, key: b.key, sub: b.sub, label: b.marke, n: b.n })),
  ];
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** norm(q) ile dizindeki adlar arasında Levenshtein ≤ 2 olan en yakın tek ad; eşitlikte büyük n. q < 3 harf → null. */
export function nearestName(idx: Index, q: string): Suggestion | null {
  const nq = norm(q).trim();
  if (nq.length < 3) return null;
  let best: { d: number; n: number; s: Suggestion } | null = null;
  const offer = (name: string, n: number, s: Suggestion) => {
    const d = lev(nq, norm(name));
    if (d > 2) return;
    if (!best || d < best.d || (d === best.d && n > best.n)) best = { d, n, s };
  };
  for (const c of idx.cats) {
    offer(c.label, c.n, { kind: 'kategorie', key: c.k, label: c.label, n: c.n });
    c.subs.forEach((s, i) => offer(s.name, s.n, { kind: 'unterkategorie', key: c.k, sub: i, label: `${c.label} › ${s.name}`, n: s.n }));
  }
  for (const b of brandTargets(idx)) offer(b.marke, b.n, { kind: 'marke', marke: b.marke, key: b.key, sub: b.sub, label: b.marke, n: b.n });
  return (best as { s: Suggestion } | null)?.s ?? null;
}

/** Sorgu bir kategori, alt kategori ya da marka adıyla birebir aynıysa (norm ile) o ad; sıra: marka, alt kategori, kategori. */
export function exactName(idx: Index, q: string): Suggestion | null {
  const nq = norm(q).trim().replace(/\s+/g, ' ');
  if (nq.length < 2) return null;
  const b = brandTargets(idx).find(x => x.nm === nq);
  if (b) return { kind: 'marke', marke: b.marke, key: b.key, sub: b.sub, label: b.marke, n: b.n };
  for (const c of idx.cats) {
    const i = c.subs.findIndex(x => norm(x.name) === nq);
    if (i >= 0) return { kind: 'unterkategorie', key: c.k, sub: i, label: `${c.label} › ${c.subs[i].name}`, n: c.subs[i].n };
  }
  const c = idx.cats.find(x => norm(x.label) === nq);
  return c ? { kind: 'kategorie', key: c.k, label: c.label, n: c.n } : null;
}

/* ───── ana sayfa yardımcıları ───── */
export type SubRef = { key: string; sub: number; name: string; catLabel: string; n: number };
export function biggestSubs(idx: Index, limit = 6): SubRef[] {
  return idx.cats
    .flatMap(c => c.subs.map((s, i) => ({ key: c.k, sub: i, name: s.name, catLabel: c.label, n: s.n })))
    .filter(s => s.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

/** Kapsamın 0. parçasında na=false ve lq=false olan ilk ürün; yoksa null. Yalnız 0. parçayı ister. */
export async function representative(scope: string): Promise<Product | null> {
  if ((await chunkCount(scope)) === 0) return null;
  return (await loadChunk(scope, 0)).find(p => !p.na && !p.lq) ?? null;
}

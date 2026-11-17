import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chunkCount, getConfig, getHome, getIndex, getProductCached, loadChunk, makeMatcher, representative } from './api/shop';
import type { Home, Index, Product, PublicConfig } from './api/shop';
import { useShop } from './store/shopStore';
import type { CartLine } from './store/shopStore';
import { CHUNK_CONCURRENCY, FREE_SHIPPING_FALLBACK, SEARCH_STEP } from './config';

/**
 * Basit asenkron yükleyici: efekt içinde eşzamanlı setState yok; sonuç, istek anahtarıyla etiketlenir.
 * key değişirse ya da retry() çağrılırsa yeniden yükler; eski isteğin sonucu yoksayılır.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const [tick, setTick] = useState(0);
  const token = `${key}#${tick}`;
  const [res, setRes] = useState<{ token: string; data?: T; error?: boolean } | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    let alive = true;
    fnRef.current().then(d => alive && setRes({ token, data: d })).catch(() => alive && setRes({ token, error: true }));
    return () => { alive = false; };
  }, [token]);
  const fresh = res?.token === token;
  return { data: fresh ? res?.data : undefined, error: fresh && !!res?.error, loading: !fresh, retry: () => setTick(t => t + 1) };
}

export const useIndex = (): { data: Index | undefined; error: boolean; loading: boolean; retry: () => void } => useAsync(getIndex, 'index');
export const useHome = (): { data: Home | undefined; error: boolean; loading: boolean; retry: () => void } => useAsync(getHome, 'home');
/** getConfig hata fırlatmaz: sunucuya ulaşılamazsa boş yapılandırma döner. */
export const useConfig = (): PublicConfig | undefined => useAsync(getConfig, 'config').data;

/**
 * Ücretsiz kargo eşiğinin TEK kaynağı: home.freeShip. Yüklenene kadar ve hata olursa freeShip yedek değerdir;
 * fromServer=false iken bu değer sunucunun değeri gibi SUNULMAZ (bkz. cekirdek-notlari: ekranlar).
 */
export function useFreeShip(): { freeShip: number; fromServer: boolean; loading: boolean; error: boolean; retry: () => void } {
  const { data, loading, error, retry } = useHome();
  return { freeShip: data?.freeShip ?? FREE_SHIPPING_FALLBACK, fromServer: !!data, loading, error, retry };
}

const microtask = (fn: () => void) => queueMicrotask(fn);

/* ───────────── useScopeList ───────────── */
export type ScopeList = {
  rows: Product[]; // parça sırasıyla birleştirilmiş, gizliler elenmiş
  loadedChunks: number;
  totalChunks: number; // dizinden; bilinmiyorsa 0
  complete: boolean; // loadedChunks === totalChunks && totalChunks > 0
  loading: boolean;
  error: boolean;
  progress: number; // 0..1
  loadMore: () => void;
  loadUntil: (enough: (rows: Product[]) => boolean, maxChunks?: number) => void;
  loadAll: () => Promise<boolean>;
  retry: () => void;
};

type ListView = { scope: string; rows: Product[]; loaded: number; total: number; busy: boolean; error: boolean };
type ListRun = {
  scope: string;
  chunks: Product[][];
  total: number; // 0 = henüz bilinmiyor / yok
  busy: boolean;
  busyP: Promise<void>;
  error: boolean;
  dead: boolean;
  ready: Promise<void> | null;
  emit: () => void;
};

const flat = (c: Product[][]): Product[] => c.flat();

function ensureReady(run: ListRun): Promise<void> {
  run.ready ??= chunkCount(run.scope).then(n => { run.total = n; }).catch(e => { run.ready = null; throw e; });
  return run.ready;
}

/** Tek seferde bir iş: meşgulse yok sayılır. */
function runExclusive(run: ListRun, job: () => Promise<void>): void {
  if (run.busy || run.dead) return;
  run.busy = true;
  run.error = false;
  run.emit();
  run.busyP = job()
    .catch(() => { run.error = true; })
    .then(() => { run.busy = false; run.emit(); });
}

async function loadNext(run: ListRun): Promise<boolean> {
  await ensureReady(run);
  if (run.dead || run.chunks.length >= run.total) return false;
  const rows = await loadChunk(run.scope, run.chunks.length);
  if (run.dead) return false;
  run.chunks.push(rows);
  run.emit();
  return true;
}

export function useScopeList(scope: string): ScopeList {
  const [view, setView] = useState<ListView | null>(null);
  const runRef = useRef<ListRun | null>(null);

  useEffect(() => {
    const run: ListRun = {
      scope, chunks: [], total: 0, busy: false, busyP: Promise.resolve(), error: false, dead: false, ready: null,
      emit: () => microtask(() => {
        if (run.dead) return;
        setView({ scope, rows: flat(run.chunks), loaded: run.chunks.length, total: run.total, busy: run.busy, error: run.error });
      }),
    };
    runRef.current = run;
    runExclusive(run, async () => { await loadNext(run); }); // ilk parça kendiliğinden
    return () => { run.dead = true; };
  }, [scope]);

  const loadMore = useCallback(() => {
    const run = runRef.current;
    if (run) runExclusive(run, async () => { await loadNext(run); });
  }, []);

  const loadUntil = useCallback((enough: (rows: Product[]) => boolean, maxChunks = Infinity) => {
    const run = runRef.current;
    if (!run) return;
    runExclusive(run, async () => {
      let n = 0;
      while (n < maxChunks && !enough(flat(run.chunks))) {
        if (!(await loadNext(run))) break;
        n++;
      }
    });
  }, []);

  const loadAll = useCallback(async (): Promise<boolean> => {
    const run = runRef.current;
    if (!run) return false;
    // Başka bir iş sürerken bekle; aynı busyP'yi bekleyen ikinci çağrı da kendi işini başlatabilsin.
    while (run.busy && !run.dead) await run.busyP;
    if (run.dead) return false;
    if (run.total > 0 && run.chunks.length >= run.total && !run.error) return true;
    let ok = false;
    runExclusive(run, async () => {
      await ensureReady(run);
      if (run.total === 0) return;
      // Kayan pencere: en çok CHUNK_CONCURRENCY parça istekte; ekrandan çıkılınca (dead) yeni istek açılmaz.
      let next = run.chunks.length;
      const ps: Promise<Product[]>[] = [];
      const request = () => { const p = loadChunk(run.scope, next++); p.catch(() => undefined); ps.push(p); };
      while (ps.length < CHUNK_CONCURRENCY && next < run.total) request();
      for (let k = 0; k < ps.length; k++) {
        const rows = await ps[k];
        if (run.dead) return;
        run.chunks.push(rows);
        run.emit();
        if (next < run.total) request();
      }
      ok = true;
    });
    await run.busyP;
    return ok && !run.error && !run.dead && run.chunks.length >= run.total && run.total > 0;
  }, []);

  const retry = useCallback(() => {
    const run = runRef.current;
    if (run) runExclusive(run, async () => { await loadNext(run); });
  }, []);

  const v = view?.scope === scope ? view : null;
  const rows = v?.rows ?? EMPTY_ROWS;
  const loaded = v?.loaded ?? 0;
  const total = v?.total ?? 0;
  return {
    rows,
    loadedChunks: loaded,
    totalChunks: total,
    complete: loaded === total && total > 0,
    loading: !v || v.busy,
    error: !!v?.error,
    progress: total > 0 ? loaded / total : 0,
    loadMore, loadUntil, loadAll, retry,
  };
}

/* ───────────── useCatalogScan ───────────── */
export type CatalogScan = {
  query: string; // son başlatılan sorgu ('' = yok)
  results: Product[];
  percent: number; // complete ? 100 : min(99, round(scanned/total*100))
  complete: boolean;
  busy: boolean;
  stopped: boolean; // kullanıcı "Abbrechen" dedi (tarama yarım)
  error: boolean;
  start: (q: string) => void;
  stop: () => void;
  resume: () => void;
  reset: () => void;
};

type ScanView = { q: string; results: Product[]; scanned: number; total: number; busy: boolean; stopped: boolean; error: boolean };
type ScanRun = {
  q: string;
  match: (p: Product) => boolean;
  results: Product[];
  scanned: number;
  total: number;
  busy: boolean;
  stopped: boolean;
  busyP: Promise<void>;
  error: boolean;
  dead: boolean;
  emit: () => void;
};

/**
 * 'all' kapsamını SEARCH_STEP'lik gruplarla sonuna kadar tarar; her grup sonrası bulunanlar ızgaraya akar.
 * Kullanıcı durdurunca (stopped), ekrandan çıkınca ya da yeni aramada (dead) mevcut grup bitince durur.
 */
async function scanAllChunks(run: ScanRun): Promise<void> {
  if (run.total === 0) { run.total = await chunkCount('all'); if (run.dead) return; }
  while (!run.dead && !run.stopped && run.scanned < run.total) {
    const n = Math.min(SEARCH_STEP, run.total - run.scanned);
    const ps: Promise<Product[]>[] = [];
    for (let i = 0; i < n; i++) { const p = loadChunk('all', run.scanned + i); p.catch(() => undefined); ps.push(p); }
    const chunks = await Promise.all(ps);
    if (run.dead) return;
    for (const rows of chunks) for (const r of rows) if (run.match(r)) run.results.push(r);
    run.scanned += n;
    run.emit();
  }
}

/** Katalog araması: gönderilince tüm katalog kendiliğinden taranır (sonuçlar akarak gelir); "Abbrechen" ile durur, "Fortsetzen" ile sürer. */
export function useCatalogScan(): CatalogScan {
  const [view, setView] = useState<ScanView | null>(null);
  const runRef = useRef<ScanRun | null>(null);

  useEffect(() => () => { if (runRef.current) runRef.current.dead = true; }, []);

  const exec = useCallback((run: ScanRun) => {
    if (run.busy) return;
    run.busy = true;
    run.stopped = false;
    run.error = false;
    run.emit();
    run.busyP = scanAllChunks(run)
      .catch(() => { run.error = true; })
      .then(() => { run.busy = false; run.emit(); });
  }, []);

  const start = useCallback((q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    if (runRef.current) runRef.current.dead = true;
    const run: ScanRun = {
      q: t, match: makeMatcher(t), results: [], scanned: 0, total: 0, busy: false, stopped: false, busyP: Promise.resolve(), error: false, dead: false,
      emit: () => microtask(() => {
        if (run.dead) return;
        setView({ q: run.q, results: run.results.slice(), scanned: run.scanned, total: run.total, busy: run.busy, stopped: run.stopped, error: run.error });
      }),
    };
    runRef.current = run;
    exec(run);
  }, [exec]);

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run || !run.busy) return;
    run.stopped = true;
    run.emit();
  }, []);

  const resume = useCallback(() => {
    const run = runRef.current;
    if (!run || (run.total > 0 && run.scanned >= run.total)) return;
    if (run.busy) { run.stopped = false; run.emit(); return; } // durdurma isteği henüz işlenmediyse geri alınır
    exec(run);
  }, [exec]);

  const reset = useCallback(() => {
    if (runRef.current) runRef.current.dead = true;
    runRef.current = null;
    microtask(() => setView(null));
  }, []);

  const total = view?.total ?? 0;
  const scanned = view?.scanned ?? 0;
  const complete = scanned === total && total > 0;
  return {
    query: view?.q ?? '',
    results: view?.results ?? EMPTY_ROWS,
    percent: complete ? 100 : Math.min(99, total > 0 ? Math.round((scanned / total) * 100) : 0),
    complete,
    busy: view?.busy ?? false,
    // Yarım ve çalışmıyor (durduruldu ya da durdurma isteği işlenirken bitti) → duraklatılmış sayılır; hata ayrı gösterilir
    stopped: !!view && !complete && !view.error && (view.stopped || !view.busy),
    error: view?.error ?? false,
    start, stop, resume, reset,
  };
}
const EMPTY_ROWS: Product[] = [];

/* ───────────── useRepresentative ───────────── */
/** Ana sayfa karosu/vitrin kartı görseli; enabled=false iken ağ isteği yapmaz. undefined = yükleniyor. */
export function useRepresentative(scope: string, enabled: boolean): Product | null | undefined {
  const [res, setRes] = useState<{ scope: string; p: Product | null } | null>(null);
  useEffect(() => {
    if (!enabled) return; // true → false dönüşü isteği iptal etmez (temizleme yok)
    representative(scope).then(p => setRes({ scope, p })).catch(() => setRes({ scope, p: null }));
  }, [scope, enabled]);
  return res?.scope === scope ? res.p : undefined;
}

/* ───────────── useCurrentPrices ───────────── */
/** null = sunucu 404 (gizli, na ya da yok; "Derzeit nicht verfügbar"). Anahtar yoksa: henüz yüklenmedi ya da ağ hatası. */
export type CurrentPrice = { price: number; was: number } | null;
const SEP = '\u0001';

export function useCurrentPrices(ids: string[]): { prices: Record<string, CurrentPrice>; loading: boolean } {
  const key = [...new Set(ids)].sort().join(SEP);
  const [res, setRes] = useState<{ key: string; prices: Record<string, CurrentPrice>; done: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const queue = key ? key.split(SEP) : [];
    const out: Record<string, CurrentPrice> = {};
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          const p = await getProductCached(id);
          out[id] = p ? { price: p.price, was: p.was } : null;
        } catch { /* ağ hatası: anahtar yazılmaz */ }
        if (!alive) return;
        setRes({ key, prices: { ...out }, done: false });
      }
    };
    Promise.all(Array.from({ length: CHUNK_CONCURRENCY }, worker)).then(() => {
      if (alive) setRes({ key, prices: { ...out }, done: true });
    });
    return () => { alive = false; };
  }, [key]);
  const fresh = res?.key === key;
  return { prices: fresh ? res.prices : EMPTY_PRICES, loading: !fresh || !res.done };
}
const EMPTY_PRICES: Record<string, CurrentPrice> = {};

/* ───────────── Canlı fiyat: kayıtlı anlık görüntü + sunucunun güncel değeri ───────────── */
type Priced = { id: string; price: number; was: number; na: boolean };

/**
 * Anlık görüntüyü güncel değerle birleştirir (saf). null (404) → na=true; nesne → güncel fiyat, was yalnız was > price ise.
 * Anahtar yoksa (yükleniyor ya da ağ hatası) görüntü olduğu gibi döner: uydurma değer yok.
 */
export function withLive<T extends Priced>(p: T, prices: Record<string, CurrentPrice>): T {
  const c = prices[p.id];
  if (c === undefined) return p;
  if (c === null) return p.na ? p : { ...p, na: true };
  const was = c.was > c.price ? c.was : 0;
  return p.price === c.price && p.was === was && !p.na ? p : { ...p, price: c.price, was, na: false };
}

/**
 * Kayıtlı ürünler (Merkliste, listeler, son bakılanlar) için: güncel fiyat ve durumla birleştirilmiş kopya.
 * `prices`: anahtarı olmayan ürünün güncel fiyatı henüz doğrulanmadı (yükleniyor ya da ağ hatası).
 */
export function useLiveProducts<T extends Priced>(items: T[]): { items: T[]; loading: boolean; prices: Record<string, CurrentPrice> } {
  const { prices, loading } = useCurrentPrices(items.map(p => p.id));
  const live = useMemo(() => items.map(p => withLive(p, prices)), [items, prices]);
  return { items: live, loading, prices };
}

export type LiveCartLine = {
  line: CartLine;
  unit: number; // güncel birim fiyat; bilinmiyorsa anlık görüntü fiyatı
  was: number; // güncel eski fiyat (yalnız was > unit), yoksa 0
  unavailable: boolean; // sunucu 404: satın alınamaz, toplama girmez
  changed: boolean; // güncel fiyat eklenme anındakinden farklı
  confirmed: boolean; // güncel fiyat sunucudan alındı (false: yükleniyor ya da ağ hatası, unit anlık görüntüden)
};

/**
 * Sepetin canlı görünümü: Warenkorb ve Kasse toplamı, kargo eşiği hesabı ve satır fiyatları buradan okunur
 * (store bilerek toplam tutmaz). Depoya geri yazılmaz.
 * `selectedCount`/`subtotal`: seçili ve satın alınabilir satırlar. `buyableCount`: satın alınabilir satırların adedi.
 * `allSelected`: satın alınabilir satırların hepsi seçili. `confirmed`: toplamdaki her satırın fiyatı sunucudan doğrulandı.
 */
export function useLiveCart(): {
  lines: LiveCartLine[]; subtotal: number; selectedCount: number; buyableCount: number;
  allSelected: boolean; confirmed: boolean; loading: boolean;
} {
  const { cart } = useShop();
  const { prices, loading } = useCurrentPrices(cart.map(l => l.p.id));
  return useMemo(() => {
    const lines = cart.map((line): LiveCartLine => {
      const lp = withLive(line.p, prices);
      const c = prices[line.p.id];
      return { line, unit: lp.price, was: lp.was, unavailable: c === null, changed: lp.price !== line.p.price, confirmed: c !== undefined };
    });
    let sum = 0;
    let count = 0;
    let buyable = 0;
    let allSel = true;
    let confirmed = true;
    for (const l of lines) {
      if (l.unavailable) continue;
      buyable += l.line.qty;
      if (!l.line.sel) { allSel = false; continue; }
      sum += l.line.qty * l.unit;
      count += l.line.qty;
      if (!l.confirmed) confirmed = false;
    }
    return {
      lines, subtotal: Math.round(sum * 100) / 100, selectedCount: count, buyableCount: buyable,
      allSelected: buyable > 0 && allSel, confirmed, loading,
    };
  }, [cart, prices, loading]);
}

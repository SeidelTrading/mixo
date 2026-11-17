/**
 * Cihaz deposu: sepet, Merkliste, adlı listeler, son bakılanlar ve aramalar.
 * Yalnız AsyncStorage; sunucuya hiçbir şey gönderilmez.
 * Ürünün anlık görüntüsü saklanır; böylece ekranlar ağ olmadan da listelenir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../api/shop';
import { T } from '../strings';

/** Saklanan anlık görüntü. Eski (v1) kayıtlarda si yoktu → -1. */
export type Snap = Pick<Product, 'id' | 'title' | 'vendor' | 'price' | 'was' | 'img' | 'cat' | 'sub' | 'si' | 'na'>;
/** Store'a verilebilen her ürün biçimi (Product, Snap, sunucu satırı). */
export type ProductLike = Omit<Snap, 'si'> & { si?: number };

export type CartLine = { p: Snap; qty: number; sel: boolean };
/** addToCart sonucu: yalnız 'added'/'incremented' sepeti değiştirir. */
export type AddResult = 'added' | 'incremented' | 'full' | 'maxQty' | 'na';
export type RemovedLine = { line: CartLine; index: number; at: number };
export type SavedItem = { p: Snap; savedPrice: number; savedAt: number };
export type SavedList = { id: string; name: string; items: SavedItem[]; createdAt: number };

export const MERKLISTE_ID = 'merkliste';
export const STORAGE_KEY = 'mixo.v2';
export const LEGACY_STORAGE_KEY = 'mixo.demo.v1';
/** Okunamayan/bilinmeyen sürümlü v2 kaydının yedeği (üstüne yazılmadan önce). */
export const CORRUPT_KEY = 'mixo.v2.corrupt';
export const LIMITS: {
  MAX_QTY: 99; MAX_LINES: 100; MAX_LISTS: 20; MAX_LIST_ITEMS: 200;
  MAX_RECENT: 20; MAX_SEARCHES: 10; LIST_NAME_MAX: 40;
} = {
  MAX_QTY: 99, MAX_LINES: 100, MAX_LISTS: 20, MAX_LIST_ITEMS: 200,
  MAX_RECENT: 20, MAX_SEARCHES: 10, LIST_NAME_MAX: 40,
};

export type ShopCtx = {
  ready: boolean;

  // Sepet
  cart: CartLine[];
  cartCount: number;
  // Seçim sayısı, ara toplam ve "tümü seçili" bilinçli olarak burada yok: anlık görüntü fiyatıyla yanlış olurdu.
  // Ekranlar bunları hooks.ts useLiveCart'tan (güncel fiyat, sunucuda bulunmayan satırlar hariç) okur.
  addToCart: (p: ProductLike, qty?: number) => AddResult;
  setQty: (id: string, qty: number) => void;
  removeLine: (id: string) => number;
  lastRemoved: RemovedLine | null;
  undoRemove: (at?: number) => void;
  dismissUndo: (at?: number) => void;
  toggleSelect: (id: string) => void;
  selectAll: (on: boolean) => void;
  clearCart: () => void;

  // Merkliste
  favs: Snap[];
  isFav: (id: string) => boolean;
  toggleFav: (p: ProductLike) => void;

  // Meine Listen
  lists: SavedList[];
  createList: (name: string) => string | null;
  renameList: (id: string, name: string) => boolean;
  deleteList: (id: string) => void;
  isInList: (listId: string, productId: string) => boolean;
  toggleInList: (listId: string, p: ProductLike) => void;

  // Geçmiş
  recent: Snap[];
  addRecent: (p: ProductLike) => void;
  searches: string[];
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;

  clearAllData: () => Promise<void>;
};

type PersistedV2 = { v: 2; cart: CartLine[]; lists: SavedList[]; recent: Snap[]; searches: string[] };
type State = { cart: CartLine[]; lists: SavedList[]; recent: Snap[]; searches: string[]; lastRemoved: RemovedLine | null };

const MERKLISTE_NAME = T.tabMerkliste;
const emptyMerkliste = (): SavedList => ({ id: MERKLISTE_ID, name: MERKLISTE_NAME, items: [], createdAt: 0 });
const emptyState = (): State => ({ cart: [], lists: [emptyMerkliste()], recent: [], searches: [], lastRemoved: null });

// ---- Yardımcılar ----

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/** Ürünü saklanacak alanlara indirger (lq vb. saklanmaz). */
function snap(p: ProductLike): Snap {
  return {
    id: p.id, title: p.title, vendor: p.vendor, price: p.price, was: p.was, img: p.img,
    cat: p.cat, sub: p.sub, si: typeof p.si === 'number' && Number.isFinite(p.si) ? p.si : -1, na: p.na,
  };
}

/** Diskten gelen bir öğeyi doğrular; geçersizse null. */
function readSnap(x: unknown): Snap | null {
  if (!isObj(x) || typeof x.id !== 'string' || x.id === '') return null;
  if (typeof x.price !== 'number' || !Number.isFinite(x.price)) return null;
  return {
    id: x.id, title: str(x.title), vendor: str(x.vendor), price: x.price, was: num(x.was, 0),
    img: str(x.img), cat: str(x.cat), sub: str(x.sub), si: num(x.si, -1), na: x.na === true,
  };
}

function readCart(x: unknown): CartLine[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  const out: CartLine[] = [];
  for (const it of x) {
    if (!isObj(it)) continue;
    const p = readSnap(it.p);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    const qty = Math.min(LIMITS.MAX_QTY, Math.max(1, Math.floor(num(it.qty, 1))));
    out.push({ p, qty, sel: it.sel !== false });
    if (out.length >= LIMITS.MAX_LINES) break;
  }
  return out;
}

function readItems(x: unknown): SavedItem[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  const out: SavedItem[] = [];
  for (const it of x) {
    if (!isObj(it)) continue;
    const p = readSnap(it.p);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ p, savedPrice: num(it.savedPrice, p.price), savedAt: num(it.savedAt, 0) });
    if (out.length >= LIMITS.MAX_LIST_ITEMS) break;
  }
  return out;
}

function readLists(x: unknown): SavedList[] {
  const raw = Array.isArray(x) ? x : [];
  const seen = new Set<string>();
  let merk: SavedList | null = null;
  const others: SavedList[] = [];
  for (const it of raw) {
    if (!isObj(it) || typeof it.id !== 'string' || it.id === '' || seen.has(it.id)) continue;
    seen.add(it.id);
    const items = readItems(it.items);
    if (it.id === MERKLISTE_ID) {
      merk = { id: MERKLISTE_ID, name: MERKLISTE_NAME, items, createdAt: num(it.createdAt, 0) };
    } else {
      const name = str(it.name).trim().slice(0, LIMITS.LIST_NAME_MAX);
      if (name === '') continue;
      others.push({ id: it.id, name, items, createdAt: num(it.createdAt, 0) });
    }
  }
  return [merk ?? emptyMerkliste(), ...others].slice(0, LIMITS.MAX_LISTS);
}

function readRecent(x: unknown): Snap[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  const out: Snap[] = [];
  for (const it of x) {
    const p = readSnap(it);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= LIMITS.MAX_RECENT) break;
  }
  return out;
}

function readSearches(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of x) {
    if (typeof it !== 'string') continue;
    const q = it.trim();
    if (q.length < 2 || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push(q);
    if (out.length >= LIMITS.MAX_SEARCHES) break;
  }
  return out;
}

function parseV2(raw: string): State | null {
  try {
    const d: unknown = JSON.parse(raw);
    if (!isObj(d) || d.v !== 2) return null;
    return { cart: readCart(d.cart), lists: readLists(d.lists), recent: readRecent(d.recent), searches: readSearches(d.searches), lastRemoved: null };
  } catch {
    return null;
  }
}

/** v1 kaydını v2 durumuna dönüştürür. */
function parseV1(raw: string): State | null {
  try {
    const d: unknown = JSON.parse(raw);
    if (!isObj(d)) return null;
    const cart = readCart(d.cart); // sel varsayılan true, si → -1
    const items = readItems(Array.isArray(d.favs) ? d.favs.map(p => ({ p })) : []);
    const state = emptyState();
    state.cart = cart;
    state.lists = [{ ...emptyMerkliste(), items }]; // savedPrice = anlık görüntü fiyatı, savedAt 0
    return state;
  } catch {
    return null;
  }
}

const toPersisted = (s: State): PersistedV2 => ({ v: 2, cart: s.cart, lists: s.lists, recent: s.recent, searches: s.searches });

type Loaded = { state: State; writable: boolean };

/** Açılışta bir kez: v2 oku; yoksa v1'i taşı. Hiçbir durumda fırlatmaz. */
async function loadAll(): Promise<Loaded> {
  let rawV2: string | null;
  try {
    rawV2 = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Okunamadı: üstüne yazıp veri kaybetmemek için bu oturumda yazma yok.
    return { state: emptyState(), writable: false };
  }

  if (rawV2 !== null) {
    const s = parseV2(rawV2);
    if (s) {
      // Yarım kalmış önceki taşımadan artakalan eski anahtar: yalnız silinir.
      try { await AsyncStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* yoksay */ }
      return { state: s, writable: true };
    }
    // Ham kayıt, üstüne yazılabilecek her yoldan önce yedeklenir; yedeklenemezse bu oturumda yazma yok.
    try { await AsyncStorage.setItem(CORRUPT_KEY, rawV2); } catch { return { state: emptyState(), writable: false }; }
  }

  let rawV1: string | null = null;
  try {
    rawV1 = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { state: emptyState(), writable: rawV2 === null };
  }
  if (rawV1 === null) return { state: emptyState(), writable: true };

  const s = parseV1(rawV1);
  if (!s) return { state: emptyState(), writable: true }; // bozuk v1: silinmez, yok sayılır

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(s)));
  } catch {
    return { state: s, writable: true }; // eski anahtar kalır; sonraki açılışta yeniden denenir
  }
  try { await AsyncStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* yoksay */ }
  return { state: s, writable: true };
}

const newListId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Bir listeye öğe ekler/çıkarır (en yeni önde); sınır dolu ve ekleme ise aynı listeyi döndürür. */
function toggleItem(l: SavedList, p: ProductLike): SavedList {
  if (l.items.some(i => i.p.id === p.id)) return { ...l, items: l.items.filter(i => i.p.id !== p.id) };
  if (l.items.length >= LIMITS.MAX_LIST_ITEMS) return l;
  return { ...l, items: [{ p: snap(p), savedPrice: p.price, savedAt: Date.now() }, ...l.items] };
}

const C = createContext<ShopCtx | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<State>(emptyState);
  const [ready, setReady] = useState(false);
  const cur = useRef<State>(data); // eşzamanlı okuma için (removeLine dönüş değeri vb.)
  const writable = useRef(true);
  const chain = useRef<Promise<void>>(Promise.resolve()); // yazma/silme sırası
  const counter = useRef(0); // removeLine belirteci
  // Yükleme bitmeden yapılan değişiklikler: yüklenen duruma yeniden uygulanır (kaybolmasın).
  const readyRef = useRef(false);
  const early = useRef<((s: State) => State)[]>([]);
  const clearedEarly = useRef(false);
  // Tek uçuşlu yazıcı: yalnız en son durum serileştirilir; arada kalan durumlar atlanır.
  const pendingWrite = useRef<State | null>(null);
  const flushing = useRef(false);

  const commit = useCallback((fn: (s: State) => State) => {
    const n = fn(cur.current);
    if (n !== cur.current) {
      if (!readyRef.current) early.current.push(fn);
      cur.current = n;
      setData(n);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAll().then(r => {
      if (cancelled) return;
      writable.current = r.writable;
      const base = clearedEarly.current ? emptyState() : r.state;
      const n = early.current.reduce((s, f) => f(s), base);
      early.current = [];
      readyRef.current = true;
      cur.current = n;
      setData(n);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const flush = useCallback(() => {
    if (flushing.current) return;
    flushing.current = true;
    const run = async () => {
      for (let s = pendingWrite.current; s; s = pendingWrite.current) {
        pendingWrite.current = null;
        try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(s))); } catch { /* sonraki değişiklikte yeniden yazılır */ }
      }
      flushing.current = false;
    };
    chain.current = chain.current.then(run);
  }, []);

  // Yazma: yalnız yükleme bittikten sonra; lastRemoved yazılmaz.
  const { cart, lists, recent, searches, lastRemoved } = data;
  useEffect(() => {
    if (!ready || !writable.current) return;
    pendingWrite.current = { cart, lists, recent, searches, lastRemoved: null };
    flush();
  }, [ready, cart, lists, recent, searches, flush]);

  // ---- Sepet ----
  const addToCart = useCallback((p: ProductLike, qty = 1): AddResult => {
    if (p.na) return 'na';
    const q = Math.max(1, Math.floor(Number.isFinite(qty) ? qty : 1));
    // Sonuç eşzamanlı okunur (removeLine gibi); güncelleyici kendi korumalarını yine uygular.
    const c = cur.current.cart;
    const at = c.findIndex(l => l.p.id === p.id);
    if (at < 0 && c.length >= LIMITS.MAX_LINES) return 'full';
    if (at >= 0 && c[at].qty >= LIMITS.MAX_QTY) return 'maxQty';
    commit(s => {
      const i = s.cart.findIndex(l => l.p.id === p.id);
      if (i < 0) {
        if (s.cart.length >= LIMITS.MAX_LINES) return s;
        return { ...s, cart: [...s.cart, { p: snap(p), qty: Math.min(LIMITS.MAX_QTY, q), sel: true }] };
      }
      // Yeniden eklemede anlık görüntü (fiyat) yenilenir ve satır yeniden seçilir (Kasse'de görünsün).
      return { ...s, cart: s.cart.map((l, j) => (j === i ? { p: snap(p), qty: Math.min(LIMITS.MAX_QTY, l.qty + q), sel: true } : l)) };
    });
    return at < 0 ? 'added' : 'incremented';
  }, [commit]);

  const removeLine = useCallback((id: string): number => {
    const index = cur.current.cart.findIndex(l => l.p.id === id);
    if (index < 0) return -1;
    const at = ++counter.current;
    commit(s => {
      // Konum güncelleyicide yeniden bulunur (yükleme öncesi değişiklikler yüklenen duruma yeniden uygulanır).
      const i = s.cart.findIndex(l => l.p.id === id);
      if (i < 0) return s;
      return { ...s, cart: s.cart.filter((_, j) => j !== i), lastRemoved: { line: s.cart[i], index: i, at } };
    });
    return at;
  }, [commit]);

  const setQty = useCallback((id: string, qty: number) => {
    const n = Math.floor(Number.isFinite(qty) ? qty : 0);
    if (n <= 0) { removeLine(id); return; }
    commit(s => ({ ...s, cart: s.cart.map(l => (l.p.id === id ? { ...l, qty: Math.min(LIMITS.MAX_QTY, n) } : l)) }));
  }, [commit, removeLine]);

  const undoRemove = useCallback((at?: number) => {
    commit(s => {
      const r = s.lastRemoved;
      if (!r || (at !== undefined && r.at !== at)) return s;
      // Aralarda aynı ürün yeniden eklendiyse ya da sepet dolduysa satır geri konmaz.
      if (s.cart.some(l => l.p.id === r.line.p.id) || s.cart.length >= LIMITS.MAX_LINES) return { ...s, lastRemoved: null };
      const next = [...s.cart];
      next.splice(Math.min(r.index, next.length), 0, r.line);
      return { ...s, cart: next, lastRemoved: null };
    });
  }, [commit]);

  const dismissUndo = useCallback((at?: number) => {
    commit(s => (!s.lastRemoved || (at !== undefined && s.lastRemoved.at !== at) ? s : { ...s, lastRemoved: null }));
  }, [commit]);

  const toggleSelect = useCallback((id: string) => {
    commit(s => ({ ...s, cart: s.cart.map(l => (l.p.id === id ? { ...l, sel: !l.sel } : l)) }));
  }, [commit]);

  const selectAll = useCallback((on: boolean) => {
    commit(s => ({ ...s, cart: s.cart.map(l => (l.sel === on ? l : { ...l, sel: on })) }));
  }, [commit]);

  const clearCart = useCallback(() => {
    commit(s => ({ ...s, cart: [], lastRemoved: null }));
  }, [commit]);

  // ---- Listeler ----
  const toggleInList = useCallback((listId: string, p: ProductLike) => {
    commit(s => {
      let changed = false;
      const next = s.lists.map(l => {
        if (l.id !== listId) return l;
        const n = toggleItem(l, p);
        if (n !== l) changed = true;
        return n;
      });
      return changed ? { ...s, lists: next } : s;
    });
  }, [commit]);

  const toggleFav = useCallback((p: ProductLike) => toggleInList(MERKLISTE_ID, p), [toggleInList]);

  const createList = useCallback((name: string): string | null => {
    const n = cleanName(name);
    if (n === '' || n.length > LIMITS.LIST_NAME_MAX) return null;
    if (cur.current.lists.length >= LIMITS.MAX_LISTS) return null;
    const id = newListId();
    commit(s => ({ ...s, lists: [...s.lists, { id, name: n, items: [], createdAt: Date.now() }] }));
    return id;
  }, [commit]);

  const renameList = useCallback((id: string, name: string): boolean => {
    const n = cleanName(name);
    if (id === MERKLISTE_ID || n === '' || n.length > LIMITS.LIST_NAME_MAX) return false;
    if (!cur.current.lists.some(l => l.id === id)) return false;
    commit(s => ({ ...s, lists: s.lists.map(l => (l.id === id ? { ...l, name: n } : l)) }));
    return true;
  }, [commit]);

  const deleteList = useCallback((id: string) => {
    if (id === MERKLISTE_ID) return;
    commit(s => (s.lists.some(l => l.id === id) ? { ...s, lists: s.lists.filter(l => l.id !== id) } : s));
  }, [commit]);

  // ---- Geçmiş ----
  const addRecent = useCallback((p: ProductLike) => {
    commit(s => {
      // Zaten ilk sıradaysa yalnız içerik değiştiyse güncellenir (gereksiz yazma olmasın).
      const n = snap(p);
      const f = s.recent[0];
      if (f && f.id === n.id && f.price === n.price && f.was === n.was && f.title === n.title && f.img === n.img
        && f.na === n.na && f.vendor === n.vendor && f.cat === n.cat && f.sub === n.sub && f.si === n.si) return s;
      return { ...s, recent: [n, ...s.recent.filter(x => x.id !== p.id)].slice(0, LIMITS.MAX_RECENT) };
    });
  }, [commit]);

  const addSearch = useCallback((q: string) => {
    const t = q.trim().replace(/\s+/g, ' ');
    if (t.length < 2) return;
    const low = t.toLowerCase();
    commit(s => ({ ...s, searches: [t, ...s.searches.filter(x => x.toLowerCase() !== low)].slice(0, LIMITS.MAX_SEARCHES) }));
  }, [commit]);

  // Tek bir arama kapsülünü sil (büyük/küçük harf duyarsız)
  const removeSearch = useCallback((q: string) => {
    const low = q.trim().toLowerCase();
    commit(s => (s.searches.some(x => x.toLowerCase() === low) ? { ...s, searches: s.searches.filter(x => x.toLowerCase() !== low) } : s));
  }, [commit]);

  const clearSearches = useCallback(() => {
    commit(s => (s.searches.length === 0 ? s : { ...s, searches: [] }));
  }, [commit]);

  const clearAllData = useCallback((): Promise<void> => {
    // Silme, çalışan yazmanın arkasına sıralanır; bekleyen yazma iptal edilir; durum hemen sıfırlanır.
    pendingWrite.current = null;
    if (!readyRef.current) { clearedEarly.current = true; early.current = []; }
    const done = chain.current
      .then(() => AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_STORAGE_KEY]))
      .catch(() => {});
    chain.current = done;
    const n = emptyState();
    cur.current = n;
    setData(n);
    return done;
  }, []);

  const value = useMemo<ShopCtx>(() => {
    const merk = lists[0];
    return {
      ready,
      cart,
      cartCount: cart.reduce((a, l) => a + l.qty, 0),
      addToCart, setQty, removeLine, lastRemoved, undoRemove, dismissUndo, toggleSelect, selectAll, clearCart,
      favs: merk.items.map(i => i.p),
      isFav: (id: string) => merk.items.some(i => i.p.id === id),
      toggleFav,
      lists,
      createList, renameList, deleteList,
      isInList: (listId: string, productId: string) => !!lists.find(l => l.id === listId)?.items.some(i => i.p.id === productId),
      toggleInList,
      recent, addRecent, searches, addSearch, removeSearch, clearSearches,
      clearAllData,
    };
  }, [ready, cart, lists, recent, searches, lastRemoved, addToCart, setQty, removeLine, undoRemove, dismissUndo,
    toggleSelect, selectAll, clearCart, toggleFav, createList, renameList, deleteList, toggleInList,
    addRecent, addSearch, removeSearch, clearSearches, clearAllData]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useShop(): ShopCtx {
  const c = useContext(C);
  if (!c) throw new Error('ShopProvider eksik');
  return c;
}

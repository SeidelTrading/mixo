import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { orders } from './orders.mjs';

// Canlı pano iş kuralları (HTTP bilmez): K-18 ciro ve adet, K-19 günlük hedef sayaçları, K-20 spot ürün takibi.
// "Canlı" gerçek zamanlı demek değildir: veri sipariş kaydı kadar tazedir; `updatedAt` ve `stale` bunu panoya taşır.
// Durum tek belgede durur: store.doc('dashboard') = { targets, lastReset, spots }.
export const STALE_MS = 15 * 60 * 1000;
export const UNKNOWN = 'bilinmiyor';
const DAY_MS = 864e5;
const GROUPS = new Set(['company', 'shop', 'market', 'day']);
const CAT_RE = /^[\w.-]{1,40}$/;

// Hata türleri: invalid (girdi), notfound. Yönlendirme katmanı HTTP koduna çevirir.
export class DashboardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new DashboardError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const posInt = (v, name, min = 1) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > 1e9)
    fail('invalid', `${name} ${min} ya da daha büyük tam sayı olmalı`);
  return n;
};
// Gün anahtarı İstanbul saatine göre ("gece sıfırlanır" yerel geceyi kasteder).
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' });
const dayKey = t => dayFmt.format(new Date(t));

const load = () => {
  const d = store.doc('dashboard', {});
  return { targets: d.targets || {}, lastReset: d.lastReset || '', spots: d.spots || {} };
};
const save = d => store.saveDoc('dashboard', d);

/* ───────── K-18: ciro ve adet ───────── */
// Sipariş şekli (şu an): { id, t, status, items:[{id,price,qty}], total, ... }. Şirket/mağaza/pazar yeri alanı YOK;
// varsayım: ileride `company`, `shop`, `market` alanları (ya da `tenantId`) siparişe eklenir. Yoksa 'bilinmiyor' altında toplanır.
const keyOf = (o, by) => {
  if (by === 'day') return dayKey(o.t);
  const v = by === 'company' ? (o.company ?? o.tenantId) : o[by];
  return typeof v === 'string' && v.trim() ? v.trim() : UNKNOWN;
};
const toMs = (v, name) => {
  if (v === undefined || v === null || v === '') return null;
  const t = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(String(v));
  if (!Number.isFinite(t)) fail('invalid', `${name} geçersiz tarih`);
  return t;
};
const cents = n => Math.round(Number(n) * 100) || 0;

export function revenue({ from, to, groupBy = 'company' } = /** @type {any} */ ({}), now = Date.now()) {
  if (!GROUPS.has(groupBy)) fail('invalid', 'groupBy company, shop, market ya da day olmalı');
  const lo = toMs(from, 'from'),
    hi = toMs(to, 'to');
  const acc = new Map();
  let total = 0,
    count = 0,
    last = 0;
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'unverified') continue;
    if (o.t > last) last = o.t;
    if ((lo !== null && o.t < lo) || (hi !== null && o.t > hi)) continue;
    // Toplam tam sayı kuruş üzerinden: kayan nokta hatası birikmez.
    const c = cents(o.total),
      k = keyOf(o, groupBy),
      q = o.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
    const r = acc.get(k) || { key: k, cents: 0, count: 0 };
    r.cents += c;
    r.count += q;
    acc.set(k, r);
    total += c;
    count++;
  }
  const rows = [...acc.values()]
    .sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key))
    .map(r => ({ key: r.key, revenue: r.cents / 100, count: r.count }));
  return {
    groupBy,
    rows,
    total: total / 100,
    orders: count,
    // updatedAt: en son (iptal/doğrulanmamış dışı) siparişin zamanı; veri kaynağı bu kadar tazedir. null = hiç sipariş yok.
    updatedAt: last || null,
    stale: !last || now - last > STALE_MS,
  };
}

/* ───────── K-19: günlük hedef sayaçları ───────── */
const pubTarget = t => ({ cat: t.cat, label: t.label, count: t.count, left: t.left, done: t.count - t.left });

export function setTarget({ cat, label, count } = /** @type {any} */ ({}), now = Date.now()) {
  const c = str(cat, 40);
  if (!CAT_RE.test(c)) fail('invalid', 'cat gerekli (harf, rakam, - . _)');
  const n = posInt(count, 'count');
  const d = load(),
    old = d.targets[c];
  d.targets[c] = {
    cat: c,
    label: str(label, 80) || old?.label || c,
    count: n,
    left: old ? Math.min(n, Math.max(0, old.left + n - old.count)) : n,
  };
  if (!d.lastReset) d.lastReset = dayKey(now);
  save(d);
  return pubTarget(d.targets[c]);
}

// Gece sıfırlaması gün değişimine bağlıdır: son sıfırlama günü farklıysa tüm sayaçlar hedefe döner. Zamanlayıcı yoktur;
// okuma ve tüketimde tembel çağrılır, testte `now` verilebilir. Dönüş: sıfırlandıysa true.
export function resetDaily(now = Date.now()) {
  const d = load(),
    today = dayKey(now);
  if (d.lastReset === today) return false;
  for (const t of Object.values(d.targets)) t.left = t.count;
  d.lastReset = today;
  save(d);
  return true;
}

export function listTargets(now = Date.now()) {
  resetDaily(now);
  return Object.values(load().targets).map(pubTarget);
}

export function consume({ cat, qty = 1 } = /** @type {any} */ ({}), now = Date.now()) {
  const q = posInt(qty, 'qty');
  resetDaily(now);
  const d = load(),
    t = d.targets[str(cat, 40)];
  if (!t) fail('notfound', 'Hedef yok');
  t.left = Math.max(0, t.left - q); // sıfırın altına inmez
  save(d);
  return pubTarget(t);
}

/* ───────── K-20: spot ürün takibi ───────── */
// Satış kaynağı: siparişteki kalemin `id`si (ya da varsa `poolId`si) spotun poolId'sine eşitse sayılır. Mağaza evreni: kiracı belgesindeki
// mağazalar ('tenants' belgesi, yalnız okunur) + spota yazılan `allShops`. missingShops = evren eksi spotun listelendiği mağazalar.
const shopList = (v, name) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail('invalid', `${name} dizi olmalı`);
  return [...new Set(v.map(x => str(x, 80)).filter(Boolean))];
};

export function addSpot({ poolId, title, total, shops, allShops } = /** @type {any} */ ({})) {
  const pid = str(poolId, 80),
    ti = str(title, 120);
  if (!pid) fail('invalid', 'poolId gerekli');
  if (!ti) fail('invalid', 'title gerekli');
  const d = load();
  const id = 'sp-' + crypto.randomBytes(4).toString('hex');
  d.spots[id] = {
    id,
    poolId: pid,
    title: ti,
    total: posInt(total, 'total'),
    shops: shopList(shops, 'shops'),
    allShops: shopList(allShops, 'allShops'),
    created: Date.now(),
  };
  save(d);
  return d.spots[id];
}

const universe = spot => {
  const names = new Map(); // ad -> kimlikler
  for (const t of Object.values(store.doc('tenants', {}))) {
    for (const s of t?.shops || []) if (s?.name) names.set(s.name, [s.name, s.id].filter(Boolean));
  }
  for (const n of spot.allShops) names.set(n, [n]);
  for (const n of spot.shops) if (!names.has(n)) names.set(n, [n]);
  return names;
};

export function spotStatus(id, now = Date.now()) {
  const spot = load().spots[str(id, 80)];
  if (!spot) fail('notfound', 'Spot ürün yok');
  let sold = 0,
    first = 0;
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'unverified') continue;
    for (const i of o.items) {
      if (i.id !== spot.poolId && i.poolId !== spot.poolId) continue;
      sold += Number(i.qty) || 0;
      if (!first || o.t < first) first = o.t;
    }
  }
  // Günlük hız: ilk satıştan bu yana geçen güne bölünür; ilk gün 1 gün sayılır (saniyeler içinde bölmek hızı şişirmesin).
  const perDay = sold && first ? Math.round((sold / Math.max(1, (now - first) / DAY_MS)) * 100) / 100 : 0;
  const remaining = Math.max(0, spot.total - sold);
  const listed = new Set(spot.shops);
  const missingShops = [...universe(spot)]
    .filter(([name, ids]) => !ids.some(x => listed.has(x)))
    .map(([name]) => name);
  return {
    id: spot.id,
    poolId: spot.poolId,
    title: spot.title,
    total: spot.total,
    sold,
    remaining,
    perDay,
    daysLeft: perDay > 0 ? Math.ceil(remaining / perDay) : null,
    missingShops,
  };
}

export const listSpots = (now = Date.now()) => Object.keys(load().spots).map(id => spotStatus(id, now));

// Pano özeti: ciro (şirket bazında) + hedefler + spotlar.
export function summary(now = Date.now()) {
  return { revenue: revenue({ groupBy: 'company' }, now), targets: listTargets(now), spots: listSpots(now) };
}

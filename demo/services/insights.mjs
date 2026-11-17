import { store } from '../lib/store.mjs';
import { events } from './analytics.mjs';

// Pazar ve davranış içgörüleri (HTTP bilmez, ağ çağrısı yok).
// VERİ KAYNAĞI SINIRI: Bu modülde scraping, bot koruması aşma, dönen proxy, captcha çözme ya da rakip sitelere
// otomatik istek YOKTUR. Pazar yeri fiyat/satış verisi DIŞARIDAN beslenir: importMarketData() ile resmi API,
// affiliate feed ya da lisanslı sağlayıcıdan alınmış kayıtlar içeri aktarılır; `source` bu meşruluğu kayda geçirir.
// Ziyaretçi verisi yalnız çerez onayı vermiş ziyaretçilerden modele girer (bkz. consented).

export class InsightsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new InsightsError(code, msg);
};

export const MARKETS = ['trendyol', 'hepsiburada', 'n11', 'amazon', 'kaufland'];
export const SOURCES = ['api', 'affiliate', 'licensed'];
const ROW_MAX = 5000;

// VARSAYIM, gerçek oranlarla güncellenmeli: tüm tutarlar EUR'a çevrilir; kur, kargo, gümrük/vergi ve komisyon sabittir.
export const RATES = {
  fx: { EUR: 1, TRY: 0.026, USD: 0.92 }, // 1 birim = kaç EUR
  shippingEur: 7.5, // Türkiye'den Avrupa'ya adet başı kargo
  dutyPct: 0.19, // gümrük + vergi payı (alış fiyatı üzerinden)
  commissionPct: { trendyol: 0.12, hepsiburada: 0.12, n11: 0.1, amazon: 0.15, kaufland: 0.11 }, // satış fiyatı üzerinden
  tzOffsetH: 3, // saat bazlı analizde Türkiye saati
};

const load = () => store.doc('insights', { market: {}, context: [] });
const save = d => store.saveDoc('insights', d);
const r2 = n => Math.round(n * 100) / 100;
const eur = (price, cur) => price * (RATES.fx[cur] ?? fail('invalid', `Desteklenmeyen para birimi: ${cur}`));

function cleanMarket(m) {
  const k = typeof m === 'string' ? m.toLowerCase() : '';
  if (!MARKETS.includes(k)) fail('invalid', `Geçersiz pazar yeri (${MARKETS.join(', ')})`);
  return k;
}

/** @param {{ market?: any, source?: any, rows?: any }} [o] */
export function importMarketData({ market, source, rows } = {}) {
  const mk = cleanMarket(market);
  if (!SOURCES.includes(source))
    fail('invalid', `source ${SOURCES.join(' | ')} olmalı (veri kaynağı meşru olmalı)`);
  if (!Array.isArray(rows) || !rows.length) fail('invalid', 'rows boş olmayan dizi olmalı');
  if (rows.length > ROW_MAX) fail('invalid', `En çok ${ROW_MAX} satır`);
  const clean = rows.map((x, i) => {
    const ean = String(x?.ean ?? '').trim();
    if (!/^\d{8,14}$/.test(ean)) fail('invalid', `Satır ${i + 1}: geçersiz ean`);
    const price = Number(x.price);
    if (!Number.isFinite(price) || price <= 0) fail('invalid', `Satır ${i + 1}: geçersiz price`);
    const currency = String(x.currency || 'EUR').toUpperCase();
    eur(1, currency);
    const s = x.sales30d === undefined ? 0 : Number(x.sales30d);
    if (!Number.isFinite(s) || s < 0) fail('invalid', `Satır ${i + 1}: geçersiz sales30d`);
    const cat = typeof x.cat === 'string' ? x.cat.trim().toLowerCase().slice(0, 40) : '';
    return { ean, title: String(x.title ?? '').slice(0, 200), price, currency, sales30d: s, cat };
  });
  const d = load(),
    t = Date.now();
  for (const r of clean) (d.market[r.ean] ??= {})[mk] = { ...r, source, t };
  save(d);
  return { ok: true, market: mk, source, imported: clean.length };
}

// Hava / iade / şikayet verisi dışarıdan beslenir. Satır: { type: 'weather'|'returns'|'complaints', key, value }.
const CONTEXT_TYPES = ['weather', 'returns', 'complaints'];
/** @param {{ rows?: any }} [o] */
export function importContext({ rows } = {}) {
  if (!Array.isArray(rows) || !rows.length) fail('invalid', 'rows boş olmayan dizi olmalı');
  if (rows.length > ROW_MAX) fail('invalid', `En çok ${ROW_MAX} satır`);
  const clean = rows.map((x, i) => {
    if (!CONTEXT_TYPES.includes(x?.type))
      fail('invalid', `Satır ${i + 1}: type ${CONTEXT_TYPES.join(' | ')} olmalı`);
    const value = Number(x.value);
    if (!Number.isFinite(value)) fail('invalid', `Satır ${i + 1}: geçersiz value`);
    return { type: x.type, key: String(x.key ?? '').slice(0, 60) || '*', value };
  });
  const d = load();
  d.context = [...d.context, ...clean].slice(-ROW_MAX);
  save(d);
  return { ok: true, imported: clean.length };
}

/** @param {{ eans?: any }} [o] */
export function compare({ eans } = {}) {
  if (!Array.isArray(eans) || !eans.length) fail('invalid', 'eans boş olmayan dizi olmalı');
  const d = load();
  return eans.slice(0, 200).map(e => {
    const ean = String(e).trim(),
      m = d.market[ean];
    if (!m) fail('notfound', `EAN için veri yok: ${ean}`);
    const rows = Object.entries(m).map(([market, v]) => ({
      market,
      price: r2(eur(v.price, v.currency)),
      sales30d: v.sales30d,
    }));
    const ps = rows.map(r => r.price),
      min = Math.min(...ps),
      max = Math.max(...ps);
    return { ean, currency: 'EUR', rows, min, max, spread: r2(max - min) };
  });
}

// Net marj = satış − alış − kargo − gümrük/vergi − hedef pazar komisyonu (hepsi EUR).
/** @param {{ fromMarkets?: any, toMarkets?: any, minMargin?: any }} [o] */
export function arbitrage({ fromMarkets, toMarkets, minMargin = 0 } = {}) {
  const from = (fromMarkets || []).map(cleanMarket),
    to = (toMarkets || []).map(cleanMarket);
  if (!from.length || !to.length) fail('invalid', 'fromMarkets ve toMarkets gerekli');
  const min = Number(minMargin);
  if (!Number.isFinite(min)) fail('invalid', 'minMargin sayı olmalı');
  const out = [];
  for (const [ean, m] of Object.entries(load().market)) {
    const buys = from.filter(k => m[k]).map(k => ({ market: k, price: eur(m[k].price, m[k].currency) }));
    const sells = to.filter(k => m[k]).map(k => ({ market: k, price: eur(m[k].price, m[k].currency) }));
    if (!buys.length || !sells.length) continue;
    const buy = buys.reduce((a, b) => (b.price < a.price ? b : a)),
      sell = sells.reduce((a, b) => (b.price > a.price ? b : a));
    const costs = {
      shipping: RATES.shippingEur,
      duty: r2(buy.price * RATES.dutyPct),
      commission: r2(sell.price * RATES.commissionPct[sell.market]),
    };
    const netMargin = r2(sell.price - buy.price - costs.shipping - costs.duty - costs.commission);
    if (netMargin < min) continue;
    out.push({
      ean,
      title: (m[buy.market] || m[sell.market]).title,
      buy: { market: buy.market, price: r2(buy.price) },
      sell: { market: sell.market, price: r2(sell.price) },
      costs,
      netMargin,
      marginPct: r2((netMargin / buy.price) * 100),
    });
  }
  return out.sort((a, b) => b.netMargin - a.netMargin);
}

// ÇEREZ ONAYI KAPISI: tek yer. Yalnız e.consent === true ya da e.c === 1 olan olay modele girer; diğerleri sayılmaz.
// (Olayın kategori alanı `c` string'tir; onay işareti sayısal 1 olduğundan karışmaz.)
const consented = e => e.consent === true || e.c === 1;
function consentedEvents(days) {
  days = Math.min(90, Math.max(1, Number(days) || 7));
  const from = Date.now() - days * 864e5,
    ev = [];
  let skipped = 0;
  for (const e of events) {
    if (e.t < from) continue;
    if (consented(e)) ev.push(e);
    else skipped++;
  }
  return { ev, skipped, days, from };
}

// K-28: son yarı dönem ile önceki yarı dönem görüntüleme karşılaştırılır; içeri aktarılan satış verisi payla destekler.
export function categoryTrends({ days = 14 } = {}) {
  const { ev, days: dd } = consentedEvents(days),
    mid = Date.now() - (dd * 864e5) / 2;
  const cats = new Map(),
    get = c => cats.get(c) || (cats.set(c, { recent: 0, prior: 0, sales: 0 }), cats.get(c));
  for (const e of ev)
    if (e.e === 'view' && typeof e.c === 'string') get(e.c)[e.t >= mid ? 'recent' : 'prior']++;
  let salesTotal = 0;
  for (const m of Object.values(load().market))
    for (const v of Object.values(m))
      if (v.cat) ((get(v.cat).sales += v.sales30d), (salesTotal += v.sales30d));
  return [...cats]
    .map(([cat, x]) => {
      const growth = (x.recent - x.prior) / Math.max(x.prior, 1),
        salesShare = salesTotal ? x.sales / salesTotal : 0;
      const score = r2(Math.max(-1, Math.min(1, growth)) + salesShare);
      const direction = score > 0.15 ? 'up' : score < -0.15 ? 'down' : 'flat';
      const basis =
        `Görüntüleme son ${Math.ceil(dd / 2)} günde ${x.recent}, öncesinde ${x.prior}` +
        (salesTotal ? `; içeri aktarılan satışlarda payı %${r2(salesShare * 100)}` : '; satış verisi yok');
      return { cat, score, direction, basis };
    })
    .sort((a, b) => b.score - a.score);
}

/** @type {[string, (e: any) => boolean][]} */
const STEPS = [
  ['Ziyaret', () => true],
  ['Ürün görüntüleme', e => e.e === 'view'],
  ['Sepete ekleme', e => e.e === 'add'],
  ['Sepet açma', e => e.e === 'cart_open'],
  ['Ödeme', e => e.e === 'checkout'],
];
// K-29: her adımda ziyaretçi sayısı; adım ziyaretçisi bir önceki adımın kümesinin alt kümesidir (huni).
export function funnel({ days = 7 } = {}) {
  const { ev, skipped } = consentedEvents(days);
  let prev = new Set(ev.map(e => e.vid)),
    prevN = prev.size;
  const consentedVisitors = prevN,
    steps = [];
  for (const [step, f] of STEPS) {
    const cur = new Set(ev.filter(e => f(e) && prev.has(e.vid)).map(e => e.vid));
    steps.push({ step, visitors: cur.size, dropPct: prevN ? r2(((prevN - cur.size) / prevN) * 100) : 0 });
    prev = cur;
    prevN = cur.size;
  }
  const worst = steps.slice(1).reduce((a, b) => (!a || b.dropPct > a.dropPct ? b : a), null);
  return {
    steps,
    worstStep: worst && steps[0].visitors ? worst.step : null,
    consented: consentedVisitors,
    skippedNoConsent: skipped,
  };
}

const NO_DATA = 'veri yok';
// Bölge (olayda e.rg varsa) ve saat bazında dönüşüm; hava/iade/şikayet importContext ile gelir. Olmayan boyut "veri yok".
export function cohort({ days = 7 } = {}) {
  const { ev, skipped } = consentedEvents(days);
  const group = keyOf => {
    const m = new Map();
    for (const e of ev) {
      const k = keyOf(e);
      if (k === null) continue;
      const g = m.get(k) || { v: new Set(), c: new Set() };
      m.set(k, g);
      g.v.add(e.vid);
      if (e.e === 'checkout') g.c.add(e.vid);
    }
    if (!m.size) return NO_DATA;
    return [...m]
      .map(([key, g]) => ({
        key,
        visitors: g.v.size,
        converted: g.c.size,
        conversionPct: r2((g.c.size / g.v.size) * 100),
      }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key), 'tr', { numeric: true }));
  };
  const ctx = type => {
    const rows = load().context.filter(x => x.type === type);
    if (!rows.length) return NO_DATA;
    const m = new Map();
    for (const x of rows) {
      const g = m.get(x.key) || { n: 0, sum: 0 };
      g.n++;
      g.sum += x.value;
      m.set(x.key, g);
    }
    return [...m].map(([key, g]) => ({ key, avg: r2(g.sum / g.n), n: g.n }));
  };
  return {
    consented: new Set(ev.map(e => e.vid)).size,
    skippedNoConsent: skipped,
    region: group(e => (typeof e.rg === 'string' && e.rg ? e.rg : null)),
    hour: group(e => new Date(e.t + RATES.tzOffsetH * 36e5).getUTCHours()),
    weather: ctx('weather'),
    returns: ctx('returns'),
    complaints: ctx('complaints'),
  };
}

export function summary() {
  const d = load(),
    eans = Object.keys(d.market);
  const perMarket = {};
  for (const m of Object.values(d.market))
    for (const k of Object.keys(m)) perMarket[k] = (perMarket[k] || 0) + 1;
  return { markets: MARKETS, eans: eans.length, perMarket, contextRows: d.context.length, rates: RATES };
}

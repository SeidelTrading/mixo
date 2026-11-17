import { store } from '../lib/store.mjs';
import { money } from './pricing.mjs';
import { dict } from '../lib/safe.mjs';

// Şirket bazlı fiyat stratejisi (HTTP bilmez). Rakip (buy box) fiyatı YALNIZ resmi API ya da lisanslı sağlayıcıdan gelir
// ve bu dosyaya parametre olarak verilir; burada hiçbir ağ çağrısı, scraping, proxy ya da captcha kodu yoktur.
// Taban fiyat her zaman maliyetten hesaplanır, elle girilmez; rakip tabanın altındaysa fiyat düşürülmez.

// Pazar yeri komisyon oranları (satış fiyatının oranı). VARSAYIM, sözleşmeye göre güncellenmeli.
export const COMMISSION = { amazon: 0.15, kaufland: 0.12, idealo: 0.0 };
export const DEFAULT_MIN_MARGIN = 0.05; // maliyetin oranı; VARSAYIM
const ALL = '*'; // varsayılan strateji kaydı (şirket kaydı yoksa bu geçerli)

export class PriceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new PriceError(code, msg);
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const lc = s => str(s, 120).toLowerCase();
const num = v => (v === undefined || v === null || v === '' ? NaN : Number(v));

const load = () => {
  const d = store.doc('price_strategy', { strategies: {} });
  return dict(d && typeof d.strategies === 'object' && d.strategies ? d.strategies : {});
};
const run = fn => store.tx(fn);

export function setStrategy(input) {
  const o = input ?? {};
  const company = str(o.company, 120) || ALL;
  const minMargin = o.minMargin === undefined ? DEFAULT_MIN_MARGIN : num(o.minMargin);
  if (!Number.isFinite(minMargin) || minMargin < 0 || minMargin > 5) fail('invalid', 'Geçersiz minMargin');
  if (o.excluded !== undefined && !Array.isArray(o.excluded)) fail('invalid', 'excluded dizi olmalı');
  const rec = {
    company,
    enabled: o.enabled !== false,
    buyBox: o.buyBox !== false,
    minMargin,
    excluded: [...new Set((o.excluded ?? []).map(x => str(x, 120)).filter(Boolean))],
  };
  run(() => {
    const all = load();
    all[lc(company)] = rec;
    store.saveDoc('price_strategy', { strategies: all });
  });
  return rec;
}

export const listStrategies = () => Object.values(load());
export const getStrategy = company => load()[lc(company)] ?? load()[ALL] ?? null;

export function removeStrategy(company) {
  run(() => {
    const all = load(),
      k = lc(company || ALL);
    if (!all[k]) fail('notfound', 'Strateji yok');
    delete all[k];
    store.saveDoc('price_strategy', { strategies: all });
  });
}

// Taban = (maliyet + kargo + maliyet × asgari marj) / (1 − komisyon); komisyon satış fiyatı üzerinden alındığı için
// bu fiyatta komisyon düşüldükten sonra maliyet, kargo ve marj tam karşılanır. Kuruşa yukarı yuvarlanır.
export function floorPrice(arg) {
  const { cost, market, shipping = 0, minMargin = DEFAULT_MIN_MARGIN } = arg ?? {};
  const c = num(cost),
    s = num(shipping),
    mm = num(minMargin);
  if (!Number.isFinite(c) || c < 0) fail('invalid', 'Geçersiz maliyet');
  if (!Number.isFinite(s) || s < 0) fail('invalid', 'Geçersiz kargo');
  if (!Number.isFinite(mm) || mm < 0) fail('invalid', 'Geçersiz marj');
  const rate = COMMISSION[lc(market)];
  if (rate === undefined) fail('invalid', `Bilinmeyen pazar yeri: ${str(market, 40)}`);
  return Math.ceil(((c + s + c * mm) / (1 - rate)) * 100 - 1e-9) / 100;
}

// → { price, floor, action: 'hold'|'match'|'skip', reason }; price yalnız 'match' için dolu (aksi halde fiyat değişmez).
export function priceDecision(arg) {
  const { company, market, cost, shipping, competitorPrice } = arg ?? {};
  const st = getStrategy(company);
  const floor = floorPrice({ cost, market, shipping, minMargin: st?.minMargin });
  const hold = reason => ({ price: null, floor, action: 'hold', reason });
  const all = load()[ALL];
  const out = [...(st?.excluded ?? []), ...(all?.excluded ?? [])].map(lc);
  if (out.includes(lc(company))) return hold('strateji dışı');
  if (!st) return hold('şirket için fiyat stratejisi tanımlı değil');
  if (!st.enabled) return hold('strateji kapalı');
  if (!st.buyBox) return hold('buy box takibi kapalı');
  const comp = num(competitorPrice);
  if (!Number.isFinite(comp) || comp <= 0) return hold('rakip fiyatı yok');
  if (comp < floor)
    return {
      price: null,
      floor,
      action: 'skip',
      reason: `rakip fiyatı (${money(comp)}) taban fiyatın (${floor}) altında; inilmez`,
    };
  return { price: money(comp), floor, action: 'match', reason: 'rakip fiyatına eşitlendi' };
}

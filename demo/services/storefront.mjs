import { P } from './catalog.mjs';
import { changes, settings } from './settings.mjs';
import { effP } from './overrides.mjs';
import { isHidden } from './visibility.mjs';
import { liveOrders } from './orders.mjs';
import { freeShip } from './pricing.mjs';
import { homeCache } from '../lib/cache.mjs';
import { events } from './analytics.mjs';

// Vitrin: indirimli ürünler (eski fiyat > fiyat) ve çok bakılan/eklenen ürünler
// Katalogda eski fiyat yok; indirim yalnızca yönetici eski fiyat girerse (overrides.was) görünür. Sahte indirim uydurulmaz.
const hashId = id => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
};
const pool = (lo, hi) =>
  [...P.values()]
    .filter(p => !p.na && p.price >= lo && p.price <= hi)
    .sort((a, b) => hashId(a.id) - hashId(b.id));
const BUDGET_POOL = pool(8, 25),
  PREMIUM_POOL = pool(120, 2000);
const pickDiverse = (list, n, per = 2) => {
  const c = Object.create(null),
    out = [];
  for (const p of list) {
    if (!shopOk(p)) continue;
    if ((c[p.vendor] = (c[p.vendor] || 0) + 1) > per) continue;
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
};
export const shopRow = p => {
  const e = effP(p);
  return {
    id: p.id,
    title: e.title,
    vendor: p.vendor,
    price: e.price,
    was: e.was || 0,
    img: e.img,
    cat: p.cat,
    si: p.si,
    sub: p.sub,
    na: !!e.na,
  };
};
export const shopOk = p => p && !isHidden(p.id) && !settings.categories[p.cat]?.hidden && !effP(p).na;
export function shopHome() {
  if (homeCache.v && Date.now() - homeCache.t < 30e3 && homeCache.rev === changes.length) return homeCache.v;
  const deals = pickDiverse(
    [
      ...(settings.overrides
        ? Object.keys(settings.overrides)
            .map(id => P.get(id))
            .filter(p => p && effP(p).was > effP(p).price)
        : []),
    ].sort((a, b) => 1 - effP(b).price / effP(b).was - (1 - effP(a).price / effP(a).was)),
    12,
    3,
  );
  // Ağırlık tavanı: bir müşteri (e-posta) ya da bir ziyaretçi, bir ürüne her sinyal türünden en çok bir kez katkı yapar;
  // tek kaynaktan tekrarlanan sahte olay/siparişle şerit belirlenemez.
  // Ayrıca bir ürünün şeride girmesi için en az iki ayrı kaynaktan (ziyaretçi/müşteri) sinyal gerekir.
  const sold = new Map(),
    once = new Set(),
    actors = new Map(),
    first = k => (once.has(k) ? false : (once.add(k), true)),
    who = (id, a) => (actors.get(id) || actors.set(id, new Set()).get(id)).add(a);
  for (const o of liveOrders())
    for (const i of o.items) {
      who(i.id, 'o:' + o.customer.email);
      if (first('o|' + o.customer.email + '|' + i.id)) sold.set(i.id, (sold.get(i.id) || 0) + 5);
    }
  const from = Date.now() - 30 * 864e5;
  for (const x of events)
    if (
      x.t >= from &&
      x.id &&
      (x.e === 'add' || x.e === 'view') &&
      (who(x.id, 'v:' + x.vid), first(x.e + '|' + x.vid + '|' + x.id))
    )
      sold.set(x.id, (sold.get(x.id) || 0) + (x.e === 'add' ? 3 : 1));
  let best = [...sold]
    .filter(([id]) => actors.get(id)?.size >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => P.get(id))
    .filter(shopOk)
    .slice(0, 12);
  const source = best.length >= 6 ? 'behavior' : 'curated';
  if (source === 'curated')
    best = settings.featured
      .map(id => P.get(id))
      .filter(shopOk)
      .concat(pickDiverse(PREMIUM_POOL, 12, 1))
      .slice(0, 12);
  const v = {
    deals: deals.map(shopRow),
    best: best.map(shopRow),
    bestSource: source,
    budget: pickDiverse(BUDGET_POOL, 12, 1).map(shopRow),
    premium: pickDiverse(PREMIUM_POOL.slice().reverse(), 12, 1).map(shopRow),
    freeShip: freeShip(),
  };
  Object.assign(homeCache, { t: Date.now(), rev: changes.length, v });
  return v;
}

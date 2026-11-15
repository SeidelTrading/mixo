import { P, PROBLEMS, norm } from './catalog.mjs';
import { saveSettings, settings } from './settings.mjs';
import { baseOf, effP } from './overrides.mjs';

// Onay kuralı: sorunlu listesindeki (ve “sorun değil” denmemiş) ürün, yönetici onaylayana kadar mağazada görünmez.
// settings.hidden yalnızca elle gizlemeyi tutar; “Göster” onay kuralını aşamaz, tek yol “Onayla”dır.
export const PROBLEM_IDS = new Set(PROBLEMS.map(p => p.id));
export const isProblem = id => PROBLEM_IDS.has(id) && P.has(id) && !settings.cleared[id];
export const isPending = id => isProblem(id) && !settings.approved[id];
export const isHidden = id => !!settings.hidden[id] || isPending(id);
// Eski sürümden geçiş (bir kez): otomatik “fotoğraf sorunlu” gizlemesi kalkar, yerini onay kuralı alır.
// Eski sürümde yönetici elle görünür yaptığı sorunlu ürünler onaylı sayılır; ilk kurulumda hepsi onay bekler.
if (!settings.approvalV2) {
  let moved = 0,
    kept = 0;
  for (const id of PROBLEM_IDS) {
    if (settings.hidden[id] === 'fotoğraf sorunlu') {
      delete settings.hidden[id];
      moved++;
    } else if (settings.seededProblems && !settings.hidden[id] && !settings.cleared[id]) {
      settings.approved[id] = true;
      kept++;
    }
  }
  for (const id of Object.keys(settings.hidden))
    if (settings.hidden[id] === 'fotoğraf sorunlu') delete settings.hidden[id]; // sorunlu listesinden çıkmış eski kayıtlar
  settings.approvalV2 = true;
  delete settings.seededProblems;
  saveSettings();
  console.log(`onay geçişi: ${moved} ürün onay kuyruğuna alındı, ${kept} ürün onaylı sayıldı`);
}
export const hiddenIds = () => [
  ...new Set([...Object.keys(settings.hidden), ...PROBLEM_IDS].filter(isHidden)),
];
// Mağaza sayaçları için: gizli ürünlerin kategori / alt kategori kırılımı
function hiddenCounts() {
  const cats = {},
    subs = {};
  let total = 0;
  for (const id of hiddenIds()) {
    const p = P.get(id);
    if (!p) continue;
    total++;
    cats[p.cat] = (cats[p.cat] || 0) + 1;
    const k = p.cat + '/' + p.si;
    subs[k] = (subs[k] || 0) + 1;
  }
  return { total, cats, subs };
}
export const publicConfig = () => ({
  announcement: settings.announcement,
  hidden: hiddenIds(),
  hiddenCounts: hiddenCounts(),
  featured: settings.featured
    .map(id => P.get(id))
    .filter(p => p && !isHidden(p.id))
    .map(effP),
  overrides: settings.overrides,
  content: settings.content,
  categories: settings.categories,
});
export const openProblems = () => PROBLEMS.filter(p => !settings.cleared[p.id] && P.has(p.id));
/** @param {{ type?: string, brand?: string, category?: string, q?: string, state?: string }} [f] */
export function filterProblems({ type, brand, category, q, state } = {}) {
  const nq = q ? norm(q) : '';
  return openProblems().filter(
    p =>
      (!type || p.tur === type) &&
      (!brand || norm(p.vendor) === norm(brand)) &&
      (!category || p.cat === category || norm(p.catLabel) === norm(category)) &&
      (!nq || norm(p.title + ' ' + p.vendor).includes(nq)) &&
      (!state || (state === 'pending') === !settings.approved[p.id]),
  );
}
const HAY = new Map(),
  hayOf = p => {
    let h = HAY.get(p.id);
    if (h === undefined) {
      h = norm(p.title + ' ' + p.vendor + ' ' + p.id);
      HAY.set(p.id, h);
    }
    return h;
  };
export const adminItem = p => {
  const e = effP(p),
    o = settings.overrides[p.id];
  return {
    id: p.id,
    title: e.title,
    vendor: p.vendor,
    price: e.price,
    was: e.was || 0,
    img: e.img,
    cat: p.cat,
    catLabel: p.catLabel,
    sub: p.sub,
    na: !!e.na,
    hidden: !!settings.hidden[p.id],
    pending: isPending(p.id),
    edited: !!o,
    featured: settings.featured.includes(p.id),
    orig: o ? baseOf(p) : undefined,
  };
};
/** @param {{ q?: string, category?: string, brand?: string, state?: string }} [f] */
export function listProducts({ q, category, brand, state } = {}) {
  const ws = norm(q || '')
      .split(/\s+/)
      .filter(Boolean),
    nb = brand ? norm(brand) : '',
    out = [];
  for (const p of P.values()) {
    if (category && p.cat !== category) continue;
    if (nb && !norm(p.vendor).includes(nb)) continue;
    if (state === 'hidden' && !isHidden(p.id)) continue;
    if (state === 'edited' && !settings.overrides[p.id]) continue;
    if (state === 'na' && !effP(p).na) continue;
    if (ws.length) {
      const o = settings.overrides[p.id],
        h = hayOf(p) + (o?.title ? ' ' + norm(o.title) : '');
      if (!ws.every(w => h.includes(w))) continue;
    }
    out.push(p);
  }
  return out;
}
export function searchProducts(q, category, limit = 10) {
  const ws = norm(q || '')
      .split(/\s+/)
      .filter(Boolean),
    out = [];
  for (const p of P.values()) {
    if (category && p.cat !== category && norm(p.catLabel) !== norm(category)) continue;
    const h = norm(effP(p).title + ' ' + p.vendor + ' ' + p.sub);
    if (ws.every(w => h.includes(w))) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

import { MAX_ITEMS } from './shared.mjs';

// Öneri yardımcıları: ürün satırı, kullanılabilirlik, tamamlama, sıralama.
export function makeSuggestHelpers(c) {
  const { effP, shopOk, P } = c;
  /* ───────── 1. kampanya önerileri ───────── */
  const row = (p, note) => {
    const e = effP(p);
    return {
      id: p.id,
      title: e.title,
      vendor: p.vendor,
      price: e.price,
      was: e.was || 0,
      img: e.img,
      cat: p.cat,
      note,
    };
  };
  const usable = p => p && shopOk(p) && effP(p).price > 0 && effP(p).img;
  // kaynak (olay verisinden gelenler) önce; yetmezse katalogdan (marka başına ≤2) tamamlanır ve notla işaretlenir
  function fill(primary, pad, label) {
    const out = [],
      seen = new Set();
    for (const [id, n] of primary) {
      const p = P.get(id);
      if (usable(p) && !seen.has(id)) {
        seen.add(id);
        out.push(row(p, `${n} kez ${label}`));
        if (out.length >= MAX_ITEMS) return out;
      }
    }
    const v = {};
    for (const p of pad()) {
      if (!usable(p) || seen.has(p.id) || (v[p.vendor] = (v[p.vendor] || 0) + 1) > 2) continue;
      seen.add(p.id);
      out.push(row(p, 'katalogdan (davranış verisi değil)'));
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]);
  return { row, usable, fill, top };
}

// Olayları ürün, kategori, marka, sepete ekleme ve arama sayaçlarına toplar.
export function aggregate(ev, norm) {
  const pv = new Map(),
    pa = new Map(),
    cats = new Map(),
    brands = new Map(),
    sq = new Map();
  for (const x of ev) {
    if (x.e === 'view') {
      if (x.id) pv.set(x.id, (pv.get(x.id) || 0) + 1);
      if (x.c) cats.set(x.c, (cats.get(x.c) || 0) + 1);
      if (x.b) brands.set(x.b, (brands.get(x.b) || 0) + 1);
    }
    if (x.e === 'add' && x.id) pa.set(x.id, (pa.get(x.id) || 0) + 1);
    if (x.e === 'search' && x.q) {
      const k = norm(x.q),
        q = sq.get(k) || { q: x.q, count: 0, results: x.n ?? null };
      q.count++;
      q.results = x.n ?? q.results;
      sq.set(k, q);
    }
  }
  return { pv, pa, cats, brands, sq };
}

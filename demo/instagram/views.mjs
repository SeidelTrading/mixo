import { DAY } from './shared.mjs';

// Panel görünümleri ve öneriler.
export function makeViews(c) {
  const { snap, flagsOf, P, effP, db, shopOk, imageUrl } = c;
  /* ───────── yönetici API'si ───────── */
  const view = po => ({
    ...po,
    title: snap(po),
    flags: flagsOf(po),
    product: P.get(po.pid) ? { id: po.pid, vendor: P.get(po.pid).vendor } : null,
  });
  const inboxView = it => ({
    ...it,
    windowOpen: it.type !== 'dm' || Date.now() - it.t < DAY,
    product:
      it.productId && P.get(it.productId)
        ? { id: it.productId, title: effP(P.get(it.productId)).title, price: effP(P.get(it.productId)).price }
        : null,
  });
  function suggest(n) {
    const used = new Set(
        db.posts.filter(x => x.status === 'draft' || x.status === 'published').map(x => x.pid),
      ),
      seen = {},
      out = [],
      all = [...P.values()];
    const start = Math.floor(Math.random() * all.length); // rastgele başlangıç, asal adımla tarama; marka başına en çok 1
    for (let i = 0; i < all.length && out.length < n; i++) {
      const p = all[(start + i * 7919) % all.length];
      if (!shopOk(p) || !(p.price > 0) || used.has(p.id) || !imageUrl(p) || seen[p.vendor]) continue;
      seen[p.vendor] = 1;
      out.push(p);
    }
    return out.map(p => ({
      id: p.id,
      title: effP(p).title,
      vendor: p.vendor,
      price: effP(p).price,
      img: effP(p).img,
    }));
  }
  const ok = (obj = {}) => ({ code: 200, obj: { ok: true, ...obj } }),
    bad = (code, error) => ({ code, obj: { error } });
  return { view, inboxView, suggest, ok, bad };
}

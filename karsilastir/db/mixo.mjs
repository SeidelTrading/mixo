import { totalPrice } from '../lib/pricing.mjs';

const DAY = 86400000;
const MIXO_SITE = 'mixoutlet.de';
/** Mixoutlet mağaza satırları (www'li/www'siz alan adı). */
const mixoIds = db =>
  db
    .prepare("SELECT id FROM shops WHERE market = 'de' AND replace(lower(domain), 'www.', '') = ?")
    .all(MIXO_SITE)
    .map(r => r.id);

/**
 * Mixoutlet kapsama özeti. total: katalog büyüklüğü (yapılandırılır, varsayılan 44.862); known: veritabanında bilinen
 * Mixoutlet ürünü (EAN'lı teklif + eşleşmemiş); withEan: EAN'a bağlanmış; covered: en az bir rakip fiyatı olan.
 * byShop: rakip mağaza başına eşleşen Mixoutlet ürünü sayısı.
 */
export function mixoSummary(db, now, maxAgeDays, total) {
  const ids = mixoIds(db);
  const empty = { total, known: 0, withEan: 0, covered: 0, cheaper: 0, byShop: [], hasShop: ids.length > 0 };
  if (!ids.length) return empty;
  const q = ids.map(() => '?').join(',');
  const since = now - maxAgeDays * DAY;
  const unmatched = db.prepare(`SELECT count(*) n FROM unmatched WHERE shopId IN (${q})`).get(...ids).n;
  const withEan = db.prepare(`SELECT count(*) n FROM offers WHERE shopId IN (${q})`).get(...ids).n;
  const pairs = db
    .prepare(
      `SELECT o.ean, o.price + o.shipping AS mixo, s.name AS shop, min(c.price + c.shipping) AS best
       FROM offers o
       JOIN offers c ON c.ean = o.ean AND c.shopId NOT IN (${q}) AND c.seenAt >= ?
       JOIN shops s ON s.id = c.shopId AND s.market = 'de' AND s.active = 1 AND s.blocked = 0
       WHERE o.shopId IN (${q}) GROUP BY o.ean, s.id`,
    )
    .all(...ids, since, ...ids);
  const eans = new Map();
  const byShop = new Map();
  for (const p of pairs) {
    const e = eans.get(p.ean) ?? { mixo: p.mixo, best: Infinity };
    e.best = Math.min(e.best, p.best);
    eans.set(p.ean, e);
    byShop.set(p.shop, (byShop.get(p.shop) ?? 0) + 1);
  }
  return {
    total,
    known: unmatched + withEan,
    withEan,
    covered: eans.size,
    cheaper: [...eans.values()].filter(e => e.mixo <= e.best).length,
    byShop: [...byShop].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    hasShop: true,
  };
}

/**
 * Ürün başına karşılaştırma satırları (yalnız rakibi olanlar). sort: 'diff' (Mixoutlet en pahalı önce, varsayılan),
 * 'cheap' (Mixoutlet en ucuz önce), 'shops' (en çok rakip).
 * Fark: diff = mixo − en ucuz rakip (€, kargo dahil); pct = diff / en ucuz rakip × 100.
 */
export function mixoComparison(db, now, maxAgeDays, { sort = 'diff', limit = 50, offset = 0 } = {}) {
  const ids = mixoIds(db);
  if (!ids.length) return { total: 0, items: [] };
  const q = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT p.ean, p.title, p.brand, p.image, o.id AS offerId, o.price, o.shipping, o.url,
              c.price AS cp, c.shipping AS cs, c.url AS curl, c.id AS cid, s.name AS shop
       FROM offers o JOIN products p ON p.ean = o.ean
       JOIN offers c ON c.ean = o.ean AND c.shopId NOT IN (${q}) AND c.seenAt >= ?
       JOIN shops s ON s.id = c.shopId AND s.market = 'de' AND s.active = 1 AND s.blocked = 0
       WHERE o.shopId IN (${q}) AND c.inStock = 1`,
    )
    .all(...ids, now - maxAgeDays * DAY, ...ids);
  const by = new Map();
  for (const r of rows) {
    const p = by.get(r.ean) ?? {
      ean: r.ean,
      title: r.title,
      brand: r.brand,
      image: r.image,
      mixo: totalPrice(r),
      mixoOfferId: r.offerId,
      rivals: [],
    };
    p.rivals.push({ shop: r.shop, total: totalPrice({ price: r.cp, shipping: r.cs }), offerId: r.cid });
    by.set(r.ean, p);
  }
  const list = [...by.values()].map(p => {
    p.rivals.sort((a, b) => a.total - b.total);
    const best = p.rivals[0].total;
    return {
      ...p,
      best,
      diff: Math.round((p.mixo - best) * 100) / 100,
      pct: Math.round(((p.mixo - best) / best) * 1000) / 10,
    };
  });
  const cmp =
    {
      diff: (a, b) => b.pct - a.pct,
      cheap: (a, b) => a.pct - b.pct,
      shops: (a, b) => b.rivals.length - a.rivals.length || b.pct - a.pct,
    }[sort] ?? ((a, b) => b.pct - a.pct);
  list.sort(cmp);
  return { total: list.length, items: list.slice(offset, offset + limit) };
}

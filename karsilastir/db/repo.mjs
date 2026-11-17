import { dayOf, fold } from '../db.mjs';
import { totalPrice } from '../lib/pricing.mjs';

const DAY = 86400000;

export const getShop = (db, id) => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);

export function addShop(db, s) {
  const r = db
    .prepare(
      `INSERT INTO shops (market, name, domain, shippingDefault, active, feedUrl, feedFormat, feedMapping, feedIntervalHours)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      s.market,
      s.name,
      s.domain,
      s.shippingDefault ?? 0,
      s.feedUrl ?? null,
      s.feedFormat ?? null,
      s.feedMapping ?? null,
      s.feedIntervalHours ?? 24,
    );
  return Number(r.lastInsertRowid);
}

export function getProduct(db, ean) {
  return db.prepare('SELECT * FROM products WHERE ean = ?').get(ean);
}

/** Geçerli (aktif, engelsiz mağaza; taze; ilgili pazar) teklifler. */
export function offersFor(db, ean, market, now, maxAgeDays) {
  return db
    .prepare(
      `SELECT o.id, o.ean, o.price, o.currency, o.shipping, o.url, o.inStock, o.seenAt,
              s.name AS shopName, s.domain AS shopDomain, s.id AS shopId
       FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE o.ean = ? AND s.market = ? AND s.active = 1 AND s.blocked = 0 AND o.seenAt >= ?`,
    )
    .all(ean, market, now - maxAgeDays * DAY);
}

export function historyFor(db, ean, market) {
  return db
    .prepare('SELECT day, minPrice FROM price_history WHERE ean = ? AND market = ? ORDER BY day')
    .all(ean, market);
}

export function marketsWithOffers(db, ean, now, maxAgeDays) {
  return db
    .prepare(
      `SELECT DISTINCT s.market FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE o.ean = ? AND s.active = 1 AND s.blocked = 0 AND o.seenAt >= ?`,
    )
    .all(ean, now - maxAgeDays * DAY)
    .map(r => r.market);
}

const likeEsc = s => s.replace(/[\\%_]/g, c => '\\' + c);

/** Ada/markaya göre arama (her kelime geçmeli) ya da tam EAN; sonuçta yalnızca pazarda teklifi olan ürünler. */
export function searchProducts(db, market, q, now, maxAgeDays, limit = 48) {
  const words = fold(q).split(/\s+/).filter(Boolean).slice(0, 6);
  const where = ['s.market = ?', 's.active = 1', 's.blocked = 0', 'o.seenAt >= ?'];
  const params = [market, now - maxAgeDays * DAY];
  for (const w of words) {
    where.push(
      `(fold(p.title) LIKE ? ESCAPE '\\' OR fold(coalesce(p.brand,'')) LIKE ? ESCAPE '\\' OR p.ean = ?)`,
    );
    params.push(`%${likeEsc(w)}%`, `%${likeEsc(w)}%`, w);
  }
  const rows = db
    .prepare(
      `SELECT p.ean, p.title, p.brand, p.category, p.image, p.createdAt, o.price, o.shipping, o.inStock, o.currency,
              s.name AS shopName
       FROM products p JOIN offers o ON o.ean = p.ean JOIN shops s ON s.id = o.shopId
       WHERE ${where.join(' AND ')}`,
    )
    .all(...params);
  const byEan = new Map();
  for (const r of rows) {
    const t = totalPrice(r);
    const cur = byEan.get(r.ean) || {
      ean: r.ean,
      title: r.title,
      brand: r.brand,
      category: r.category,
      image: r.image,
      createdAt: r.createdAt,
      currency: r.currency,
      minTotal: Infinity,
      cheapShop: null,
      offerCount: 0,
    };
    cur.offerCount++;
    if (r.inStock && t < cur.minTotal) {
      cur.minTotal = t;
      cur.cheapShop = r.shopName;
    }
    byEan.set(r.ean, cur);
  }
  return [...byEan.values()]
    .map(p => ({ ...p, minTotal: p.minTotal === Infinity ? null : p.minTotal }))
    .sort((a, b) => b.offerCount - a.offerCount || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Pazarda geçerli teklifi olan ürünlerin kategorileri (çok ürünlüden aza). */
export function categoriesFor(db, market, now, maxAgeDays, limit = 20) {
  return db
    .prepare(
      `SELECT p.category AS name, count(DISTINCT p.ean) AS n
       FROM products p JOIN offers o ON o.ean = p.ean JOIN shops s ON s.id = o.shopId
       WHERE p.category IS NOT NULL AND p.category <> '' AND s.market = ? AND s.active = 1 AND s.blocked = 0
         AND o.seenAt >= ?
       GROUP BY p.category ORDER BY n DESC, p.category LIMIT ?`,
    )
    .all(market, now - maxAgeDays * DAY, limit)
    .map(r => r.name);
}

/** Son kayıtlı günün en düşük fiyatı bir önceki kayıtlı günden düşük olan ürünler (en büyük düşüş önce). */
export function priceDrops(db, market, now, maxAgeDays, limit = 12) {
  return db
    .prepare(
      `SELECT h.ean, h.minPrice AS price,
              (SELECT p.minPrice FROM price_history p
               WHERE p.ean = h.ean AND p.market = h.market AND p.day < h.day ORDER BY p.day DESC LIMIT 1) AS prev
       FROM price_history h
       WHERE h.market = ? AND h.day >= ?
         AND h.day = (SELECT max(x.day) FROM price_history x WHERE x.ean = h.ean AND x.market = h.market)`,
    )
    .all(market, dayOf(now - maxAgeDays * DAY))
    .filter(r => r.prev !== null && r.prev > r.price)
    .map(r => ({ ean: r.ean, price: r.price, prev: r.prev, pct: Math.round((1 - r.price / r.prev) * 100) }))
    .filter(r => r.pct >= 1)
    .sort((a, b) => b.pct - a.pct || a.ean.localeCompare(b.ean))
    .slice(0, limit);
}

export const sitemapEans = db =>
  db
    .prepare(
      `SELECT DISTINCT o.ean, s.market FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE s.active = 1 AND s.blocked = 0 ORDER BY o.ean`,
    )
    .all();

export function logClick(db, offerId, now) {
  db.prepare(
    `INSERT INTO clicks (day, offerId, count) VALUES (?, ?, 1)
     ON CONFLICT(day, offerId) DO UPDATE SET count = count + 1`,
  ).run(dayOf(now), offerId);
}

export const countOf = (db, table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

/** Ana sayfa istatistikleri: pazar başına geçerli ürün/mağaza/teklif sayısı + toplam. */
export function siteStats(db, now, maxAgeDays) {
  const rows = db
    .prepare(
      `SELECT s.market, count(DISTINCT o.ean) AS products, count(DISTINCT s.id) AS shops, count(*) AS offers
       FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE s.active = 1 AND s.blocked = 0 AND o.seenAt >= ? GROUP BY s.market`,
    )
    .all(now - maxAgeDays * DAY);
  const total = db
    .prepare(
      `SELECT count(DISTINCT o.ean) AS products, count(DISTINCT s.id) AS shops, count(*) AS offers
       FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE s.active = 1 AND s.blocked = 0 AND o.seenAt >= ?`,
    )
    .get(now - maxAgeDays * DAY);
  return { byMarket: Object.fromEntries(rows.map(r => [r.market, r])), total };
}

/** Tüm pazarlarda en çok teklifi olan markalar. */
export function topBrands(db, now, maxAgeDays, limit = 16) {
  return db
    .prepare(
      `SELECT p.brand AS name, s.market AS market, count(DISTINCT p.ean) AS n
       FROM products p JOIN offers o ON o.ean = p.ean JOIN shops s ON s.id = o.shopId
       WHERE p.brand IS NOT NULL AND p.brand <> '' AND s.active = 1 AND s.blocked = 0 AND o.seenAt >= ?
       GROUP BY p.brand, s.market ORDER BY n DESC, p.brand`,
    )
    .all(now - maxAgeDays * DAY)
    .filter((r, i, a) => a.findIndex(x => x.name === r.name) === i)
    .slice(0, limit);
}

/** En son eklenen, en az iki mağazada eşleşen (yoksa herhangi) ürünler; bir pazar ile birlikte. */
export function latestMatched(db, now, maxAgeDays, limit = 8) {
  return db
    .prepare(
      `SELECT p.ean, p.title, p.brand, p.image, p.createdAt, s.market AS market,
              count(*) AS offerCount, min(o.price + o.shipping) AS minTotal, o.currency AS currency
       FROM products p JOIN offers o ON o.ean = p.ean JOIN shops s ON s.id = o.shopId
       WHERE s.active = 1 AND s.blocked = 0 AND o.seenAt >= ? AND o.inStock = 1
       GROUP BY p.ean, s.market
       ORDER BY (count(*) >= 2) DESC, (p.image IS NOT NULL) DESC, p.createdAt DESC, p.ean LIMIT ?`,
    )
    .all(now - maxAgeDays * DAY, limit);
}

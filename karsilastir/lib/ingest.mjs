import { dayOf } from '../db.mjs';
import { MARKETS } from './config.mjs';
import { normalizeEan } from './ean.mjs';
import { httpUrlOrNull } from './http.mjs';
import { parsePrice, parseShipping } from './price.mjs';
import { totalPrice } from './pricing.mjs';

/**
 * Tek bir teklif satırını (besleme ya da tarayıcı) veritabanına işler.
 * row.deepLink (isteğe bağlı): affiliate yönlendirme bağlantısı; /go/<teklif> bunu, yoksa url'i kullanır.
 * Dönüş: 'offer' (EAN eşleşti), 'unmatched' (EAN yok/geçersiz, inceleme kuyruğu) ya da 'skipped' (geçersiz fiyat/URL/para birimi).
 */
export function ingestOffer(db, shop, row, now = Date.now()) {
  const market = MARKETS[shop.market];
  const price = parsePrice(row.price);
  const deepLink = httpUrlOrNull(row.deepLink);
  const url = httpUrlOrNull(row.url) || deepLink;
  const currency = String(row.currency || market.currency).toUpperCase();
  if (price === null || !url || currency !== market.currency) return 'skipped';
  const shipping = parseShipping(row.shipping) ?? shop.shippingDefault ?? 0;
  const inStock = row.inStock === undefined || row.inStock === null ? 1 : row.inStock ? 1 : 0;
  const title = String(row.title || '')
    .trim()
    .slice(0, 300);
  const ean = normalizeEan(row.ean);

  if (!ean) {
    if (!title) return 'skipped';
    db.prepare(
      `INSERT INTO unmatched (shopId, title, rawEan, price, currency, shipping, url, inStock, seenAt, brand, category, image, deepLink)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shopId, url) DO UPDATE SET title = excluded.title, rawEan = excluded.rawEan, price = excluded.price,
         shipping = excluded.shipping, inStock = excluded.inStock, seenAt = excluded.seenAt, deepLink = excluded.deepLink`,
    ).run(
      shop.id,
      title,
      row.ean ? String(row.ean).slice(0, 64) : null,
      price,
      currency,
      shipping,
      url,
      inStock,
      now,
      row.brand || null,
      row.category || null,
      httpUrlOrNull(row.image),
      deepLink,
    );
    return 'unmatched';
  }

  const exists = db.prepare('SELECT title, brand, category, image FROM products WHERE ean = ?').get(ean);
  if (!exists) {
    if (!title) return 'skipped';
    db.prepare(
      'INSERT INTO products (ean, title, brand, category, image, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(ean, title, row.brand || null, row.category || null, httpUrlOrNull(row.image), now);
  } else {
    db.prepare(
      'UPDATE products SET brand = coalesce(brand, ?), category = coalesce(category, ?), image = coalesce(image, ?) WHERE ean = ?',
    ).run(row.brand || null, row.category || null, httpUrlOrNull(row.image), ean);
  }
  db.prepare(
    `INSERT INTO offers (shopId, ean, price, currency, shipping, url, inStock, seenAt, deepLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(shopId, ean) DO UPDATE SET price = excluded.price, currency = excluded.currency,
       shipping = excluded.shipping, url = excluded.url, inStock = excluded.inStock, seenAt = excluded.seenAt,
       deepLink = excluded.deepLink`,
  ).run(shop.id, ean, price, currency, shipping, url, inStock, now, deepLink);
  recordHistory(db, ean, shop.market, now);
  return 'offer';
}

/** Günün en düşük toplam fiyatını (stokta, taze teklifler) price_history'ye yazar; gün içinde en düşük değer korunur. */
export function recordHistory(db, ean, market, now = Date.now()) {
  const rows = db
    .prepare(
      `SELECT o.price, o.shipping FROM offers o JOIN shops s ON s.id = o.shopId
       WHERE o.ean = ? AND s.market = ? AND s.active = 1 AND s.blocked = 0 AND o.inStock = 1`,
    )
    .all(ean, market);
  if (!rows.length) return;
  const min = Math.min(...rows.map(totalPrice));
  db.prepare(
    `INSERT INTO price_history (ean, market, day, minPrice) VALUES (?, ?, ?, ?)
     ON CONFLICT(ean, market, day) DO UPDATE SET minPrice = min(minPrice, excluded.minPrice)`,
  ).run(ean, market, dayOf(now), min);
}

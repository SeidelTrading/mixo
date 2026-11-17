import { dayOf, fold } from '../db.mjs';
import { MARKETS } from './config.mjs';
import { normalizeEan } from './ean.mjs';
import { httpUrlOrNull } from './http.mjs';
import { parsePrice, parseShipping } from './price.mjs';
import { totalPrice } from './pricing.mjs';

/** Kimlik normalizasyonu: büyük/küçük harf (aksan/Türkçe katlama dahil), boşluk ve tire farkı yok sayılır. */
const normId = v => fold(String(v ?? '').normalize('NFKC')).replace(/[\s\-\u2010-\u2015]+/g, '');

/**
 * Marka + üretici parça numarası (mpn) eşleştirme anahtarı; ikisinden biri yoksa ya da mpn 3 karakterden kısaysa null.
 * Bulanık eşleştirme YOK: anahtar birebir aynı olmalı.
 */
export function mpnKey(brand, mpn) {
  const b = normId(brand);
  const m = normId(mpn);
  return b && m.length >= 3 ? `${b}|${m}` : null;
}

/** EAN'sız teklif için: anahtar TEK bir ürüne denk geliyorsa onun EAN'ı, yoksa/belirsizse null. */
function eanByMpn(db, key) {
  if (!key) return null;
  const rows = db.prepare('SELECT ean FROM products WHERE mpnKey = ? LIMIT 2').all(key);
  return rows.length === 1 ? rows[0].ean : null;
}

/**
 * Tek bir teklif satırını (besleme ya da tarayıcı) veritabanına işler.
 * row.deepLink (isteğe bağlı): affiliate yönlendirme bağlantısı; /go/<teklif> bunu, yoksa url'i kullanır.
 * row.mpn / row.sku (isteğe bağlı): EAN yoksa marka+mpn tam olarak tek bir mevcut ürüne denk gelirse teklif ona bağlanır.
 * Dönüş: 'offer' (EAN ya da marka+mpn eşleşti), 'unmatched' (EAN yok/geçersiz, inceleme kuyruğu) ya da 'skipped' (geçersiz fiyat/URL/para birimi).
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
  const mpn = row.mpn ? String(row.mpn).trim().slice(0, 64) : null;
  const key = mpnKey(row.brand, mpn);
  const ean = normalizeEan(row.ean) || eanByMpn(db, key);

  if (!ean) {
    if (!title) return 'skipped';
    db.prepare(
      `INSERT INTO unmatched (shopId, title, rawEan, price, currency, shipping, url, inStock, seenAt, brand, category, image, deepLink, mpn, sku)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shopId, url) DO UPDATE SET title = excluded.title, rawEan = excluded.rawEan, price = excluded.price,
         shipping = excluded.shipping, inStock = excluded.inStock, seenAt = excluded.seenAt, deepLink = excluded.deepLink,
         brand = excluded.brand, mpn = excluded.mpn, sku = excluded.sku`,
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
      mpn,
      row.sku ? String(row.sku).trim().slice(0, 64) : null,
    );
    return 'unmatched';
  }

  const exists = db.prepare('SELECT title, brand, category, image FROM products WHERE ean = ?').get(ean);
  if (!exists) {
    if (!title) return 'skipped';
    db.prepare(
      'INSERT INTO products (ean, title, brand, category, image, createdAt, mpn, mpnKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      ean,
      title,
      row.brand || null,
      row.category || null,
      httpUrlOrNull(row.image),
      now,
      key ? mpn : null,
      key,
    );
  } else {
    db.prepare(
      `UPDATE products SET brand = coalesce(brand, ?), category = coalesce(category, ?), image = coalesce(image, ?),
         mpn = coalesce(mpn, ?), mpnKey = coalesce(mpnKey, ?) WHERE ean = ?`,
    ).run(row.brand || null, row.category || null, httpUrlOrNull(row.image), key ? mpn : null, key, ean);
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

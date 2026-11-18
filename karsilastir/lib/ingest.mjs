import { dayOf, fold } from '../db.mjs';
import { MARKETS } from './config.mjs';
import { normalizeEan } from './ean.mjs';
import { httpUrlOrNull } from './http.mjs';
import { isInternalSku } from './mpn.mjs';
import { parsePrice, parseShipping } from './price.mjs';
import { totalPrice } from './pricing.mjs';

/** Kimlik normalizasyonu: büyük/küçük harf (aksan/Türkçe katlama dahil), boşluk, tire, eğik çizgi, nokta ve alt çizgi farkı yok sayılır. */
const normId = v => fold(String(v ?? '').normalize('NFKC')).replace(/[\s\-\u2010-\u2015/._]+/g, '');

/**
 * Marka yazım farkları (normId sonrası anahtar -> kanonik anahtar). "Good Connections" / "GoodConnections" ve
 * "Synergy 21" / "Synergy21" zaten normId ile aynı olur; burada yalnız gerçekten farklı yazımlar birleştirilir.
 * Bilerek BİRLEŞTİRİLMEYENLER: VALUE (ROLINE'ın alt markası, ayrı ürün serisi) ve marka-model karışımları.
 */
export const BRAND_ALIASES = {
  efbelektronik: 'efb',
  efbelektronikgmbh: 'efb',
  hewlettpackard: 'hp',
  hpinc: 'hp',
  startechcom: 'startech',
  samsungelectronics: 'samsung',
  asustek: 'asus',
  asustekcomputer: 'asus',
};
const brandKey = b => {
  const k = normId(b);
  return BRAND_ALIASES[k] ?? k;
};

/**
 * Marka + üretici parça numarası (mpn) eşleştirme anahtarı: normBrand + '|' + normMpn. Anahtar yoksa (null):
 * marka ya da mpn yok; normMpn 5 karakterden kısa ya da hiç rakam içermiyor; mpn bir barkod (8/12/13/14 haneli salt
 * rakam) ya da iç kod (BA-, arp-, OT-, UHREN1- ...). Bulanık eşleştirme YOK: anahtar birebir aynı olmalı.
 */
export function mpnKey(brand, mpn) {
  const b = brandKey(brand);
  const m = normId(mpn);
  if (!b || m.length < 5 || !/\d/.test(m) || isInternalSku(mpn)) return null;
  if (/^\d+$/.test(m) && [8, 12, 13, 14].includes(m.length)) return null;
  return `${b}|${m}`;
}

/** EAN'sız teklif için: anahtar TEK bir ürüne denk geliyorsa onun EAN'ı, yoksa/belirsizse null. */
function eanByMpn(db, key) {
  if (!key) return null;
  const rows = db.prepare('SELECT ean FROM products WHERE mpnKey = ? LIMIT 2').all(key);
  return rows.length === 1 ? rows[0].ean : null;
}

/**
 * Aynı mağazanın bu EAN'da BAŞKA bir adresli teklifi var mı? offers (shopId, ean) için tek satır tuttuğundan,
 * MPN ile bağlanan ikinci bir ürün (aynı başlık MPN'ini paylaşan paket/renk/set) mağazanın kendi öteki ürününün
 * fiyatını ve adresini ezerdi. Çakışma varsa MPN bağı kurulmaz; satır eşleşmemiş kalır.
 */
function sameShopConflict(db, shopId, ean, url) {
  const o = db.prepare('SELECT url FROM offers WHERE shopId = ? AND ean = ?').get(shopId, ean);
  return !!o && o.url !== url;
}

/**
 * Tek bir teklif satırını (besleme ya da tarayıcı) veritabanına işler.
 * row.deepLink (isteğe bağlı): affiliate yönlendirme bağlantısı; /go/<teklif> bunu, yoksa url'i kullanır.
 * row.mpn / row.sku (isteğe bağlı): EAN yoksa marka+mpn tam olarak tek bir mevcut ürüne denk gelirse teklif ona bağlanır.
 * İç kodlar (isInternalSku) mpn olarak yok sayılır. Eşleşmeyen satıra mpnKey de yazılır (promoteUnmatched ve Mixoutlet MPN yolu kullanır).
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
  // İç kodlar (BA-, arp-, OT-, UHREN1- ...) hiçbir zaman parça numarası olarak saklanmaz.
  const mpnRaw = row.mpn ? String(row.mpn).trim().slice(0, 64) : null;
  const mpn = mpnRaw && !isInternalSku(mpnRaw) ? mpnRaw : null;
  const key = mpnKey(row.brand, mpn);
  let ean = normalizeEan(row.ean);
  if (!ean) {
    const byMpn = eanByMpn(db, key);
    if (byMpn && !sameShopConflict(db, shop.id, byMpn, url)) ean = byMpn;
  }

  if (!ean) {
    if (!title) return 'skipped';
    db.prepare(
      `INSERT INTO unmatched (shopId, title, rawEan, price, currency, shipping, url, inStock, seenAt, brand, category, image, deepLink, mpn, sku, mpnKey)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shopId, url) DO UPDATE SET title = excluded.title, rawEan = excluded.rawEan, price = excluded.price,
         shipping = excluded.shipping, inStock = excluded.inStock, seenAt = excluded.seenAt, deepLink = excluded.deepLink,
         brand = excluded.brand, mpn = excluded.mpn, sku = excluded.sku, mpnKey = excluded.mpnKey`,
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
      key,
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

/**
 * Eşleşmemiş satırları sonradan bağlar: mpnKey'i products tablosunda TEK bir ürüne denk gelen satır offers'a terfi eder
 * (ingestOffer yeniden çağrılır, sonra unmatched satırı silinir). Mixoutlet'in EAN'sız ürünü sonradan EAN'lı bir
 * rakip ürünle (ya da tersi) karşılaşınca burada bağlanır. Belirsiz anahtara (2+ ürün) dokunulmaz; aynı mağazada aynı
 * anahtarı taşıyan 2+ eşleşmemiş satır (renk/paket varyantı) hiç terfi etmez; hedef EAN'da mağazanın başka adresli
 * teklifi varsa da terfi edilmez (offers satırı ezilmesin). Teklifin tazeliği korunur (seenAt eski kalır). Dönüş: terfi eden satır sayısı.
 */
export function promoteUnmatched(db, now = Date.now(), { limit = 5000 } = {}) {
  const rows = db
    .prepare(
      `SELECT u.* FROM unmatched u
       WHERE u.mpnKey IS NOT NULL
         AND (SELECT count(*) FROM (SELECT 1 FROM products p WHERE p.mpnKey = u.mpnKey LIMIT 2)) = 1
         AND (SELECT count(*) FROM unmatched x WHERE x.shopId = u.shopId AND x.mpnKey = u.mpnKey) = 1
         AND NOT EXISTS (SELECT 1 FROM offers o JOIN products p ON p.ean = o.ean
                         WHERE p.mpnKey = u.mpnKey AND o.shopId = u.shopId AND o.url <> u.url)
       ORDER BY u.id LIMIT ?`,
    )
    .all(limit);
  let n = 0;
  const shops = new Map();
  for (const r of rows) {
    const ean = eanByMpn(db, r.mpnKey);
    if (!ean) continue;
    if (!shops.has(r.shopId))
      shops.set(r.shopId, db.prepare('SELECT * FROM shops WHERE id = ?').get(r.shopId));
    const shop = shops.get(r.shopId);
    if (!shop) continue;
    const res = ingestOffer(
      db,
      shop,
      {
        ean,
        title: r.title,
        brand: r.brand,
        category: r.category,
        image: r.image,
        price: r.price,
        currency: r.currency,
        shipping: r.shipping,
        url: r.url,
        deepLink: r.deepLink,
        inStock: !!r.inStock,
        mpn: r.mpn,
        sku: r.sku,
      },
      r.seenAt ?? now,
    );
    if (res === 'offer') {
      db.prepare('DELETE FROM unmatched WHERE id = ?').run(r.id);
      n++;
    }
  }
  return n;
}

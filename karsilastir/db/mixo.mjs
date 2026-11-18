import { totalPrice } from '../lib/pricing.mjs';

const DAY = 86400000;
const MIXO_SITE = 'mixoutlet.de';
/**
 * Mixoutlet tarafı tazelik payı: rakip teklifler maxAgeDays içinde olmalı; Mixoutlet satırı yeniden kontrol aralığı
 * (barkodsuz ürün 30 gün) yüzünden biraz daha eski olabilir. Bunun ötesi kaldırılmış/bayat sayılır ve karşılaştırılmaz.
 */
const MIXO_GRACE_DAYS = 7;
const mixoSince = (now, maxAgeDays) => now - (maxAgeDays + MIXO_GRACE_DAYS) * DAY;
/** Mixoutlet mağaza satırları (www'li/www'siz alan adı). */
const mixoIds = db =>
  db
    .prepare("SELECT id FROM shops WHERE market = 'de' AND replace(lower(domain), 'www.', '') = ?")
    .all(MIXO_SITE)
    .map(r => r.id);

/**
 * MPN yolu: Mixoutlet'in EAN'sız (unmatched) satırı ile rakibin EAN'sız satırı aynı marka+mpn anahtarını (mpnKey) taşıyorsa
 * eşleşir. Koruma: anahtar başına yalnız BİR Mixoutlet satırı olmalı; rakipte de anahtar mağaza başına yalnız BİR satıra
 * denk gelmeli (aile koduyla renk/ebat varyantı listeleyen mağazada en ucuzu seçmek başka ürünün fiyatını gösterirdi);
 * anahtar products tablosunda hiç geçmemeli (geçiyorsa EAN yolu ve promoteUnmatched sahip, belirsizse hiç bağlanmaz);
 * rakip DE, aktif, engelsiz ve taze, Mixoutlet satırı da taze olmalı (since / msince).
 * Başlık benzerliği hiçbir zaman eşleşme üretmez. Dönüş: satır başına { k, title, brand, image, murl, mp, ms, cp, cs, curl, cin, sid, shop }.
 */
function mpnRows(db, ids, since, msince) {
  const q = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT u.mpnKey AS k, u.title, u.brand, u.image, u.url AS murl, u.price AS mp, u.shipping AS ms,
              c.price AS cp, c.shipping AS cs, c.url AS curl, c.inStock AS cin, s.id AS sid, s.name AS shop
       FROM unmatched u
       JOIN unmatched c ON c.mpnKey = u.mpnKey AND c.shopId NOT IN (${q}) AND c.seenAt >= ?
       JOIN shops s ON s.id = c.shopId AND s.market = 'de' AND s.active = 1 AND s.blocked = 0
       WHERE u.shopId IN (${q}) AND u.mpnKey IS NOT NULL AND u.seenAt >= ?
         AND (SELECT count(*) FROM unmatched x WHERE x.shopId = c.shopId AND x.mpnKey = c.mpnKey) = 1
         AND NOT EXISTS (SELECT 1 FROM products p WHERE p.mpnKey = u.mpnKey)
         AND u.mpnKey IN (SELECT mpnKey FROM unmatched WHERE shopId IN (${q}) AND mpnKey IS NOT NULL
                          GROUP BY mpnKey HAVING count(*) = 1)`,
    )
    .all(...ids, since, ...ids, msince, ...ids);
}

/**
 * Mixoutlet kapsama özeti. total: katalog büyüklüğü (yapılandırılır, varsayılan 44.862); known: veritabanında bilinen
 * Mixoutlet ürünü (EAN'lı teklif + eşleşmemiş); withEan: EAN'a bağlanmış; covered: en az bir rakip fiyatı olan.
 * byShop: rakip mağaza başına eşleşen Mixoutlet ürünü sayısı (EAN ve MPN yolu birleşik).
 * covered = coveredEan (EAN yolu) + coveredByMpn (marka+MPN yolu, EAN'sız satırlar); cheaper ikisini de kapsar.
 */
export function mixoSummary(db, now, maxAgeDays, total) {
  const ids = mixoIds(db);
  const empty = {
    total,
    known: 0,
    withEan: 0,
    covered: 0,
    coveredEan: 0,
    coveredByMpn: 0,
    cheaper: 0,
    byShop: [],
    hasShop: ids.length > 0,
  };
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
       WHERE o.shopId IN (${q}) AND o.seenAt >= ? AND c.inStock = 1 GROUP BY o.ean, s.id`,
    )
    .all(...ids, since, ...ids, mixoSince(now, maxAgeDays));
  const eans = new Map();
  const byShop = new Map();
  for (const p of pairs) {
    const e = eans.get(p.ean) ?? { mixo: p.mixo, best: Infinity };
    e.best = Math.min(e.best, p.best);
    eans.set(p.ean, e);
    byShop.set(p.shop, (byShop.get(p.shop) ?? 0) + 1);
  }
  // MPN yolu: anahtar başına, mağaza başına en ucuz rakip; anahtar başına bir Mixoutlet ürünü.
  const keys = new Map();
  for (const r of mpnRows(db, ids, since, mixoSince(now, maxAgeDays))) {
    if (!r.cin) continue; // listeyle aynı: stokta olmayan rakip sayılmaz
    const e = keys.get(r.k) ?? { mixo: r.mp + r.ms, best: Infinity, shops: new Map() };
    const t = r.cp + r.cs;
    e.best = Math.min(e.best, t);
    e.shops.set(r.shop, Math.min(e.shops.get(r.shop) ?? Infinity, t));
    keys.set(r.k, e);
  }
  for (const e of keys.values())
    for (const name of e.shops.keys()) byShop.set(name, (byShop.get(name) ?? 0) + 1);
  return {
    total,
    known: unmatched + withEan,
    withEan,
    covered: eans.size + keys.size,
    coveredEan: eans.size,
    coveredByMpn: keys.size,
    cheaper:
      [...eans.values()].filter(e => e.mixo <= e.best).length +
      [...keys.values()].filter(e => e.mixo <= e.best).length,
    byShop: [...byShop].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    hasShop: true,
  };
}

/**
 * Ürün başına karşılaştırma satırları (yalnız rakibi olanlar). sort: 'diff' (Mixoutlet en pahalı önce, varsayılan),
 * 'cheap' (Mixoutlet en ucuz önce), 'shops' (en çok rakip).
 * Fark: diff = mixo − en ucuz rakip (€, kargo dahil); pct = diff / en ucuz rakip × 100.
 * Her satırda matchType: 'ean' (barkod birebir) ya da 'mpn' (marka + parça numarası, EAN'sız). id: EAN ya da 'mpn:<anahtar>';
 * MPN satırında ean null, başlık/görsel Mixoutlet'in eşleşmemiş satırından gelir, mixoUrl Mixoutlet ürün adresidir,
 * rakiplerde offerId null ve url ürün adresidir. `list`: mixoList sonucu (önbellekten); verilmezse sorgu çalışır.
 * @param {any} db @param {number} now @param {number} maxAgeDays
 * @param {{ sort?: string, limit?: number, offset?: number, list?: any[] }} [opts]
 */
export function mixoComparison(db, now, maxAgeDays, { sort = 'diff', limit = 50, offset = 0, list } = {}) {
  const all = list ?? mixoList(db, now, maxAgeDays);
  const cmp =
    {
      diff: (a, b) => b.pct - a.pct,
      cheap: (a, b) => a.pct - b.pct,
      shops: (a, b) => b.rivals.length - a.rivals.length || b.pct - a.pct,
    }[sort] ?? ((a, b) => b.pct - a.pct);
  const sorted = [...all].sort(cmp);
  return { total: sorted.length, items: sorted.slice(offset, offset + limit) };
}

/**
 * mixoComparison'ın sıralanmamış tam listesi (pahalı kısım: EAN ve MPN sorguları). Rota katmanı bunu kısa süre önbelleğe
 * alıp mixoComparison'a `list` olarak verir; sayfa/sıralama değişimi sorguyu yeniden çalıştırmaz.
 */
export function mixoList(db, now, maxAgeDays) {
  const ids = mixoIds(db);
  if (!ids.length) return [];
  const q = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT p.ean, p.title, p.brand, p.image, o.id AS offerId, o.price, o.shipping, o.url,
              c.price AS cp, c.shipping AS cs, c.url AS curl, c.id AS cid, s.name AS shop
       FROM offers o JOIN products p ON p.ean = o.ean
       JOIN offers c ON c.ean = o.ean AND c.shopId NOT IN (${q}) AND c.seenAt >= ?
       JOIN shops s ON s.id = c.shopId AND s.market = 'de' AND s.active = 1 AND s.blocked = 0
       WHERE o.shopId IN (${q}) AND o.seenAt >= ? AND c.inStock = 1`,
    )
    .all(...ids, now - maxAgeDays * DAY, ...ids, mixoSince(now, maxAgeDays));
  const by = new Map();
  for (const r of rows) {
    const p = by.get(r.ean) ?? {
      id: r.ean,
      matchType: 'ean',
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
  // MPN yolu: aynı anahtar için tek Mixoutlet satırı, rakip başına en ucuz stoklu fiyat.
  const mp = new Map();
  for (const r of mpnRows(db, ids, now - maxAgeDays * DAY, mixoSince(now, maxAgeDays))) {
    if (!r.cin) continue;
    const p = mp.get(r.k) ?? {
      id: `mpn:${r.k}`,
      matchType: 'mpn',
      ean: null,
      title: r.title,
      brand: r.brand,
      image: r.image,
      mixo: totalPrice({ price: r.mp, shipping: r.ms }),
      mixoOfferId: null,
      mixoUrl: r.murl,
      rivals: [],
    };
    const t = totalPrice({ price: r.cp, shipping: r.cs });
    const same = p.rivals.find(x => x.shop === r.shop);
    if (!same) p.rivals.push({ shop: r.shop, total: t, offerId: null, url: r.curl });
    else if (t < same.total) Object.assign(same, { total: t, url: r.curl });
    mp.set(r.k, p);
  }
  return [...by.values(), ...mp.values()].map(p => {
    p.rivals.sort((a, b) => a.total - b.total);
    const best = p.rivals[0].total;
    return {
      ...p,
      best,
      diff: Math.round((p.mixo - best) * 100) / 100,
      pct: Math.round(((p.mixo - best) / best) * 1000) / 10,
    };
  });
}

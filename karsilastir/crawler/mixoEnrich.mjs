/*
 * Mixoutlet zenginleştirme: ürünlerin barkodunu (EAN) ve gerçek parça numarasını (MPN) toplar.
 *
 * Neden: /products.json barkod vermez ve 100. sayfada biter (250 x 100 = 25.000 ürün; katalog ~45.000). Barkod yalnız
 * tek ürün uç noktasında (/products/<handle>.json) bulunur. Yol:
 *   1. seedHandles: mixoutlet.de site haritasından (sitemap_products_*.xml) TÜM handle'lar mixo_enrich kuyruğuna yazılır.
 *   2. enrichBatch: kuyruktan öncelik sırasıyla .json çekilir; barkod varsa EAN'lı teklif (offers), yoksa gerçek MPN ile
 *      eşleşmemiş satır (unmatched) yazılır. Yeniden kontrol: ok 7 gün, no-barcode 30 gün, ağ/5xx hatası 1 gün,
 *      404 -> gone (site haritasında yeniden görülürse sıfırlanır).
 *   3. importListing: /products.json yalnız günlük fiyat/stok tazeleme içindir (EAN'ı bilinen handle o EAN ile ingest edilir).
 * Tüm istekler `get` (crawler.guardedGet) üzerinden gider: robots.txt, host hız aralığı (OWN_INTERVAL_MS dahil),
 * engel (403/429 -> 24 saat bekleme) ve opt-out kuralları orada uygulanır; bu modül aralık mantığı yazmaz.
 */
import { normalizeEan } from '../lib/ean.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { extractMpn, mpnFromSku } from '../lib/mpn.mjs';

const DAY = 86400000;
/** Yeniden kontrol aralıkları (override 4). 'gone' bir daha denenmez. */
export const RECHECK_MS = { ok: 7 * DAY, 'no-barcode': 30 * DAY, error: DAY };
/** Site haritasından en çok bu kadar handle ve en çok bu kadar alt harita okunur. */
const MAX_HANDLES = 80_000;
const MAX_CHILD_MAPS = 60;
/** Üst üste bu kadar hata (404 dışı) alınırsa tur durur: uç nokta kapanmış ya da site sorunlu olabilir. */
const MAX_CONSECUTIVE_ERRORS = 8;
/** Bu nedenlerle (guardedGet) tur hemen durur ve satır işaretlenmez: aynı kural sıradaki her ürün için de geçerli. */
const STOP_REASON = /^(backoff|robots-|crawl-delay|shop-blocked|opt-out|private-host|host-mismatch|scheme)/;
/** Tohumlama başarısız/boş dönerse bu süre geçmeden yeniden denenmez (her 5 dakikalık turda site haritası istenmesin). */
const SEED_RETRY_MS = 3600 * 1000;

/** BT (bilgi teknolojisi) markaları: bueroarena tedariki, barkod oranı yüksek, rakiplerde en çok bulunan grup. */
const BT_BRANDS = [
  'delock',
  'efb',
  'logilink',
  'roline',
  'goodconnections',
  'equip',
  'synergy21',
  'digitus',
  'startech',
  'hp',
  'epson',
  'brother',
  'canon',
  'lenovo',
  'asus',
  'samsung',
  'logitech',
];
const flat = v =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
const isBtBrand = b => {
  const k = flat(b);
  return !!k && BT_BRANDS.some(x => k.startsWith(x));
};

/**
 * Zenginleştirme önceliği (büyük önce): 3 = BA- sku'lu BT markası (barkod %100'e yakın), 2 = BA- sku'lu diğer (ofis vb.),
 * saat/parfüm (UHREN*, arp-, OT- sku) ve diğer BT markaları, 1 = bilinmeyen (sitemap'ten yeni handle), 0 = 3DPLady
 * (özel marka uyumlu toner: rakipte EAN'ı yok). Aynı öncelikte fiyatı yüksek olan önce gelir (price sütunu).
 */
export function enrichPriority(brand, sku) {
  if (flat(brand).startsWith('3dplady')) return 0;
  const s = String(sku ?? '').trim();
  if (/^ba-/i.test(s)) return isBtBrand(brand) ? 3 : 2;
  if (/^(uhren\d*-|arp-|ot-)/i.test(s)) return 2;
  return isBtBrand(brand) ? 2 : 1;
}

/** Yalnız handle biliniyorsa (site haritası) öncelik: handle önekinden marka tahmini. */
export function handlePriority(handle) {
  const h = String(handle ?? '').toLowerCase();
  if (h.startsWith('3dplady')) return 0;
  if (h.startsWith('watch-')) return 2;
  if (
    /^(delock|efb|logilink|roline|good-connections|equip|synergy-21|digitus|startech|hp|epson|brother|canon|lenovo|asus|samsung|logitech)-/.test(
      h,
    )
  )
    return 3;
  return 1;
}

const likeEsc = s => s.replace(/[\\%_]/g, c => '\\' + c);
const handleOf = loc => {
  try {
    const m = /^\/products\/([^/]+?)\/?$/.exec(new URL(loc).pathname);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
};
/** mixo_enrich.ean: "<varyant id>:<ean>" çiftleri, virgülle ayrılmış. */
const parsePairs = s => {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const x of String(s ?? '').split(',')) {
    const [v, e] = x.split(':');
    if (v && e) m.set(v, e);
  }
  return m;
};

/**
 * @param {{ db: any, get: (shop: any, url: string, opts?: any) => Promise<any>, now?: () => number,
 *   log?: (m: string) => void, ownFast?: boolean }} o
 * get: crawler.guardedGet. ownFast: Mixoutlet OWN_DOMAINS'te (2 sn aralık) -> tur limiti 140, değilse 25 (10 sn aralık).
 */
export function createMixoEnricher({ db, get, now = Date.now, log = () => {}, ownFast = false }) {
  const defaultLimit = ownFast ? 140 : 25;
  const getState = k => db.prepare('SELECT value FROM crawl_state WHERE key = ?').get(k)?.value ?? null;
  const setState = (k, v) =>
    db
      .prepare(
        'INSERT INTO crawl_state (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      )
      .run(k, String(v), now());
  const base = shop => `https://${shop.domain}`;
  const baseUrl = (shop, handle) => `${base(shop)}/products/${handle}`;

  const mark = (handle, status, ean = null) =>
    db
      .prepare('UPDATE mixo_enrich SET checkedAt = ?, status = ?, ean = ? WHERE handle = ?')
      .run(now(), status, ean, handle);

  /** Aynı ürünün eşleşmemiş (EAN'sız) satırları artık gereksiz: barkod bulununca sayım çift olmasın. */
  const dropUnmatched = (shop, url) =>
    db
      .prepare("DELETE FROM unmatched WHERE shopId = ? AND (url = ? OR url LIKE ? ESCAPE '\\')")
      .run(shop.id, url, likeEsc(url) + '?variant=%');

  /**
   * Satıştan kalkmış (404) ürünün satırları silinir: bayat fiyat rakip fiyatıyla karşılaştırılmaya devam etmesin.
   * Hem eşleşmemiş satır hem EAN'lı teklif (varyant adresleri dahil) mağaza kapsamında adresin yoluna göre silinir.
   */
  const dropGone = (shop, handle) => {
    const path = `%/products/${likeEsc(handle)}`;
    for (const t of ['unmatched', 'offers'])
      db.prepare(
        `DELETE FROM ${t} WHERE shopId = ? AND (url LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')`,
      ).run(shop.id, path, path + '?variant=%');
  };

  /**
   * Marka: Shopify vendor alanı. Saat tedarikçisinin kaydında vendor 'uhren1' / 'uhren2' gibi iç koddur (deneme 2026-11-18:
   * "uhren1|f20593" anahtarı rakipte hiç eşleşmez); bu durumda marka başlığın ilk sözcüğüdür (Guess, Festina ...).
   */
  const brandOf = p => {
    const v = String(p.vendor ?? '').trim();
    if (!/^uhren\d*$/i.test(v)) return p.vendor;
    const w = String(p.title ?? '')
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^\p{L}\p{N}&'’-]+/gu, '');
    return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : p.vendor;
  };

  const stockOf = (shop, v, ean) => {
    if (typeof v.available === 'boolean') return v.available;
    // .json uç noktası stok vermez: bilinen teklifin stoğu korunur, yoksa stokta sayılır.
    const o = ean && db.prepare('SELECT inStock FROM offers WHERE shopId = ? AND ean = ?').get(shop.id, ean);
    return o ? !!o.inStock : true;
  };

  const rowOf = (shop, p, v, ean, url) => ({
    ean,
    mpn: extractMpn({
      title: p.title,
      brand: brandOf(p),
      sku: v.sku,
      bodyHtml: p.body_html ?? p.description,
      ean,
    }),
    sku: v.sku || '',
    title: p.title,
    brand: brandOf(p),
    category: p.product_type,
    image: p.images?.[0]?.src ?? p.image?.src,
    price: v.price,
    inStock: stockOf(shop, v, ean),
    url,
  });

  /**
   * Bir ürün kaydını (tek ürün .json ya da products.json öğesi) işler. Barkodlu varyantlar EAN'lı teklif olur;
   * hiç barkod yoksa gerçek MPN ile unmatched'a yazılır. `pairs`: EAN'ı önceden bilinen varyantlar (id -> ean).
   * Dönüş: { offers, unmatched, pairs: "<varyant>:<ean>,..." | null }.
   */
  function ingestProduct(shop, p, pairs = new Map()) {
    const url = baseUrl(shop, p.handle);
    const variants = (p.variants || []).filter(v => v && v.price !== undefined);
    const known = variants
      .map(v => ({ v, ean: pairs.get(String(v.id)) || normalizeEan(v.barcode) }))
      .filter(x => x.ean);
    const out = { offers: 0, unmatched: 0, pairs: null };
    if (known.length) {
      for (const { v, ean } of known) {
        const u = known.length > 1 ? `${url}?variant=${v.id}` : url;
        if (ingestOffer(db, shop, rowOf(shop, p, v, ean, u), now()) === 'offer') out.offers++;
      }
      if (out.offers) {
        dropUnmatched(shop, url);
        out.pairs = known.map(x => `${x.v.id}:${x.ean}`).join(',');
      }
      return out;
    }
    if (pairs.size) return out; // EAN'ı bilinen ürün: varyant kimlikleri değiştiyse bile EAN'sız ikinci satır açılmaz
    // Hep ilk varyant: products.json 'available' verir, tek ürün .json vermez; ikisi farklı varyant seçerse aynı satırın
    // fiyatı her turda gidip gelirdi.
    const v = variants[0];
    if (!v) return out;
    const row = rowOf(shop, p, v, null, url);
    // Çok varyantlı barkodsuz üründe başlık/açıklama ürün düzeyindedir (50 ml mi 100 ml mi belli değil); parça numarası
    // yalnız varyanta özgü sku'dan geliyorsa kullanılır, yoksa satır anahtarsız yazılır (hiçbir rakiple eşleşmez).
    if (variants.length > 1) row.mpn = mpnFromSku({ title: p.title, sku: v.sku });
    if (ingestOffer(db, shop, row, now()) === 'unmatched') out.unmatched++;
    return out;
  }

  /** Site haritası (dizin ve alt haritalar) -> mixo_enrich. Dönüş: { added, total, maps }. */
  async function seedHandles(shop) {
    const keep = l => (handleOf(l) ? 2 : 0);
    const out = { added: 0, total: 0, maps: 0, reason: null };
    const handles = new Set();
    const read = async url => {
      const r = await get(shop, url, { sitemap: true, keep, want: 50_000 });
      out.maps++;
      if (!r.ok) {
        out.reason = r.reason;
        return null;
      }
      return r;
    };
    // Shopify: /sitemap.xml dizin dosyasıdır (sitemap_products_N.xml alt haritaları). Açılmazsa robots.txt'teki Sitemap satırları.
    const queue = [`${base(shop)}/sitemap.xml`];
    const seen = new Set();
    let robotsTried = false;
    while (queue.length && seen.size < MAX_CHILD_MAPS + 5 && handles.size < MAX_HANDLES) {
      const m = queue.shift();
      if (seen.has(m)) continue;
      seen.add(m);
      const r = await read(m);
      if (!r) {
        if (!seen.size || robotsTried || seen.size > 1) continue;
        robotsTried = true;
        const rb = await get(shop, `${base(shop)}/robots.txt`);
        if (rb.ok)
          queue.push(
            ...[...rb.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)]
              .map(x => x[1])
              .filter(u => /^https?:\/\//i.test(u)),
          );
        continue;
      }
      if (r.index) queue.push(...r.locs.filter(l => /product/i.test(l.replace(/^https?:\/\/[^/]+/i, ''))));
      else for (const l of r.locs) handles.add(handleOf(l));
    }
    handles.delete(null);
    out.total = handles.size;
    if (!handles.size) {
      setState(`mixo-seed-try:${shop.id}`, now()); // boş/okunamayan harita: en az 1 saat sonra yeniden
      return out;
    }
    const before = db.prepare('SELECT count(*) n FROM mixo_enrich WHERE shopId = ?').get(shop.id).n;
    const ins = db.prepare(
      `INSERT INTO mixo_enrich (handle, shopId, priority) VALUES (?, ?, ?)
       ON CONFLICT(handle) DO UPDATE SET status = NULL, checkedAt = NULL, ean = NULL WHERE status = 'gone'`,
    );
    db.exec('BEGIN');
    try {
      for (const h of handles) ins.run(h, shop.id, handlePriority(h));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    out.added = db.prepare('SELECT count(*) n FROM mixo_enrich WHERE shopId = ?').get(shop.id).n - before;
    setState(`mixo-seed:${shop.id}`, now());
    log(`mixo seed ${shop.domain}: ${out.total} handles, ${out.added} new`);
    return out;
  }

  /** Günde bir: son tohumlamadan 24 saat geçti mi? Başarısız denemeden sonra da en az 1 saat beklenir. */
  const seedDue = shop =>
    now() - Number(getState(`mixo-seed:${shop.id}`) ?? 0) >= DAY &&
    now() - Number(getState(`mixo-seed-try:${shop.id}`) ?? 0) >= SEED_RETRY_MS;

  /**
   * Kuyruktan sıradaki ürünleri çeker. Sıra: hiç kontrol edilmemişler önce, sonra öncelik (BT) ve fiyat (yüksek önce).
   * Dönüş: { checked, ok, noBarcode, gone, errors, offers, stopped }.
   */
  async function enrichBatch(shop, { limit = defaultLimit } = {}) {
    const t = now();
    const rows = db
      .prepare(
        `SELECT handle FROM mixo_enrich WHERE shopId = ? AND status IS NOT 'gone' AND (
           checkedAt IS NULL
           OR (status = 'ok' AND checkedAt < ?) OR (status = 'no-barcode' AND checkedAt < ?)
           OR (status NOT IN ('ok', 'no-barcode', 'gone') AND checkedAt < ?))
         ORDER BY checkedAt IS NOT NULL, priority DESC, price IS NULL, price DESC, checkedAt, handle LIMIT ?`,
      )
      .all(shop.id, t - RECHECK_MS.ok, t - RECHECK_MS['no-barcode'], t - RECHECK_MS.error, limit);
    const out = { checked: 0, ok: 0, noBarcode: 0, gone: 0, errors: 0, offers: 0, stopped: null };
    let streak = 0;
    for (const { handle } of rows) {
      const r = await get(shop, `${baseUrl(shop, handle)}.json`, { json: true });
      if (!r.ok) {
        if (r.reason === 'http-404') {
          mark(handle, 'gone');
          dropGone(shop, handle);
          out.gone++;
          out.checked++;
          streak = 0;
          continue;
        }
        if (STOP_REASON.test(r.reason)) {
          out.stopped = r.reason;
          break;
        }
        mark(handle, String(r.reason).split(':')[0].slice(0, 40)); // http-500, network-error, content-type ...
        out.errors++;
        out.checked++;
        if (++streak >= MAX_CONSECUTIVE_ERRORS) {
          out.stopped = 'too-many-errors';
          break;
        }
        continue;
      }
      streak = 0;
      out.checked++;
      let p;
      try {
        p = JSON.parse(r.body).product;
      } catch {
        p = null;
      }
      if (!p || !Array.isArray(p.variants)) {
        mark(handle, 'bad-json');
        out.errors++;
        continue;
      }
      p.handle ||= handle;
      const res = ingestProduct(shop, { ...p, handle });
      out.offers += res.offers;
      if (res.pairs) {
        mark(handle, 'ok', res.pairs);
        out.ok++;
      } else {
        mark(handle, 'no-barcode');
        out.noBarcode++;
      }
      db.prepare('UPDATE mixo_enrich SET price = coalesce(?, price), priority = ? WHERE handle = ?').run(
        Number(p.variants[0]?.price) || null,
        enrichPriority(p.vendor, p.variants[0]?.sku),
        handle,
      );
    }
    log(
      `mixo enrich ${shop.domain}: ${out.checked} checked, ${out.ok} ok, ${out.noBarcode} no-barcode, ${out.gone} gone, ${out.errors} errors${out.stopped ? ' stopped:' + out.stopped : ''}`,
    );
    return out;
  }

  /**
   * Günlük fiyat/stok tazeleme: /products.json sayfa sayfa (en çok 100 sayfa = 25.000 ürün; 101. sayfa boş döner).
   * EAN'ı mixo_enrich'te bilinen ürün o EAN ile ingest edilir (unmatched'a satır yazılmaz); bilinmeyen ürün gerçek
   * MPN ile unmatched'a yazılır ve handle kuyruğa eklenir. Yeni 'catalog' tohumu EKLENMEZ. İlerleme crawl_state'te
   * `shopify:<shopId>` (sonraki sayfa) ve `shopify-done:<shopId>` (tur bitiş zamanı) anahtarlarında. Dönüş: { pages, products, done }.
   */
  async function importListing(shop, { pages = 20 } = {}) {
    const key = `shopify:${shop.id}`;
    let page = Number(getState(key) ?? 1);
    const out = { pages: 0, products: 0, done: false };
    const finish = () => {
      out.done = true;
      setState(`shopify-done:${shop.id}`, now());
      setState(key, 1);
    };
    while (out.pages < pages) {
      if (page > 100) return (finish(), out);
      const r = await get(shop, `${base(shop)}/products.json?limit=250&page=${page}`, { json: true });
      if (!r.ok) {
        out.reason = r.reason;
        break;
      }
      let list;
      try {
        list = JSON.parse(r.body).products ?? [];
      } catch {
        out.reason = 'bad-json';
        break;
      }
      for (const p of list) {
        if (!p?.handle) continue;
        const row = db.prepare('SELECT ean, status FROM mixo_enrich WHERE handle = ?').get(p.handle);
        const res = ingestProduct(shop, p, parsePairs(row?.ean));
        const v0 = p.variants?.[0];
        const prio = enrichPriority(p.vendor, v0?.sku);
        const price = Number(v0?.price) || null;
        if (!row)
          db.prepare(
            'INSERT INTO mixo_enrich (handle, shopId, priority, price, checkedAt, status, ean) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            p.handle,
            shop.id,
            prio,
            price,
            res.pairs ? now() : null, // listede barkod geldiyse zaten çözülmüştür; yoksa .json ile sorulacak
            res.pairs ? 'ok' : null,
            res.pairs,
          );
        else
          db.prepare(
            `UPDATE mixo_enrich SET priority = ?, price = ?,
               status = CASE WHEN status = 'gone' THEN NULL ELSE status END,
               checkedAt = CASE WHEN status = 'gone' THEN NULL ELSE checkedAt END WHERE handle = ?`,
          ).run(prio, price, p.handle);
        out.products++;
      }
      out.pages++;
      if (list.length < 250) return (finish(), out);
      setState(key, ++page);
    }
    if (page > 100) finish();
    log(`mixo listing ${shop.domain}: ${out.products} products ${out.reason || ''}`);
    return out;
  }

  return { seedHandles, seedDue, enrichBatch, importListing, getState };
}

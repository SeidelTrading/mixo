/*
 * KarsilastirBot: mağaza ürün sayfası tarayıcısı. DEĞİŞTİRİLEMEZ KURALLAR (pazarlık konusu değil):
 *
 *  1. robots.txt alınır ve uyulur (24 saat önbellek); yasaklı yol atlanır. robots.txt alınamıyorsa sayfa çekilmez.
 *  2. Kimlik: User-Agent `KarsilastirBot/0.1 (+<site>/bot)`; /bot sayfası botu açıklar. Başka UA taklit edilmez.
 *  3. Host başına en fazla 1 istek / 10 sn (robots.txt ve site haritası istekleri dahil) ve küresel eşzamanlılık sınırı.
 *  4. Fiyat YALNIZCA HTML içindeki schema.org JSON-LD / microdata Product/Offer verisinden okunur (jsonld.mjs).
 *  5. Başsız tarayıcı, oturum açma, çerez/onay tıklama, CAPTCHA çözme, vekil (proxy) döndürme YOK.
 *  6. 403/429/503 alınırsa o host 24 saat boyunca bırakılır; yeniden deneme döngüsü YOK (bir istek, bir sonuç).
 *  7. Mağaza başına `blocked` bayrağı ve opt-out listesi HER istekten hemen önce veritabanından okunur (anında etkili).
 *  8. Tohum URL'ler yalnızca robots.txt'te listelenen site haritalarından ya da admin'in girdiği adreslerden gelir.
 *     Yönlendirmeler yalnızca mağazanın kendi sitesi içinde (www <-> çıplak alan adı ve alt alan adları) izlenir;
 *     her adım yeniden robots/hız denetiminden geçer.
 */
import { createHash } from 'node:crypto';
import { dayOf } from '../db.mjs';
import { decompress, textChunks } from '../feeds/stream.mjs';
import { normalizeEan } from '../lib/ean.mjs';
import { isPrivateHostname } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { isInternalSku, mpnCandidates } from '../lib/mpn.mjs';
import { STORES } from '../lib/stores.mjs';
import { RateLimiter } from './limiter.mjs';
import { bestOffer, extractProducts } from './jsonld.mjs';
import { crawlDelayMs, isAllowed, parseRobots } from './robots.mjs';

export const BOT_TOKEN = 'KarsilastirBot';
export const BOT_VERSION = '0.1';
export const HOST_INTERVAL_MS = 10_000;
export const BACKOFF_MS = 24 * 3600 * 1000;
export const ROBOTS_TTL_MS = 24 * 3600 * 1000;
export const BACKOFF_STATUSES = new Set([403, 429, 503]);
const MAX_BYTES = 2 * 1024 * 1024;
/** Site haritası sınırları: sıkıştırılmış en çok 10 MB, açılmış en çok 50 MB (sitemaps.org protokol sınırı). */
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
const MAX_SITEMAP_INFLATED = 50 * 1024 * 1024;
/** Hedefli modda (secomp.de: 23 MB düz harita) sınırlar yükselir; gövde yine akışla okunur, belleğe tamamı alınmaz. */
const MAX_SITEMAP_BYTES_TARGETED = 30 * 1024 * 1024;
const MAX_SITEMAP_INFLATED_TARGETED = 150 * 1024 * 1024;
/** Bir harita dosyasından en çok bu kadar <loc> okunur (sitemaps.org: dosya başına en çok 50 000). */
const MAX_SITEMAP_LOCS = 50_000;
/** Standart, dürüst Accept değeri: HTML/XML tercih edilir, ama `*` ile başka türler (text/xml vb.) de kabul edilir. */
export const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const MAX_SITEMAPS = 4;
const MAX_CHILD_SITEMAPS = 3;
const MAX_DISCOVERED = 500;
const MAX_TARGETED = 2500;
const MAX_HOPS = 3;
/** Hedefli keşifte bir çalıştırmada (günde bir) dizinden okunan alt harita sayısı; devam imleci kaldığı yerden sürer. */
const TARGETED_CHILD_MAPS = 8;
const MAX_TARGETED_MAPS = 20;
/** Başlık benzerliğiyle (targeted-title) bir çalıştırmada eklenen en çok tohum. */
const MAX_TITLE_SEEDS = 500;
/** Turda mağaza başına rastgele (site haritası) tohum tavanı; hedefli tohumlar bu tavana girmez. */
export const RANDOM_PER_SHOP = 3;
/** robots.txt Crawl-delay bundan büyükse host taranmaz (mağaza taranmak istemiyor). */
const MAX_CRAWL_DELAY_MS = 300_000;
const MIXO_SITE = 'mixoutlet.de';
const SEARCH_RECHECK_MS = 14 * 24 * 3600 * 1000;
const hostname = h => h.replace(/:\d+$/, '').toLowerCase();
/** a ve b yalnızca baştaki "www." ile farklı mı? (www.x.de <-> x.de) */
const isWwwPair = (a, b) => {
  const [x, y] = [hostname(a), hostname(b)];
  return x !== y && x.replace(/^www\./, '') === y.replace(/^www\./, '');
};
/** Mağazanın sitesi: baştaki "www." atılır; site ve tüm alt alan adları aynı mağazadır. */
export const siteOf = h => hostname(h).replace(/^www\./, '');
export const onSite = (host, site) => {
  const h = hostname(host);
  return h === site || h.endsWith('.' + site);
};

const PRODUCT_MAP = /product|urun|ürün|produkt|artikel|articles?(?![a-z])|(^|[^a-z])p-/i;
// "page" yalnız ürün ayrıntı sayfası haritası değilse elenir (MediaMarkt/Saturn: sitemap-productdetailspages-000.xml).
const NON_PRODUCT_MAP =
  /brand|marka|marke|merk|categor|kategori|blog|(?<!details?)pages?(?![a-z])|sayfa|cms|content|static|news|haber|kampanya|landing|tag|store|magaza|filial|video|image|gorsel|faq|help|yardim/i;
/** Güçlü ürün sayfası işareti: /p/, /product(s)/, -p-123, uzun sayısal kimlik, index_123.aspx vb. */
const STRONG_PRODUCT_URL =
  /\/(p|pd|dp|product|products|produkt|produkte|urun|artikel|article|item)\/|-p-\d+|[/_-]\d{6,}(\.html?|\/|$)|\/\d{5,}\/product\/?$|index_\d+\.aspx$/i;
const NON_PRODUCT_SEGMENTS = new Set(
  (
    'marka markalar brand brands marke marken merk merken kategori kategoriler category categories c ' +
    'blog blogs kampanya kampanyalar campaign aktion aktionen actie acties arama search suche zoeken ' +
    'yardim help hilfe klantenservice iletisim contact kontakt sss faq hakkimizda about ueber-uns over-ons ' +
    'impressum agb datenschutz privacy gizlilik kvkk sepet cart warenkorb winkelwagen login giris uyelik ' +
    'hesabim account konto magazalar stores filialen winkels tag tags etiket news haber haberler sayfa page pages ' +
    'cms info service lp landing inloggen anmelden registrieren uye-ol'
  ).split(' '),
);

/** Site haritası dizinindeki alt haritaları sıralar: ürün adlı olanlar önce, marka/kategori/blog/sayfa haritaları atlanır. */
export function rankSitemaps(urls) {
  const name = u => {
    try {
      return decodeURIComponent(new URL(u).pathname);
    } catch {
      return String(u);
    }
  };
  return urls
    .filter(u => !NON_PRODUCT_MAP.test(name(u)))
    .map((u, i) => ({ u, i, score: PRODUCT_MAP.test(name(u)) ? 0 : 1 }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(x => x.u);
}

/** Ürün sayfası olabilir mi? Kök, marka/kategori/blog/kampanya/arama/yardım vb. sayfalar elenir. */
export function looksLikeProductUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const segs = u.pathname
    .split('/')
    .filter(Boolean)
    .map(s => {
      try {
        return decodeURIComponent(s).toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    });
  if (!segs.length) return false;
  return !segs.some(s => NON_PRODUCT_SEGMENTS.has(s.replace(/\.(html?|php|aspx?)$/, '')));
}

const normTok = v =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
const normBrand = v =>
  String(v ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
/** Yol parçalarının 1-3'lü birleşimleri ("tommy-hilfiger" -> "tommyhilfiger"). */
function tokenJoins(toks) {
  const out = new Set();
  for (let i = 0; i < toks.length; i++) {
    let j = '';
    for (let n = 0; n < 3 && i + n < toks.length; n++) out.add((j += toks[i + n]));
  }
  return out;
}

/**
 * Hedefli tarama: URL'nin ürün adı kısmı Mixoutlet'in bir parça numarasını ya da EAN'ını içeriyor mu?
 * `targets`: mixoTargets Map'i (token -> { brand, brands, ean }). Yol parçaları 1-3'lü birleştirilerek denenir
 * ("tk-5240m" -> "tk5240m"). KISA (6 karakterden az) ya da yalnız rakamdan oluşan MPN token'ı, ürün ID'leriyle
 * çakışmasın diye yalnız URL'de markanın da geçtiği durumda eşleşir ("/delock-66556-adapter" evet, "/product/66556" hayır).
 * EAN token'ı (13 hane) tek başına yeter.
 */
export function urlMatches(url, targets) {
  let path;
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return false;
  }
  const toks = path.split(/[^a-z0-9]+/).filter(Boolean);
  const mapped = targets instanceof Map;
  let joins = null;
  for (let i = 0; i < toks.length; i++) {
    let j = '';
    for (let n = 0; n < 3 && i + n < toks.length; n++) {
      j += toks[i + n];
      if (j.length < 5 || !/\d/.test(j) || !targets.has(j)) continue;
      const e = mapped ? targets.get(j) : null;
      if (!e || e.ean === j || (j.length >= 6 && !/^\d+$/.test(j))) return true;
      joins ??= tokenJoins(toks);
      if ((e.brands ?? [e.brand]).some(b => normBrand(b) && joins.has(normBrand(b)))) return true;
    }
  }
  return false;
}

const mixoShopIdsOf = db =>
  db
    .prepare('SELECT id, domain FROM shops')
    .all()
    .filter(r => siteOf(r.domain) === MIXO_SITE)
    .map(r => r.id);

/**
 * Mixoutlet'in gerçek parça numaraları ve EAN'ları -> hedef Map'i: token -> { brand, brands, ean }.
 * Kaynak: unmatched.mpn ve products.mpn (sku KULLANILMAZ: BA-/arp-/OT-/UHREN1- gibi iç kodlar rakip sayfalarında
 * geçmez; isInternalSku olanlar her durumda atlanır). Her MPN'in mpnCandidates varyantları eklenir (en az 5 karakter,
 * en az bir rakam). EAN token'ları (13 hane) offers.ean ve geçerli unmatched.rawEan'dan gelir (bazı mağazalar URL'de
 * EAN taşır). Bir token farklı EAN'lı ürünlere denk geliyorsa ean boş bırakılır.
 */
export function mixoTargets(db) {
  const map = new Map();
  const put = (token, brand, ean) => {
    const cur = map.get(token);
    if (!cur)
      return void map.set(token, { brand: brand || '', brands: brand ? [brand] : [], ean: ean || null });
    if (brand && !cur.brands.includes(brand)) {
      cur.brands.push(brand);
      cur.brand ||= brand;
    }
    if (cur.ean !== (ean || null)) cur.ean = null;
  };
  const addMpn = (mpn, brand, ean) => {
    if (!mpn || isInternalSku(mpn)) return;
    for (const c of mpnCandidates(mpn)) {
      const n = normTok(c);
      if (n.length >= 5 && /\d/.test(n)) put(n, brand, ean);
    }
  };
  const ids = mixoShopIdsOf(db);
  if (!ids.length) return map;
  const q = ids.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT mpn, brand, rawEan FROM unmatched WHERE shopId IN (${q})`).all(...ids)) {
    const ean = normalizeEan(r.rawEan);
    addMpn(r.mpn, r.brand, ean);
    if (ean?.length === 13) map.set(ean, { brand: '', brands: [], ean });
  }
  for (const r of db
    .prepare(
      `SELECT p.ean, p.mpn, p.brand FROM products p JOIN offers o ON o.ean = p.ean WHERE o.shopId IN (${q})`,
    )
    .all(...ids)) {
    addMpn(r.mpn, r.brand, r.ean);
    if (r.ean?.length === 13) map.set(r.ean, { brand: '', brands: [], ean: r.ean });
  }
  return map;
}

/** Başlıktan ayırt edici token'lar: marka dışında ölçü/sayı olmayan, en az 3 karakterli, harf içeren sözcükler. */
const TITLE_STOP = new Set(
  'und mit fur fuer the and set von der die das ein eine original neu new inkl zoll fuer'.split(' '),
);
const SIZE_TOKEN = /^\d+([.,]\d+)?(mm|cm|m|zoll|inch|gb|tb|mb|kb|w|v|a|hz|ml|g|kg|l|mah|ghz|mhz)?$/;
export function titleTokens(text) {
  const toks = String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && /[a-z]/.test(t) && !SIZE_TOKEN.test(t) && !TITLE_STOP.has(t));
  return [...new Set(toks)];
}

/**
 * Başlık token indeksi (YALNIZ TOHUM ÜRETİR; başlık benzerliği hiçbir zaman teklif bağlamaz): Mixoutlet ürünlerinin
 * (unmatched ve EAN'lı) başlık token'ları ters indekse alınır. Marka bilinmeyen ya da 3'ten az ayırt edici token'lı
 * başlıklar alınmaz.
 */
export function buildTitleIndex(db) {
  const ids = mixoShopIdsOf(db);
  const entries = [];
  const postings = new Map();
  if (!ids.length) return { entries, postings };
  const q = ids.map(() => '?').join(',');
  const rows = [
    ...db.prepare(`SELECT title, brand FROM unmatched WHERE shopId IN (${q})`).all(...ids),
    ...db
      .prepare(
        `SELECT p.title, p.brand FROM products p JOIN offers o ON o.ean = p.ean WHERE o.shopId IN (${q})`,
      )
      .all(...ids),
  ];
  for (const r of rows) {
    const brand = normBrand(r.brand);
    const tokens = new Set(titleTokens(r.title));
    if (!brand || tokens.size < 3) continue;
    const i = entries.push({ brand, tokens }) - 1;
    for (const t of tokens) (postings.get(t) ?? postings.set(t, []).get(t)).push(i);
  }
  return { entries, postings };
}

/** URL'nin ad kısmı bir Mixoutlet başlığına benziyor mu? Marka URL'de geçmeli, ortak en az 3 token, Jaccard >= 0,6. */
export function titleMatches(url, index, minJaccard = 0.6) {
  if (!index?.entries.length) return false;
  let path;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return false;
  }
  const u = new Set(titleTokens(path));
  if (u.size < 3) return false; // ad yok (ör. /p/123456): eşleşme aranmaz
  const joins = tokenJoins(
    path
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const cand = new Set();
  for (const t of u) {
    const list = index.postings.get(t);
    if (list && list.length <= 300) for (const i of list) cand.add(i);
  }
  for (const i of cand) {
    const e = index.entries[i];
    if (!joins.has(e.brand)) continue;
    let c = 0;
    for (const t of e.tokens) if (u.has(t)) c++;
    if (c >= 3 && c / (u.size + e.tokens.size - c) >= minJaccard) return true;
  }
  return false;
}

/** 0: ürün değil, 1: olabilir, 2: güçlü ürün işareti var (önce bunlar alınır). */
export function productUrlScore(url) {
  if (!looksLikeProductUrl(url)) return 0;
  const raw = new URL(url).pathname;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    // bozuk yüzde kodlaması: ham yol kullanılır
  }
  return STRONG_PRODUCT_URL.test(path) ? 2 : 1;
}

/** Gövdeyi en çok `limit` bayta kadar okur; aşılırsa { truncated: true }. */
async function readBytes(res, limit) {
  const chunks = [];
  let total = 0;
  if (!res.body) return { buf: Buffer.alloc(0), truncated: false };
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      chunks.push(Buffer.from(value.subarray(0, value.length - (total - limit))));
      await reader.cancel();
      return { buf: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { buf: Buffer.concat(chunks), truncated: false };
}

/** Site haritası dosyası gibi görünen URL (.xml / .xml.gz): urlset içinde listelenirse alt harita sayılır (boyner.com.tr). */
const SITEMAP_FILE = /\.xml(\.gz)?$/i;
const isSitemapFile = l => {
  try {
    return SITEMAP_FILE.test(new URL(l).pathname);
  } catch {
    return false;
  }
};
const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi;

/**
 * Site haritasını AKIŞ olarak okur; belleğe tamamı alınmaz. Sıkıştırma YALNIZCA içerikten (1f 8b) anlaşılır:
 * ".xml.gz" adlı ama düz XML sunan sunucular (otto.de) ve fetch'in Content-Encoding'i zaten açtığı yanıtlar böylece
 * çift açılmaz. Ham gövde MAX_SITEMAP_BYTES'ta, açılmış metin MAX_SITEMAP_INFLATED'da kesilir (kısmi sonuç döner).
 * `keep(loc)`: urlset girdileri için 0 (at) / 1 (zayıf aday) / 2 (güçlü aday); dizin (sitemapindex) girdileri süzülmez.
 * `want` kadar güçlü aday bulununca okuma durdurulur ve bağlantı kapatılır.
 * `maxBytes` / `maxInflated`: ham ve açılmış sınırlar (varsayılan 10 MB / 50 MB; hedefli modda 30 MB / 150 MB).
 * Yalnız .xml/.xml.gz adresi içeren urlset dizin sayılır. Dönüş: { index, locs (güçlüler önce), truncated }.
 * @param {AsyncIterable<Uint8Array>} body
 * @param {{ keep?: (loc: string) => number, want?: number, maxBytes?: number, maxInflated?: number }} [opts]
 */
export async function readSitemap(
  body,
  {
    keep = () => 2,
    want = MAX_SITEMAP_LOCS,
    maxBytes = MAX_SITEMAP_BYTES,
    maxInflated = MAX_SITEMAP_INFLATED,
  } = {},
) {
  let raw = 0;
  let truncated = false;
  const it = body[Symbol.asyncIterator]();
  /** @type {AsyncIterable<Uint8Array>} */
  const capped = {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (raw >= maxBytes) {
          truncated = true;
          return { done: true, value: undefined };
        }
        const r = await it.next();
        if (!r.done) raw += r.value.length;
        return r;
      },
      async return() {
        // Erken bırakma: bağlantı kapatılır ama beklenmez (askıdaki bir okuma kapanışı kilitlemesin).
        it.return?.().catch(() => {});
        return { done: true, value: undefined };
      },
    }),
  };
  let index = null;
  const strong = [];
  const weak = [];
  const nested = [];
  let buf = '';
  let inflated = 0;
  const take = loc => {
    if (index) return void (strong.length < MAX_SITEMAP_LOCS && strong.push(loc));
    if (isSitemapFile(loc)) return void (nested.length < 1000 && nested.push(loc));
    const k = keep(loc);
    if (k >= 2) strong.push(loc);
    else if (k === 1 && weak.length < want) weak.push(loc);
  };
  try {
    for await (const t of textChunks(decompress(capped, { compression: 'auto', maxBytes: Infinity }))) {
      inflated += t.length;
      buf += t;
      if (index === null) {
        const m = /<(sitemapindex|urlset)\b/i.exec(buf);
        if (m) index = m[1].toLowerCase() === 'sitemapindex';
        else if (buf.length < 64 * 1024) continue;
        else index = false;
      }
      let end = 0;
      LOC_RE.lastIndex = 0;
      for (let m; (m = LOC_RE.exec(buf)); end = LOC_RE.lastIndex) take(m[1].replace(/&amp;/g, '&'));
      buf = buf.slice(end);
      if (buf.length > 64 * 1024) buf = buf.slice(-8 * 1024); // <loc> içermeyen dev blok (resim/çeviri uzantıları)
      if ((!index && strong.length >= want) || strong.length >= MAX_SITEMAP_LOCS) {
        truncated = true;
        break; // yeterli: bağlantı for-await çıkışında kapatılır
      }
      if (inflated > maxInflated) {
        truncated = true;
        break;
      }
    }
  } catch (e) {
    // Kesilmiş gzip ya da bozuk veri: elde aday varsa kısmi sonuç kullanılır, yoksa hata.
    if (!(strong.length + weak.length)) throw e;
    truncated = true;
  }
  // Yalnız harita dosyası listeleyen urlset (sitemapindex yerine yanlış kök): dizin gibi işlenir.
  if (!index && !strong.length && !weak.length && nested.length)
    return { index: true, locs: nested, truncated };
  return { index: !!index, locs: [...strong, ...weak], truncated };
}

/** @param {any} o */
export function createCrawler({
  db,
  siteUrl,
  fetchImpl = fetch,
  now = Date.now,
  limiter,
  allowPrivateHosts = false,
  maxConcurrent = 4,
  ownDomains = [],
  ownIntervalMs = 2000,
  log = () => {},
  stores = STORES,
  randomPerShop = RANDOM_PER_SHOP,
}) {
  const userAgent = `${BOT_TOKEN}/${BOT_VERSION} (+${siteUrl}/bot)`;
  const lim = limiter || new RateLimiter({ minIntervalMs: HOST_INTERVAL_MS, maxConcurrent, now });

  const setBackoff = (host, reason) =>
    db
      .prepare(
        'INSERT INTO host_backoff (host, until, reason) VALUES (?, ?, ?) ON CONFLICT(host) DO UPDATE SET until = excluded.until, reason = excluded.reason',
      )
      .run(host, now() + BACKOFF_MS, reason);
  // www ve çıplak alan adı aynı sitedir: birine gelen 403/429/503 beklemesi ötekine de uygulanır (yoksa çıplak
  // alan adındaki robots.txt isteği, www engelinden sonra yine siteye gider).
  const inBackoff = host => {
    const pair = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
    const r = db.prepare('SELECT max(until) AS until FROM host_backoff WHERE host IN (?, ?)').get(host, pair);
    return !!r && r.until > now();
  };
  const optedOut = host => {
    const h = hostname(host);
    return db
      .prepare('SELECT domain FROM optouts')
      .all()
      .some(r => h === r.domain || h.endsWith('.' + r.domain));
  };

  /** host -> robots.txt Crawl-delay (ms); getRobots her robots.txt okuyuşunda günceller. */
  const crawlDelays = new Map();

  /** Her istekten önce çağrılır; neden metni ya da null döner. */
  function skipReason(shop, u) {
    if (!/^https?:$/.test(u.protocol)) return 'scheme';
    if (!allowPrivateHosts && isPrivateHostname(u.hostname)) return 'private-host';
    const fresh = db.prepare('SELECT blocked, active FROM shops WHERE id = ?').get(shop.id);
    if (!fresh || fresh.blocked || !fresh.active) return 'shop-blocked';
    if (optedOut(u.host)) return 'opt-out';
    if (!onSite(u.host, siteOf(shop.domain))) return 'host-mismatch';
    if (inBackoff(u.host)) return 'backoff';
    return null;
  }

  /**
   * Tek HTTP isteği: hız sınırlı, UA'lı, yönlendirme izlemeden, çerezsiz. 403/429/503 -> host 24 saat bekletilir.
   * Gövde de limiter yuvasının İÇİNDE okunur: yavaş bir gövde aralığı aşsa bile aynı host'a ikinci istek üst üste binmez.
   * Akış (stream: site haritası) için yuva, çağıranın `release()` çağrısına kadar (en geç akış zaman aşımı + 5 sn) tutulur.
   */
  async function requestOnce(u, { stream = false, maxBytes = MAX_BYTES, streamTimeoutMs = 60_000 } = {}) {
    const own = ownDomains.some(d => onSite(u.host, siteOf(d)));
    // Host aralığı: robots.txt Crawl-delay daha büyükse o uygulanır (örn. 3djake 10 sn, notino 4 sn).
    const delay = crawlDelays.get(u.host) ?? 0;
    const base = own ? ownIntervalMs : HOST_INTERVAL_MS;
    const work = async () => {
      const res = await fetchImpl(u.href, {
        headers: { 'user-agent': userAgent, accept: ACCEPT },
        redirect: 'manual',
        // Site haritaları büyük ve yavaş üretilebilir: akış okuması dahil 60 sn (hedefli büyük haritada daha uzun); sayfalar 15 sn.
        signal: AbortSignal.timeout(stream ? streamTimeoutMs : 15_000),
      });
      if (BACKOFF_STATUSES.has(res.status)) {
        setBackoff(u.host, `HTTP ${res.status}`);
        await res.body?.cancel();
        return { status: res.status, backoff: true };
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        return { status: res.status, location: res.headers.get('location') };
      }
      const type = res.headers.get('content-type') || '';
      if (!res.ok) {
        await res.body?.cancel();
        return { status: res.status, body: '', type };
      }
      if (stream) return { status: res.status, res, type }; // gövdeyi çağıran tüketir ya da kapatır
      const { buf } = await readBytes(res, maxBytes);
      return { status: res.status, body: new TextDecoder('utf-8').decode(buf), type };
    };
    const interval = delay > base ? delay : own ? ownIntervalMs : undefined;
    // Hız yuvası www'siz alan adına göre: çıplak -> www yönlendirmesi de aynı host sayılır (10 sn aralık atlanmaz).
    const slotKey = u.host.replace(/^www\./, '');
    if (!stream) return lim.run(slotKey, work, interval);
    /** @type {(v?: any) => void} */
    let release = () => {};
    const held = new Promise(r => (release = r));
    return new Promise((resolve, reject) => {
      lim
        .run(
          slotKey,
          async () => {
            let r;
            try {
              r = await work();
            } catch (e) {
              reject(e);
              return;
            }
            if (!r.res) return resolve(r); // gövdesiz sonuç: yuva hemen bırakılır
            resolve({ ...r, release });
            const timer = setTimeout(release, streamTimeoutMs + 5000); // çağıran unutursa yuva sonsuza kadar tutulmaz
            timer.unref?.();
            await held;
            clearTimeout(timer);
          },
          interval,
        )
        .catch(reject);
    });
  }

  const saveRobots = (host, body) =>
    db
      .prepare(
        'INSERT INTO robots_cache (host, body, fetchedAt) VALUES (?, ?, ?) ON CONFLICT(host) DO UPDATE SET body = excluded.body, fetchedAt = excluded.fetchedAt',
      )
      .run(host, body, now());

  /**
   * robots.txt: 24 saat önbellek. Dönüş: ayrıştırılmış robots ya da null (bu turda çekme).
   * Yönlendirme yalnızca aynı sitedeki www <-> çıplak alan adı eşine izlenir (örn. www.mixoutlet.de -> mixoutlet.de);
   * RFC 9309'a göre hedefteki kurallar kaynak host için de geçerlidir, ikisine de önbelleğe yazılır.
   */
  async function getRobots(u) {
    const robots = await loadRobots(u);
    if (robots) crawlDelays.set(u.host, crawlDelayMs(robots, BOT_TOKEN));
    return robots;
  }

  async function loadRobots(u) {
    const cached = db.prepare('SELECT body, fetchedAt FROM robots_cache WHERE host = ?').get(u.host);
    if (cached && now() - cached.fetchedAt < ROBOTS_TTL_MS) return parseRobots(cached.body);
    let target = new URL('/robots.txt', u.origin);
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (inBackoff(u.host)) return null;
      let r;
      try {
        r = await requestOnce(target);
      } catch {
        return null;
      }
      if (r.backoff) return null;
      if (r.location) {
        const next = new URL(r.location, target);
        if (next.host !== u.host && !(isWwwPair(next.host, u.host) && next.port === u.port)) return null;
        target = next;
        continue;
      }
      if (r.status === 200 || r.status === 404 || r.status === 410) {
        const body = r.status === 200 ? r.body : ''; // 404/410: kural yok
        saveRobots(u.host, body);
        if (target.host !== u.host) saveRobots(target.host, body);
        return parseRobots(body);
      }
      return null;
    }
    return null;
  }

  /**
   * Güvenli sayfa çekme: tüm kurallar burada uygulanır. Dönüş: { ok, body, finalUrl } ya da { ok:false, reason }.
   * sitemap: true ise gövde akış olarak okunur ve { ok, index, locs, truncated, finalUrl } döner (readSitemap).
   * @param {any} shop @param {string} rawUrl
   * `maxSitemapBytes`: harita için ham gövde sınırı (hedefli modda 30 MB; varsayılan 10 MB).
   * @param {{ sitemap?: boolean, keep?: (loc: string) => number, want?: number, json?: boolean, maxSitemapBytes?: number }} [opts]
   * @returns {Promise<any>}
   */
  async function guardedGet(
    shop,
    rawUrl,
    { sitemap = false, keep, want, json = false, maxSitemapBytes = MAX_SITEMAP_BYTES } = {},
  ) {
    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return { ok: false, reason: 'bad-url' };
    }
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const why = skipReason(shop, u);
      if (why) return { ok: false, reason: why };
      const robots = await getRobots(u);
      if (!robots) return { ok: false, reason: 'robots-unavailable' };
      if (!isAllowed(robots, BOT_TOKEN, u.pathname + u.search))
        return { ok: false, reason: 'robots-disallowed' };
      const why2 = skipReason(shop, u); // robots.txt isteği sırasında 403/429/503 gelmiş olabilir
      if (why2) return { ok: false, reason: why2 };
      if ((crawlDelays.get(u.host) ?? 0) > MAX_CRAWL_DELAY_MS) return { ok: false, reason: 'crawl-delay' };
      const bigMap = sitemap && maxSitemapBytes > MAX_SITEMAP_BYTES;
      let r;
      try {
        r = await requestOnce(u, {
          stream: sitemap,
          maxBytes: json ? 12 * 1024 * 1024 : MAX_BYTES,
          streamTimeoutMs: bigMap ? 180_000 : 60_000,
        });
      } catch (e) {
        return { ok: false, reason: 'network-error: ' + String(e.message).slice(0, 80) };
      }
      if (r.backoff) return { ok: false, reason: `backoff-${r.status}` };
      if (r.location) {
        u = new URL(r.location, u);
        continue; // aynı host denetimi skipReason içinde (host-mismatch) yapılır
      }
      if (r.status !== 200) {
        await r.res?.body?.cancel().catch(() => {}); // 2xx ama 200 değil (204 ...): akış kapatılır, yuva bırakılır
        r.release?.();
        return { ok: false, reason: `http-${r.status}` };
      }
      if (sitemap) {
        const body = r.res.body;
        try {
          if (!/xml|text\/plain|gzip|octet-stream/i.test(r.type))
            return { ok: false, reason: 'content-type' };
          if (!body) return { ok: true, index: false, locs: [], truncated: false, finalUrl: u.href };
          const limits = bigMap
            ? { maxBytes: maxSitemapBytes, maxInflated: MAX_SITEMAP_INFLATED_TARGETED }
            : { maxBytes: maxSitemapBytes };
          return { ok: true, ...(await readSitemap(body, { keep, want, ...limits })), finalUrl: u.href };
        } catch (e) {
          return { ok: false, reason: 'sitemap-decode: ' + String(e.message).slice(0, 80) };
        } finally {
          await body?.cancel().catch(() => {}); // erken bırakılan akışın bağlantısı kapatılır
          r.release?.(); // host yuvası ancak gövde bitince (ya da kapatılınca) bırakılır
        }
      }
      if (!(json ? /json/i : /html|xml|text\/plain/i).test(r.type))
        return { ok: false, reason: 'content-type' };
      return { ok: true, body: r.body, finalUrl: u.href };
    }
    return { ok: false, reason: 'too-many-redirects' };
  }

  /** Mağazanın lib/stores.mjs kaydı (arama şablonu, brands, priceNet, eanFromText); yoksa null. */
  const storeCfg = shop =>
    stores.find(x => x.market === shop.market && siteOf(x.domain) === siteOf(shop.domain)) ?? null;

  /**
   * Çekilmiş bir sayfa gövdesini işler (tohum taraması ve arama ortak yolu): schema.org Product/Offer verisi
   * ingestOffer'a verilir. Mağaza kaydında priceNet varsa fiyat x1,19 (2 haneye yuvarlı) yapılır; eanFromText varsa
   * gtin yokken metindeki tek EAN kullanılır. Sayfadan EAN'lı teklif çıktıysa katalogdan gelen EAN'sız kayıt (aynı URL)
   * silinir: sayım çift olmasın. `accept(product)` verilirse yalnız onaylanan ürünler yazılır (MPN araması doğrulaması).
   * Dönüş: { offer, unmatched, skipped, reason }.
   * @param {any} shop @param {string} url @param {string} body @param {{ accept?: (p: any) => boolean }} [opts]
   */
  function ingestPage(shop, url, body, { accept } = {}) {
    const out = { offer: 0, unmatched: 0, skipped: 0, reason: null };
    const cfg = storeCfg(shop);
    const products = extractProducts(body, { eanFromText: !!cfg?.eanFromText });
    if (!products.length) out.reason = 'no-schema-org-product';
    for (const p of products) {
      if (accept && !accept(p)) continue;
      const o = bestOffer(p);
      out[
        ingestOffer(
          db,
          shop,
          {
            ean: p.ean,
            mpn: p.mpn,
            sku: p.sku,
            title: p.name,
            brand: p.brand,
            image: p.image,
            category: p.category,
            price: cfg?.priceNet ? Math.round(o.price * 119) / 100 : o.price,
            currency: o.currency,
            shipping: o.shipping,
            inStock: o.inStock,
            url,
          },
          now(),
        )
      ]++;
    }
    if (products.length && accept && out.offer + out.unmatched + out.skipped === 0) out.reason = 'unverified';
    if (out.offer) db.prepare('DELETE FROM unmatched WHERE shopId = ? AND url = ?').run(shop.id, url);
    return out;
  }

  /** Bir tohum sayfayı tarar; schema.org verisi bulunursa ingestPage ile işler. */
  async function crawlSeed(seed) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(seed.shopId);
    const out = { offer: 0, unmatched: 0, skipped: 0, reason: null };
    if (!shop) return { ...out, reason: 'no-shop' };
    const r = await guardedGet(shop, seed.url);
    if (!r.ok) out.reason = r.reason;
    else Object.assign(out, ingestPage(shop, seed.url, r.body));
    db.prepare('UPDATE seeds SET lastCrawledAt = ?, lastStatus = ? WHERE id = ?').run(
      now(),
      out.reason || 'ok',
      seed.id,
    );
    log(`crawl ${seed.url}: ${out.reason || 'ok'}`);
    return out;
  }

  const getState = k => db.prepare('SELECT value FROM crawl_state WHERE key = ?').get(k)?.value ?? null;
  const setState = (k, v) =>
    db
      .prepare(
        'INSERT INTO crawl_state (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      )
      .run(k, String(v), now());

  /**
   * Tohum keşfi: yalnızca robots.txt'te listelenen site haritaları (en çok 4 harita isteği, dizinden en çok 3 alt harita,
   * 500 URL). Dizinlerde ürün haritaları önce gelir; marka/kategori/blog/sayfa haritaları ve ürün dışı URL'ler atlanır.
   * Haritalar akış olarak okunur; 500 güçlü ürün adayı bulununca okuma durur (dev haritalar belleğe alınmaz).
   * Mağaza sitesi www ile çıplak alan adı ve alt alan adlarını kapsar (örn. sitemap.boyner.com.tr, www -> çıplak).
   * Her harita isteği guardedGet'ten geçer (robots + host hız sınırı + engel/opt-out). Dönüş: eklenen tohum sayısı.
   *
   * Hedefli mod (`targets`): yalnız MPN/EAN eşleşen URL'ler 'targeted' tohum olur (eşleşmeyen rastgele URL eklenmez).
   * Alt haritalar sıralı okunur: bir çalıştırmada TARGETED_CHILD_MAPS tane, kaldığı yer crawl_state
   * 'targeted-cursor:<shopId>' içinde (dizin + alt harita listesi özeti değişirse imleç sıfırlanır), böylece 150 haritalı
   * dizin ~19 günde bir tam döner. Ham harita sınırı 30 MB'tır (secomp.de). `titles` (buildTitleIndex) verilirse başlığı
   * Mixoutlet ürününe benzeyen URL'ler 'targeted-title' tohumu olur; bunlar yalnız tohumdur, teklifi sayfadaki
   * EAN / marka+MPN doğrular.
   */
  /** @param {any} shop @param {string} [origin] @param {{ stats?: any, targets?: Map<string, any>, titles?: any }} [opts] */
  async function discoverSeeds(shop, origin = `https://${shop.domain}`, { stats, targets, titles } = {}) {
    const targeted = !!targets?.size;
    const maxDiscovered = targeted ? MAX_TARGETED : MAX_DISCOVERED;
    const u = new URL(origin);
    const robots = await getRobots(u);
    if (!robots) return 0;
    const site = siteOf(shop.domain);
    const onShop = s => {
      try {
        const x = new URL(s);
        return /^https?:$/.test(x.protocol) && onSite(x.host, site);
      } catch {
        return false;
      }
    };
    // Bilinen host'ların robots kuralları (önbellekten; ürün URL'leri yazılmadan önce eksikler çekilir).
    const robotsOf = new Map([[u.host, robots]]);
    const allowed = l => {
      const x = new URL(l);
      const r = robotsOf.get(x.host);
      return !r || isAllowed(r, BOT_TOKEN, x.pathname + x.search);
    };
    const titleHits = [];
    // Sıra önemli: 30 MB'lık haritada (~300 bin URL) pahalı robots denetimi yalnız ucuz süzgeçlerden geçen URL'ye uygulanır.
    const keep = l => {
      if (!onShop(l)) return 0;
      const sc = productUrlScore(l);
      if (!sc) return 0;
      if (!targeted) return allowed(l) ? sc : 0;
      if (urlMatches(l, targets)) return allowed(l) ? 2 : 0;
      if (titles && titleHits.length < MAX_TITLE_SEEDS && titleMatches(l, titles) && allowed(l))
        titleHits.push(l);
      return 0; // hedefli modda eşleşmeyen URL tohum olmaz
    };
    const cursorKey = `targeted-cursor:${shop.id}`;
    let cursors = {};
    if (targeted)
      try {
        cursors = JSON.parse(getState(cursorKey) ?? '{}') || {};
      } catch {
        cursors = {};
      }
    let childLeft = TARGETED_CHILD_MAPS;
    const seen = new Set();
    /** @type {{ url: string, cur?: { key: string, sig: string, idx: number, n: number } }[]} */
    const queue = rankSitemaps([...new Set(robots.sitemaps.filter(onShop))]).map(url => ({ url }));
    const strong = [];
    const weak = [];
    let maps = 0;
    while (
      queue.length &&
      maps < (targeted ? MAX_TARGETED_MAPS : MAX_SITEMAPS) &&
      strong.length < maxDiscovered
    ) {
      const { url: mapUrl, cur } = queue.shift();
      if (seen.has(mapUrl)) continue;
      seen.add(mapUrl);
      const r = await guardedGet(shop, mapUrl, {
        sitemap: true,
        keep,
        want: maxDiscovered - strong.length,
        ...(targeted ? { maxSitemapBytes: MAX_SITEMAP_BYTES_TARGETED } : {}),
      });
      maps++;
      if (stats)
        (stats.maps ||= []).push({
          url: mapUrl,
          result: r.ok ? 'ok' : r.reason,
          ...(r.ok ? { locs: r.locs.length, truncated: r.truncated } : {}),
        });
      // Engel / robots sorunu: devam imleci ilerlemez (alt harita okunmadı), aynı host'a başka istek de atılmaz.
      if (targeted && !r.ok && /^(backoff|robots-unavailable|crawl-delay)/.test(r.reason)) break;
      if (cur) {
        cursors[cur.key] = { sig: cur.sig, pos: (cur.idx + 1) % cur.n };
        setState(cursorKey, JSON.stringify(cursors));
      }
      if (!r.ok) continue;
      if (r.index && !targeted)
        queue.unshift(
          ...rankSitemaps(r.locs.filter(l => onShop(l) && !seen.has(l)))
            .slice(0, MAX_CHILD_SITEMAPS)
            .map(url => ({ url })),
        );
      else if (r.index) {
        const children = rankSitemaps(r.locs.filter(onShop));
        const sig = createHash('sha1')
          .update(mapUrl + '\n' + children.join('\n'))
          .digest('hex')
          .slice(0, 16);
        const c = cursors[mapUrl];
        const pos = c?.sig === sig && c.pos < children.length ? c.pos : 0;
        const take = children.slice(pos, pos + Math.min(TARGETED_CHILD_MAPS, childLeft));
        childLeft -= take.length;
        queue.unshift(
          ...take.map((url, i) => ({ url, cur: { key: mapUrl, sig, idx: pos + i, n: children.length } })),
        );
      } else
        for (const l of r.locs)
          ((targeted ? urlMatches(l, targets) : productUrlScore(l) >= 2) ? strong : weak).push(l);
    }
    // Başka host'taki (www <-> çıplak) ürün URL'leri: o host'un robots.txt'i de denetlenir.
    const matched = [...new Set([...strong, ...(targeted ? [] : weak)])];
    const byTitle = [...new Set(titleHits)].filter(l => !matched.includes(l));
    let urls = matched;
    let tUrls = byTitle;
    for (const host of new Set([...urls, ...tUrls].map(l => new URL(l).host))) {
      if (robotsOf.has(host)) continue;
      const r = await getRobots(new URL(`${u.protocol}//${host}`));
      if (r) robotsOf.set(host, r);
      else {
        urls = urls.filter(l => new URL(l).host !== host);
        tUrls = tUrls.filter(l => new URL(l).host !== host);
      }
    }
    urls = urls.filter(allowed);
    tUrls = tUrls.filter(allowed);
    const insert = db.prepare('INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, ?)');
    let added = 0;
    for (const url of urls.slice(0, maxDiscovered))
      added += Number(insert.run(shop.id, url, targeted ? 'targeted' : 'sitemap').changes);
    for (const url of tUrls.slice(0, MAX_TITLE_SEEDS))
      added += Number(insert.run(shop.id, url, 'targeted-title').changes);
    return added;
  }

  /**
   * Hiç tohumu olmayan taranabilir mağazaların tohumlarını keşfeder (yeni eklenen mağaza/pazar elle admin işi beklemez).
   * Beslemeyle çalışan mağazalar (feedUrl / network) atlanır. Bir mağaza için en erken saatte bir denenir.
   * Mixoutlet atlanır: ürün verisi .json zenginleştirme ve listeleme içe aktarımıyla gelir, runCycle onu taramaz.
   */
  const discoverTried = new Map();
  async function discoverMissing() {
    const shops = db
      .prepare(
        `SELECT * FROM shops sh WHERE active = 1 AND blocked = 0 AND domain != '' AND feedUrl IS NULL AND network IS NULL
           AND NOT EXISTS (SELECT 1 FROM seeds s WHERE s.shopId = sh.id)`,
      )
      .all()
      .filter(s => siteOf(s.domain) !== MIXO_SITE);
    let added = 0;
    for (const shop of shops) {
      if (now() - (discoverTried.get(shop.id) ?? -Infinity) < 3600 * 1000) continue;
      discoverTried.set(shop.id, now());
      try {
        const n = await discoverSeeds(shop);
        log(`discover ${shop.domain}: ${n} seeds`);
        added += n;
      } catch (e) {
        log(`discover ${shop.domain}: ${String(e.message).slice(0, 80)}`);
      }
    }
    return added;
  }

  /**
   * Hedefli keşif: taranabilir rakip mağazaların site haritalarında Mixoutlet parça numarası / EAN'ı geçen URL'ler
   * 'targeted', başlığı benzeyenler 'targeted-title' tohum olarak eklenir ve tarama kuyruğunda öne alınır.
   * Mağaza başına günde bir. Mixoutlet'in kendisi atlanır.
   */
  async function discoverTargeted() {
    const targets = mixoTargets(db);
    if (!targets.size) return 0;
    const titles = buildTitleIndex(db);
    let added = 0;
    const shops = db
      .prepare(
        "SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND domain != '' AND feedUrl IS NULL AND network IS NULL",
      )
      .all()
      .filter(s => siteOf(s.domain) !== MIXO_SITE);
    for (const shop of shops) {
      const key = `targeted:${shop.id}`;
      if (now() - Number(getState(key) ?? 0) < 24 * 3600 * 1000) continue;
      setState(key, now());
      try {
        const n = await discoverSeeds(shop, undefined, { targets, titles });
        log(`targeted ${shop.domain}: ${n} seeds`);
        added += n;
      } catch (e) {
        log(`targeted ${shop.domain}: ${String(e.message).slice(0, 80)}`);
      }
    }
    return added;
  }

  /**
   * Shopify ürün dökümü (/products.json, herkese açık, robots.txt ve hız sınırına tabi). Sayfa sayfa ilerler, ilerleme
   * crawl_state'te tutulur; `pages` bu çağrıda en çok kaç sayfa alınacağı. Varyantın barkodu (barcode) varsa EAN olarak
   * kullanılır; yoksa sku mpn olarak yazılır (marka + mpn eşleşmesi için). Dönüş: { pages, products, done }.
   */
  async function importShopify(shop, { pages = 10 } = {}) {
    const key = `shopify:${shop.id}`;
    let page = Number(getState(key) ?? 1);
    const out = { pages: 0, products: 0, done: false };
    while (out.pages < pages) {
      const r = await guardedGet(shop, `https://${shop.domain}/products.json?limit=250&page=${page}`, {
        json: true,
      });
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
        const base = `https://${shop.domain}/products/${p.handle}`;
        const v = (p.variants || []).find(x => x.available) || p.variants?.[0];
        if (!v) continue;
        const withBarcode = (p.variants || []).filter(x => x.barcode);
        for (const x of withBarcode.length ? withBarcode : [v])
          ingestOffer(
            db,
            shop,
            {
              ean: x.barcode || '',
              mpn: x.sku || '',
              sku: x.sku || '',
              title: p.title,
              brand: p.vendor,
              category: p.product_type,
              image: p.images?.[0]?.src,
              price: x.price,
              inStock: !!x.available,
              url: withBarcode.length > 1 ? `${base}?variant=${x.id}` : base,
            },
            now(),
          );
        db.prepare("INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, 'catalog')").run(
          shop.id,
          base,
        );
        out.products++;
      }
      out.pages++;
      if (list.length < 250) {
        out.done = true;
        page = 1;
        setState(`shopify-done:${shop.id}`, now());
        setState(key, 1);
        break;
      }
      setState(key, ++page);
    }
    log(`shopify ${shop.domain}: ${out.products} products ${out.reason || ''}`);
    return out;
  }

  /**
   * Mağazalar arasında sırayla (round-robin): her mağazanın en öncelikli tohumu önce gelir, böylece ilk eklenen mağaza
   * kuyruğu tek başına doldurmaz. Engelli/pasif mağazaların tohumları atlanır. Host hız sınırı (10 sn) aynen geçerli;
   * eşzamanlı işçiler yalnız FARKLI host'lara paralel gider (limiter aynı host'a asla paralel istek bırakmaz).
   * Öncelik: 'targeted' / 'search' tohumları önce, 'targeted-title' sonra, rastgele (site haritası vb.) en son;
   * rastgele tohumlar mağaza başına turda `randomPerShop` (3) ile sınırlıdır.
   * Mixoutlet'in ürün sayfaları taranmaz (veri .json zenginleştirme + listeleme içe aktarımından gelir; aynı host'a
   * çift yük binmesin): 'catalog' tohumları her turda, tüm tohumlar normal turda atlanır (`skipMixo`: kendi-site turunda da).
   * Tohumlar silinmez.
   */
  async function runCycle({ limit = 50, ownOnly = false, skipMixo = false } = {}) {
    const own = db
      .prepare('SELECT id, domain FROM shops')
      .all()
      .filter(r => ownDomains.some(d => onSite(hostname(r.domain), siteOf(d))))
      .map(r => r.id);
    const mixo = mixoShopIdsOf(db);
    // Kendi sitemiz hızlı aralıkla ayrı turda taranır (ownOnly); normal turda yer kaplamaz.
    const only = ownOnly ? own : null;
    // skipMixo: kendi-site turunda da Mixoutlet atlanır (zamanlayıcı: Mixoutlet verisi yalnız .json zenginleştirme + listeleme).
    const skip = ownOnly ? (skipMixo ? mixo : []) : [...new Set([...own, ...mixo])];
    const seeds = db
      .prepare(
        `WITH due AS (
           SELECT s.*, CASE WHEN s.source IN ('targeted', 'search') THEN 0 WHEN s.source = 'targeted-title' THEN 1 ELSE 2 END AS pr
           FROM seeds s JOIN shops sh ON sh.id = s.shopId
           WHERE sh.active = 1 AND sh.blocked = 0 AND (s.lastCrawledAt IS NULL OR s.lastCrawledAt < ?)
             AND (? IS NULL OR sh.id IN (SELECT value FROM json_each(?)))
             AND sh.id NOT IN (SELECT value FROM json_each(?))
             AND NOT (s.source = 'catalog' AND sh.id IN (SELECT value FROM json_each(?)))
         ), capped AS (
           SELECT d.*, row_number() OVER (
             PARTITION BY d.shopId, d.pr ORDER BY d.lastCrawledAt IS NOT NULL, d.lastCrawledAt, d.id) AS rr
           FROM due d
         ), ranked AS (
           SELECT c.*, row_number() OVER (
             PARTITION BY c.shopId ORDER BY c.pr, c.lastCrawledAt IS NOT NULL, c.lastCrawledAt, c.id) AS rn
           FROM capped c WHERE c.pr < 2 OR c.rr <= ?
         )
         SELECT * FROM ranked ORDER BY rn, shopId LIMIT ?`,
      )
      .all(
        now() - BACKOFF_MS,
        only && '1',
        JSON.stringify(only ?? []),
        JSON.stringify(skip),
        JSON.stringify(mixo),
        randomPerShop,
        limit,
      );
    const totals = { seeds: seeds.length, offer: 0, unmatched: 0, skipped: 0 };
    const queue = [...seeds];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const r = await crawlSeed(s);
        totals.offer += r.offer;
        totals.unmatched += r.unmatched;
        totals.skipped += r.skipped;
      }
    };
    await Promise.all(Array.from({ length: maxConcurrent }, worker));
    return totals;
  }

  /** Arama sonuç sayfasından aynı siteye ait en çok `max` ürün bağlantısı (güçlü ürün işaretliler önce). */
  function searchLinks(html, base, shop, max = 3) {
    const site = siteOf(shop.domain);
    const out = new Map();
    for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
      let x;
      try {
        x = new URL(m[1].replace(/&amp;/g, '&'), base);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(x.protocol) || !onSite(x.host, site)) continue;
      if (x.pathname === base.pathname) continue; // arama sayfasının kendisi / sayfalama
      const score = productUrlScore(x.href);
      if (score > 0 && !out.has(x.href)) out.set(x.href, score);
    }
    return [...out.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([href]) => href);
  }

  /**
   * Ürün düzeyinde hedefleme: mağazanın arama şablonu (lib/stores.mjs `search`, robots izinliyse) ile Mixoutlet'in
   * EAN'lı ürünleri aranır; EAN'ı olmayan ama gerçek (iç kod olmayan) MPN'i olan ürünler marka + MPN ile aranır.
   * Her istek guardedGet'ten geçer (robots, host aralığı, engel/opt-out); robots arama yolunu yasaklıyorsa ya da host
   * engel/hata verirse o mağazada tur biter. Turda mağaza başına en çok `perShop` arama, günde en çok `dailyCap` (sayaç
   * crawl_state 'search-day:<shopId>:<gün>'). Sorulan EAN/MPN anahtarı lookups tablosuna yazılır, 14 gün tekrar sorulmaz.
   * Yanıt ürün sayfasıysa ingestPage ile işlenir (MPN aramasında yalnız MPN'i doğrulanan ürün; doğrulanmazsa teklif
   * yazılmaz); sonuç listesiyse aynı siteden en çok 3 ürün bağlantısı source='search' tohumu olur.
   * Dönüş: { searches, offers, seeds }.
   */
  async function searchTargeted({ perShop = 20, dailyCap = 1000 } = {}) {
    if (!Number.isFinite(perShop)) perShop = 20; // NaN LIMIT'e gidip 'datatype mismatch' fırlatmasın
    if (!Number.isFinite(dailyCap)) dailyCap = 1000;
    const total = { searches: 0, offers: 0, seeds: 0 };
    const mixoShops = db
      .prepare('SELECT id, domain, market FROM shops')
      .all()
      .filter(r => siteOf(r.domain) === MIXO_SITE);
    if (!mixoShops.length) return total;
    const ids = mixoShops.map(r => r.id);
    const q = ids.map(() => '?').join(',');
    const markets = new Set(mixoShops.map(r => r.market));
    const shops = db
      .prepare("SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND domain != ''")
      .all()
      .filter(s => !ids.includes(s.id) && markets.has(s.market));
    const asked = db.prepare('SELECT 1 FROM lookups WHERE shopId = ? AND ean = ? AND checkedAt > ?');
    const markAsked = db.prepare(
      'INSERT INTO lookups (shopId, ean, checkedAt) VALUES (?, ?, ?) ON CONFLICT(shopId, ean) DO UPDATE SET checkedAt = excluded.checkedAt',
    );
    for (const shop of shops) {
      const cfg = storeCfg(shop);
      if (!cfg?.crawl || !cfg.search) continue;
      const dayKey = `search-day:${shop.id}:${dayOf(now())}`;
      let used = Number(getState(dayKey) ?? 0);
      const budget = Math.min(perShop, dailyCap - used);
      if (budget <= 0) continue;
      const since = now() - SEARCH_RECHECK_MS;
      const brands = (cfg.brands ?? []).map(b => b.toLowerCase());
      const hint = col =>
        brands.length ? `(lower(coalesce(${col}, '')) IN (${brands.map(() => '?').join(',')})) DESC,` : '';
      // 1) EAN'lı Mixoutlet ürünleri: marka ipucu önce, sonra yüksek fiyat; bu mağazada teklifi olan ya da son 14 günde sorulan atlanır.
      const eanRows = db
        .prepare(
          `SELECT p.ean FROM offers o JOIN products p ON p.ean = o.ean
           WHERE o.shopId IN (${q})
             AND NOT EXISTS (SELECT 1 FROM lookups l WHERE l.shopId = ? AND l.ean = o.ean AND l.checkedAt > ?)
             AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.shopId = ? AND x.ean = o.ean)
           ORDER BY ${hint('p.brand')} o.price DESC, o.ean LIMIT ?`,
        )
        .all(...ids, shop.id, since, shop.id, ...brands, budget);
      const jobs = eanRows.map(r => ({ key: r.ean, q: r.ean, ean: r.ean }));
      // 2) EAN'sız ama gerçek MPN'li ürünler: marka + MPN. Bütçenin en az dörtte biri buna ayrılır (EAN'lar bitmezse).
      const mpnJobs = [];
      const wantMpn = Math.max(budget - jobs.length, Math.floor(budget / 4));
      if (wantMpn > 0) {
        const rows = db
          .prepare(
            `SELECT u.mpn, u.brand FROM unmatched u
             WHERE u.shopId IN (${q}) AND u.mpn IS NOT NULL AND u.mpn != '' AND (u.rawEan IS NULL OR u.rawEan = '')
               AND u.brand IS NOT NULL AND u.brand != ''
             ORDER BY ${hint('u.brand')} u.price DESC, u.id LIMIT ?`,
          )
          .all(...ids, ...brands, wantMpn * 30);
        const seenKeys = new Set();
        for (const r of rows) {
          if (mpnJobs.length >= wantMpn) break;
          const n = normTok(r.mpn);
          if (isInternalSku(r.mpn) || n.length < 5 || !/\d/.test(n)) continue;
          const key = `mpn:${normBrand(r.brand)}|${n}`;
          if (seenKeys.has(key) || asked.get(shop.id, key, since)) continue;
          seenKeys.add(key);
          mpnJobs.push({ key, q: `${r.brand} ${r.mpn}`, mpn: r.mpn });
        }
      }
      const jobsAll = [...jobs.slice(0, budget - Math.min(mpnJobs.length, wantMpn)), ...mpnJobs].slice(
        0,
        budget,
      );
      // Bazı mağazalar (secomp.de, pieper.de) çıplak alan adını www'ya yönlendirir: ilk yanıttaki nihai host kullanılır,
      // yoksa her arama iki isteğe (301 + gerçek istek) mal olur (deneme 2026-11-18: 82 gereksiz istek).
      let origin = `https://${shop.domain}`;
      for (const job of jobsAll) {
        const url = origin + cfg.search.replace('{q}', encodeURIComponent(job.q));
        setState(dayKey, ++used);
        total.searches++;
        const r = await guardedGet(shop, url);
        if (!r.ok) {
          // Sonuç yok (404 vb.): sorulmuş sayılır. Robots, engel, 5xx, ağ hatası: bu mağazada tur biter.
          if (!/^http-4\d\d$|^content-type$/.test(r.reason)) break;
          markAsked.run(shop.id, job.key, now());
          continue;
        }
        try {
          const fin = new URL(r.finalUrl);
          if (onSite(fin.host, siteOf(shop.domain))) origin = fin.origin;
        } catch {
          // nihai adres okunamazsa mevcut köken kalır
        }
        const products = extractProducts(r.body, { eanFromText: !!cfg.eanFromText });
        if (products.length) {
          const mine = job.mpn && new Set([normTok(job.mpn), ...mpnCandidates(job.mpn).map(normTok)]);
          const accept = job.mpn
            ? p => !!p.mpn && [normTok(p.mpn), ...mpnCandidates(p.mpn).map(normTok)].some(x => mine.has(x))
            : undefined;
          total.offers += ingestPage(shop, r.finalUrl, r.body, { accept }).offer;
        } else {
          const base = new URL(r.finalUrl);
          const ins = db.prepare("INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, 'search')");
          for (const href of searchLinks(r.body, base, shop))
            total.seeds += Number(ins.run(shop.id, href).changes);
        }
        markAsked.run(shop.id, job.key, now());
      }
    }
    log(`search: ${total.searches} searches, ${total.offers} offers, ${total.seeds} seeds`);
    return total;
  }

  return {
    userAgent,
    crawlSeed,
    ingestPage,
    discoverSeeds,
    discoverMissing,
    discoverTargeted,
    searchTargeted,
    importShopify,
    getState,
    runCycle,
    guardedGet,
  };
}

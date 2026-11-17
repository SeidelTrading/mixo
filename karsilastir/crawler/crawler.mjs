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
import { decompress, textChunks } from '../feeds/stream.mjs';
import { isPrivateHostname } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { RateLimiter } from './limiter.mjs';
import { bestOffer, extractProducts } from './jsonld.mjs';
import { isAllowed, parseRobots } from './robots.mjs';

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
/** Bir harita dosyasından en çok bu kadar <loc> okunur (sitemaps.org: dosya başına en çok 50 000). */
const MAX_SITEMAP_LOCS = 50_000;
/** Standart, dürüst Accept değeri: HTML/XML tercih edilir, ama `*` ile başka türler (text/xml vb.) de kabul edilir. */
export const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const MAX_SITEMAPS = 4;
const MAX_CHILD_SITEMAPS = 3;
const MAX_DISCOVERED = 500;
const MAX_TARGETED = 2500;
const MAX_HOPS = 3;
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

/**
 * Hedefli tarama: URL'nin ürün adı kısmı Mixoutlet'in bir parça numarasını (normalize: küçük harf, yalnız harf-rakam,
 * en az 5 karakter) içeriyor mu? Yol parçaları 1-3'lü birleştirilerek denenir ("tk-5240m" -> "tk5240m").
 */
export function urlMatches(url, targets) {
  let path;
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return false;
  }
  const toks = path.split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    let j = '';
    for (let n = 0; n < 3 && i + n < toks.length; n++) {
      j += toks[i + n];
      if (j.length >= 5 && /\d/.test(j) && targets.has(j)) return true;
    }
  }
  return false;
}

/** Mixoutlet'in parça numaraları (mpn / sku) -> hedef kümesi. */
export function mixoTargets(db) {
  const set = new Set();
  const norm = v =>
    String(v ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const add = v => {
    const n = norm(v);
    if (n.length >= 5 && /\d/.test(n)) set.add(n);
  };
  const ids = db
    .prepare(
      "SELECT id FROM shops WHERE market = 'de' AND replace(lower(domain), 'www.', '') = 'mixoutlet.de'",
    )
    .all()
    .map(r => r.id);
  if (!ids.length) return set;
  const q = ids.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT mpn, sku FROM unmatched WHERE shopId IN (${q})`).all(...ids)) {
    add(r.mpn);
    add(r.sku);
  }
  for (const r of db
    .prepare(`SELECT p.mpn FROM products p JOIN offers o ON o.ean = p.ean WHERE o.shopId IN (${q})`)
    .all(...ids))
    add(r.mpn);
  return set;
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
 * Yalnız .xml/.xml.gz adresi içeren urlset dizin sayılır. Dönüş: { index, locs (güçlüler önce), truncated }.
 * @param {AsyncIterable<Uint8Array>} body
 * @param {{ keep?: (loc: string) => number, want?: number }} [opts]
 */
export async function readSitemap(body, { keep = () => 2, want = MAX_SITEMAP_LOCS } = {}) {
  let raw = 0;
  let truncated = false;
  const it = body[Symbol.asyncIterator]();
  /** @type {AsyncIterable<Uint8Array>} */
  const capped = {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (raw >= MAX_SITEMAP_BYTES) {
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
      if (inflated > MAX_SITEMAP_INFLATED) {
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
  maxConcurrent = 2,
  ownDomains = [],
  ownIntervalMs = 2000,
  log = () => {},
}) {
  const userAgent = `${BOT_TOKEN}/${BOT_VERSION} (+${siteUrl}/bot)`;
  const lim = limiter || new RateLimiter({ minIntervalMs: HOST_INTERVAL_MS, maxConcurrent, now });

  const setBackoff = (host, reason) =>
    db
      .prepare(
        'INSERT INTO host_backoff (host, until, reason) VALUES (?, ?, ?) ON CONFLICT(host) DO UPDATE SET until = excluded.until, reason = excluded.reason',
      )
      .run(host, now() + BACKOFF_MS, reason);
  const inBackoff = host => {
    const r = db.prepare('SELECT until FROM host_backoff WHERE host = ?').get(host);
    return !!r && r.until > now();
  };
  const optedOut = host => {
    const h = hostname(host);
    return db
      .prepare('SELECT domain FROM optouts')
      .all()
      .some(r => h === r.domain || h.endsWith('.' + r.domain));
  };

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

  /** Tek HTTP isteği: hız sınırlı, UA'lı, yönlendirme izlemeden, çerezsiz. 403/429/503 -> host 24 saat bekletilir. */
  async function requestOnce(u, { stream = false, maxBytes = MAX_BYTES } = {}) {
    const own = ownDomains.some(d => onSite(u.host, siteOf(d)));
    const res = await lim.run(
      u.host,
      () =>
        fetchImpl(u.href, {
          headers: { 'user-agent': userAgent, accept: ACCEPT },
          redirect: 'manual',
          // Site haritaları büyük ve yavaş üretilebilir: akış okuması dahil 60 sn; sayfalar 15 sn.
          signal: AbortSignal.timeout(stream ? 60_000 : 15_000),
        }),
      own ? ownIntervalMs : undefined,
    );
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
   * @param {{ sitemap?: boolean, keep?: (loc: string) => number, want?: number, json?: boolean }} [opts]
   * @returns {Promise<any>}
   */
  async function guardedGet(shop, rawUrl, { sitemap = false, keep, want, json = false } = {}) {
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
      let r;
      try {
        r = await requestOnce(u, { stream: sitemap, maxBytes: json ? 12 * 1024 * 1024 : MAX_BYTES });
      } catch (e) {
        return { ok: false, reason: 'network-error: ' + String(e.message).slice(0, 80) };
      }
      if (r.backoff) return { ok: false, reason: `backoff-${r.status}` };
      if (r.location) {
        u = new URL(r.location, u);
        continue; // aynı host denetimi skipReason içinde (host-mismatch) yapılır
      }
      if (r.status !== 200) return { ok: false, reason: `http-${r.status}` };
      if (sitemap) {
        const body = r.res.body;
        try {
          if (!/xml|text\/plain|gzip|octet-stream/i.test(r.type))
            return { ok: false, reason: 'content-type' };
          if (!body) return { ok: true, index: false, locs: [], truncated: false, finalUrl: u.href };
          return { ok: true, ...(await readSitemap(body, { keep, want })), finalUrl: u.href };
        } catch (e) {
          return { ok: false, reason: 'sitemap-decode: ' + String(e.message).slice(0, 80) };
        } finally {
          await body?.cancel().catch(() => {}); // erken bırakılan akışın bağlantısı kapatılır
        }
      }
      if (!(json ? /json/i : /html|xml|text\/plain/i).test(r.type))
        return { ok: false, reason: 'content-type' };
      return { ok: true, body: r.body, finalUrl: u.href };
    }
    return { ok: false, reason: 'too-many-redirects' };
  }

  /** Bir tohum sayfayı tarar; schema.org verisi bulunursa ingestOffer ile işler. */
  async function crawlSeed(seed) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(seed.shopId);
    const out = { offer: 0, unmatched: 0, skipped: 0, reason: null };
    if (!shop) return { ...out, reason: 'no-shop' };
    const r = await guardedGet(shop, seed.url);
    if (!r.ok) out.reason = r.reason;
    else {
      const products = extractProducts(r.body);
      if (!products.length) out.reason = 'no-schema-org-product';
      for (const p of products) {
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
              price: o.price,
              currency: o.currency,
              shipping: o.shipping,
              inStock: o.inStock,
              url: seed.url,
            },
            now(),
          )
        ]++;
      }
      // Sayfadan EAN'lı teklif çıktıysa katalogdan gelen EAN'sız kayıt (aynı URL) artık gereksiz: sayım çift olmasın.
      if (out.offer) db.prepare('DELETE FROM unmatched WHERE shopId = ? AND url = ?').run(shop.id, seed.url);
    }
    db.prepare('UPDATE seeds SET lastCrawledAt = ?, lastStatus = ? WHERE id = ?').run(
      now(),
      out.reason || 'ok',
      seed.id,
    );
    log(`crawl ${seed.url}: ${out.reason || 'ok'}`);
    return out;
  }

  /**
   * Tohum keşfi: yalnızca robots.txt'te listelenen site haritaları (en çok 4 harita isteği, dizinden en çok 3 alt harita,
   * 500 URL). Dizinlerde ürün haritaları önce gelir; marka/kategori/blog/sayfa haritaları ve ürün dışı URL'ler atlanır.
   * Haritalar akış olarak okunur; 500 güçlü ürün adayı bulununca okuma durur (dev haritalar belleğe alınmaz).
   * Mağaza sitesi www ile çıplak alan adı ve alt alan adlarını kapsar (örn. sitemap.boyner.com.tr, www -> çıplak).
   * Her harita isteği guardedGet'ten geçer (robots + host hız sınırı + engel/opt-out). Dönüş: eklenen tohum sayısı.
   */
  /** @param {any} shop @param {string} [origin] @param {{ stats?: any, targets?: Set<string> }} [opts] */
  async function discoverSeeds(shop, origin = `https://${shop.domain}`, { stats, targets } = {}) {
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
    const keep = l => {
      if (!onShop(l) || !allowed(l)) return 0;
      const sc = productUrlScore(l);
      return targeted && sc && urlMatches(l, targets) ? 2 : targeted ? Math.min(sc, 1) : sc;
    };
    const seen = new Set();
    const queue = rankSitemaps([...new Set(robots.sitemaps.filter(onShop))]);
    const strong = [];
    const weak = [];
    let maps = 0;
    while (queue.length && maps < (targeted ? 10 : MAX_SITEMAPS) && strong.length < maxDiscovered) {
      const mapUrl = queue.shift();
      if (seen.has(mapUrl)) continue;
      seen.add(mapUrl);
      const r = await guardedGet(shop, mapUrl, { sitemap: true, keep, want: maxDiscovered - strong.length });
      maps++;
      if (stats)
        (stats.maps ||= []).push({
          url: mapUrl,
          result: r.ok ? 'ok' : r.reason,
          ...(r.ok ? { locs: r.locs.length, truncated: r.truncated } : {}),
        });
      if (!r.ok) continue;
      if (r.index)
        queue.unshift(
          ...rankSitemaps(r.locs.filter(l => onShop(l) && !seen.has(l))).slice(
            0,
            targeted ? 8 : MAX_CHILD_SITEMAPS,
          ),
        );
      else
        for (const l of r.locs)
          ((targeted ? urlMatches(l, targets) : productUrlScore(l) >= 2) ? strong : weak).push(l);
    }
    // Başka host'taki (www <-> çıplak) ürün URL'leri: o host'un robots.txt'i de denetlenir.
    let urls = [...new Set([...strong, ...weak])];
    for (const host of new Set(urls.map(l => new URL(l).host))) {
      if (robotsOf.has(host)) continue;
      const r = await getRobots(new URL(`${u.protocol}//${host}`));
      if (r) robotsOf.set(host, r);
      else urls = urls.filter(l => new URL(l).host !== host);
    }
    urls = urls.filter(allowed);
    let added = 0;
    for (const url of urls.slice(0, maxDiscovered))
      added += Number(
        db
          .prepare('INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, ?)')
          .run(shop.id, url, targeted ? 'targeted' : 'sitemap').changes,
      );
    return added;
  }

  /**
   * Hiç tohumu olmayan taranabilir mağazaların tohumlarını keşfeder (yeni eklenen mağaza/pazar elle admin işi beklemez).
   * Beslemeyle çalışan mağazalar (feedUrl / network) atlanır. Bir mağaza için en erken saatte bir denenir.
   */
  const discoverTried = new Map();
  async function discoverMissing() {
    const shops = db
      .prepare(
        `SELECT * FROM shops sh WHERE active = 1 AND blocked = 0 AND domain != '' AND feedUrl IS NULL AND network IS NULL
           AND NOT EXISTS (SELECT 1 FROM seeds s WHERE s.shopId = sh.id)`,
      )
      .all();
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

  const getState = k => db.prepare('SELECT value FROM crawl_state WHERE key = ?').get(k)?.value ?? null;
  const setState = (k, v) =>
    db
      .prepare(
        'INSERT INTO crawl_state (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      )
      .run(k, String(v), now());

  /**
   * Hedefli keşif: taranabilir rakip mağazaların site haritalarında Mixoutlet parça numarası geçen URL'ler 'targeted'
   * tohum olarak eklenir ve tarama kuyruğunda öne alınır. Mağaza başına günde bir. Mixoutlet'in kendisi atlanır.
   */
  async function discoverTargeted() {
    const targets = mixoTargets(db);
    if (!targets.size) return 0;
    let added = 0;
    const shops = db
      .prepare(
        "SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND domain != '' AND feedUrl IS NULL AND network IS NULL",
      )
      .all()
      .filter(s => siteOf(s.domain) !== 'mixoutlet.de');
    for (const shop of shops) {
      const key = `targeted:${shop.id}`;
      if (now() - Number(getState(key) ?? 0) < 24 * 3600 * 1000) continue;
      setState(key, now());
      try {
        const n = await discoverSeeds(shop, undefined, { targets });
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

  /** Zamanı gelen (son tarama > 24 saat) tohumları sırayla tarar. */
  /**
   * Mağazalar arasında sırayla (round-robin): her mağazanın en eski tohumu önce gelir, böylece ilk eklenen mağaza
   * kuyruğu tek başına doldurmaz. Engelli/pasif mağazaların tohumları atlanır. Host hız sınırı (10 sn) aynen geçerli.
   */
  async function runCycle({ limit = 50, ownOnly = false } = {}) {
    const own = db
      .prepare('SELECT id, domain FROM shops')
      .all()
      .filter(r => ownDomains.some(d => onSite(hostname(r.domain), siteOf(d))))
      .map(r => r.id);
    // Kendi sitemiz hızlı aralıkla ayrı turda taranır (ownOnly); normal turda yer kaplamaz.
    const only = ownOnly ? own : null;
    const skip = ownOnly ? [] : own;
    const seeds = db
      .prepare(
        `SELECT * FROM (
           SELECT s.*, row_number() OVER (
             PARTITION BY s.shopId ORDER BY s.lastCrawledAt IS NOT NULL, s.source != 'targeted', s.lastCrawledAt, s.id) AS rn
           FROM seeds s JOIN shops sh ON sh.id = s.shopId
           WHERE sh.active = 1 AND sh.blocked = 0 AND (s.lastCrawledAt IS NULL OR s.lastCrawledAt < ?)
             AND (? IS NULL OR sh.id IN (SELECT value FROM json_each(?)))
             AND sh.id NOT IN (SELECT value FROM json_each(?)))
         ORDER BY rn, shopId LIMIT ?`,
      )
      .all(now() - BACKOFF_MS, only && '1', JSON.stringify(only ?? []), JSON.stringify(skip), limit);
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

  return {
    userAgent,
    crawlSeed,
    discoverSeeds,
    discoverMissing,
    discoverTargeted,
    importShopify,
    getState,
    runCycle,
    guardedGet,
  };
}

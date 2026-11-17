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
 *     Yönlendirmeler yalnızca aynı host içinde izlenir ve her adım yeniden robots/hız denetiminden geçer.
 */
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
const MAX_HOPS = 3;
const hostname = h => h.replace(/:\d+$/, '').toLowerCase();

/** @param {any} o */
export function createCrawler({
  db,
  siteUrl,
  fetchImpl = fetch,
  now = Date.now,
  limiter,
  allowPrivateHosts = false,
  maxConcurrent = 2,
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
    const d = shop.domain.toLowerCase().replace(/:\d+$/, '');
    if (hostname(u.host) !== d && !hostname(u.host).endsWith('.' + d)) return 'host-mismatch';
    if (inBackoff(u.host)) return 'backoff';
    return null;
  }

  /** Tek HTTP isteği: hız sınırlı, UA'lı, yönlendirme izlemeden, çerezsiz. 403/429/503 -> host 24 saat bekletilir. */
  async function requestOnce(u) {
    const res = await lim.run(u.host, () =>
      fetchImpl(u.href, {
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      }),
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
    const body = res.ok ? (await res.text()).slice(0, MAX_BYTES) : (await res.body?.cancel(), '');
    return { status: res.status, body, type };
  }

  /** robots.txt: 24 saat önbellek. Dönüş: ayrıştırılmış robots ya da null (bu turda çekme). */
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
        if (next.host !== u.host) return null;
        target = next;
        continue;
      }
      if (r.status === 200 || r.status === 404 || r.status === 410) {
        const body = r.status === 200 ? r.body : ''; // 404/410: kural yok
        db.prepare(
          'INSERT INTO robots_cache (host, body, fetchedAt) VALUES (?, ?, ?) ON CONFLICT(host) DO UPDATE SET body = excluded.body, fetchedAt = excluded.fetchedAt',
        ).run(u.host, body, now());
        return parseRobots(body);
      }
      return null;
    }
    return null;
  }

  /** Güvenli sayfa çekme: tüm kurallar burada uygulanır. Dönüş: { ok, body, finalUrl } ya da { ok:false, reason }. */
  async function guardedGet(shop, rawUrl) {
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
        r = await requestOnce(u);
      } catch (e) {
        return { ok: false, reason: 'network-error: ' + String(e.message).slice(0, 80) };
      }
      if (r.backoff) return { ok: false, reason: `backoff-${r.status}` };
      if (r.location) {
        u = new URL(r.location, u);
        continue; // aynı host denetimi skipReason içinde (host-mismatch) yapılır
      }
      if (r.status !== 200) return { ok: false, reason: `http-${r.status}` };
      if (!/html|xml|text\/plain/i.test(r.type)) return { ok: false, reason: 'content-type' };
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
    }
    db.prepare('UPDATE seeds SET lastCrawledAt = ?, lastStatus = ? WHERE id = ?').run(
      now(),
      out.reason || 'ok',
      seed.id,
    );
    log(`crawl ${seed.url}: ${out.reason || 'ok'}`);
    return out;
  }

  /** Tohum keşfi: robots.txt'te listelenen site haritaları (en çok 3 alt harita, 500 URL). */
  async function discoverSeeds(shop, origin = `https://${shop.domain}`) {
    const u = new URL(origin);
    const robots = await getRobots(u);
    if (!robots) return 0;
    const queue = robots.sitemaps.filter(s => {
      try {
        return new URL(s).host === u.host;
      } catch {
        return false;
      }
    });
    const urls = [];
    let maps = 0;
    while (queue.length && maps < 4 && urls.length < 500) {
      const r = await guardedGet(shop, queue.shift());
      maps++;
      if (!r.ok) continue;
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m =>
        m[1].replace(/&amp;/g, '&'),
      );
      if (/<sitemapindex/i.test(r.body)) queue.push(...locs.slice(0, 3));
      else urls.push(...locs);
    }
    let added = 0;
    for (const url of urls.slice(0, 500)) {
      let ok = false;
      try {
        ok = new URL(url).host === u.host;
      } catch {
        /* geçersiz loc atlanır */
      }
      if (!ok) continue;
      added += Number(
        db
          .prepare("INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, 'sitemap')")
          .run(shop.id, url).changes,
      );
    }
    return added;
  }

  /** Zamanı gelen (son tarama > 24 saat) tohumları sırayla tarar. */
  async function runCycle({ limit = 50 } = {}) {
    const seeds = db
      .prepare(
        'SELECT * FROM seeds WHERE lastCrawledAt IS NULL OR lastCrawledAt < ? ORDER BY lastCrawledAt IS NOT NULL, lastCrawledAt LIMIT ?',
      )
      .all(now() - BACKOFF_MS, limit);
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

  return { userAgent, crawlSeed, discoverSeeds, runCycle, guardedGet };
}

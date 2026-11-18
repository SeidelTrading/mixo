import { runDueFeeds } from '../feeds/run.mjs';
import { runDueNetworkFeeds } from '../feeds/network.mjs';
import { runLookups } from '../lookup/run.mjs';
import { createMixoEnricher } from '../crawler/mixoEnrich.mjs';
import { promoteUnmatched } from '../lib/ingest.mjs';
import { STORES } from '../lib/stores.mjs';

/** Zamanlayıcı: besleme çalıştırma (15 dk'da bir kontrol), tarayıcı turu ve Mixoutlet zenginleştirme (yalnızca CRAWLER_ENABLED=1). */
export function startScheduler(ctx) {
  const timers = [];
  const opts = { now: ctx.now, allowPrivateHosts: ctx.config.allowPrivateHosts };
  const feeds = () =>
    runDueFeeds(ctx.db, opts)
      .catch(e => console.error('feed', e))
      .then(() => runDueNetworkFeeds(ctx.db, opts))
      .catch(e => console.error('network feed', e));
  timers.push(setInterval(feeds, 15 * 60 * 1000));
  setTimeout(feeds, 5000).unref();
  // Anahtarlı bağlayıcılar (eBay, Amazon, bol, SerpAPI): anahtar yoksa hiçbir şey yapmaz.
  const look = () => runLookups(ctx.db, { now: ctx.now }).catch(e => console.error('lookup', e));
  timers.push(setInterval(look, 30 * 60 * 1000));
  setTimeout(look, 20_000).unref();
  if (ctx.config.crawlerEnabled) {
    // Önceki tur bitmeden yenisi başlamaz (aynı tohum iki kez istenmesin). Tur sırası: tohum keşfi, Mixoutlet fiyat
    // tazeleme (products.json), hedefli keşif, EAN/MPN araması (mağaza başına turda 20), tohum taraması, eşleşmemişleri bağlama.
    // Mixoutlet ürün sayfaları artık runCycle'da taranmaz: verisi yalnız .json zenginleştirme ve products.json ile gelir.
    let running = false;
    const crawl = () => {
      if (running) return;
      running = true;
      const c = ctx.getCrawler();
      // Her adım kendi hata sınırında: biri düşerse (ör. arama) sonrakiler o tur yine çalışır.
      const step = (name, fn) => () =>
        Promise.resolve()
          .then(fn)
          .catch(e => console.error(`crawler ${name}`, e));
      // Mixoutlet dışındaki kendi alan adları (OWN_DOMAINS) hızlı aralıkla ayrı turda taranır; normal turda atlanırlar.
      const otherOwn = ctx.config.ownDomains.some(d => d.toLowerCase().replace(/^www\./, '') !== MIXO_DOMAIN);
      Promise.resolve()
        .then(step('discoverMissing', () => c.discoverMissing()))
        .then(step('listing', () => listingStep(ctx)))
        .then(step('discoverTargeted', () => c.discoverTargeted()))
        .then(step('search', () => c.searchTargeted?.({ perShop: 20, dailyCap: ctx.config.searchDailyCap })))
        .then(step('runCycle', () => c.runCycle({ limit: 400 })))
        .then(
          step('own', () => (otherOwn ? c.runCycle({ limit: 250, ownOnly: true, skipMixo: true }) : null)),
        )
        .then(step('promote', () => promoteUnmatched(ctx.db, ctx.now())))
        .finally(() => (running = false));
    };
    timers.push(setInterval(crawl, 10 * 60 * 1000));
    setTimeout(crawl, 10_000).unref();

    // Mixoutlet zenginleştirme: tarama turundan bağımsız, kendi zamanlayıcısı ve kilidiyle 5 dakikada bir.
    let enriching = false;
    const enrich = async () => {
      if (enriching) return;
      enriching = true;
      try {
        const shop = mixoShop(ctx.db);
        if (!shop) return;
        const e = getEnricher(ctx);
        if (e.seedDue(shop)) await e.seedHandles(shop);
        await e.enrichBatch(shop);
      } catch (err) {
        console.error('mixo enrich', err);
      } finally {
        enriching = false;
      }
    };
    timers.push(setInterval(enrich, 5 * 60 * 1000));
    setTimeout(enrich, 15_000).unref();
  }
  for (const t of timers) t.unref();
  return () => timers.forEach(clearInterval);
}

const MIXO_DOMAIN = 'mixoutlet.de';
const mixoShop = db =>
  db
    .prepare(
      "SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND replace(lower(domain), 'www.', '') = ?",
    )
    .get(MIXO_DOMAIN);

/** Zenginleştirici: istekleri crawler.guardedGet'ten geçirir (robots, host aralığı, engel). Mixoutlet OWN_DOMAINS'teyse hızlı tur (140). */
function getEnricher(ctx) {
  return (ctx.mixoEnricher ??= createMixoEnricher({
    db: ctx.db,
    get: (shop, url, o) => ctx.getCrawler().guardedGet(shop, url, o),
    now: ctx.now,
    log: m => console.log(m),
    ownFast: ctx.config.ownDomains.some(d => d.toLowerCase().replace(/^www\./, '') === MIXO_DOMAIN),
  }));
}

/**
 * Mixoutlet günlük fiyat/stok tazeleme (/products.json, en çok 100 sayfa): tam tur bitince 24 saat bekler, tur başına 20 sayfa.
 * Yalnız lib/stores.mjs'te shopify: true olan mağazalar (Mixoutlet) için; gerçek katalog kaynağı site haritası + .json zenginleştirmedir.
 */
export async function listingStep(ctx) {
  const e = getEnricher(ctx);
  for (const d of STORES.filter(s => s.shopify).map(s => s.domain)) {
    const shop = ctx.db
      .prepare(
        "SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND replace(lower(domain), 'www.', '') = ?",
      )
      .get(d);
    if (!shop) continue;
    const doneAt = Number(e.getState(`shopify-done:${shop.id}`) ?? 0);
    const inProgress = Number(e.getState(`shopify:${shop.id}`) ?? 1) > 1;
    if (!inProgress && ctx.now() - doneAt < 24 * 3600 * 1000) continue;
    await e.importListing(shop, { pages: 20 });
  }
}

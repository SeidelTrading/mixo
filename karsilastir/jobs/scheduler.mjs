import { runDueFeeds } from '../feeds/run.mjs';
import { runDueNetworkFeeds } from '../feeds/network.mjs';
import { STORES } from '../lib/stores.mjs';

/** Zamanlayıcı: besleme çalıştırma (15 dk'da bir kontrol) ve - yalnızca CRAWLER_ENABLED=1 ise - tarayıcı turu. */
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
  if (ctx.config.crawlerEnabled) {
    // Önceki tur bitmeden yenisi başlamaz (aynı tohum iki kez istenmesin). Tur başına 200 tohum, mağazalar arası
    // sırayla: 10 sn/host sınırıyla her mağazaya turda ~15 istek düşer.
    let running = false;
    const crawl = () => {
      if (running) return;
      running = true;
      const c = ctx.getCrawler();
      c.discoverMissing()
        .then(() => shopifyStep(ctx, c))
        .then(() => c.discoverTargeted())
        .then(() => c.runCycle({ limit: 200 }))
        .then(() => (ctx.config.ownDomains.length ? c.runCycle({ limit: 250, ownOnly: true }) : null))
        .catch(e => console.error('crawler', e))
        .finally(() => (running = false));
    };
    timers.push(setInterval(crawl, 10 * 60 * 1000));
    setTimeout(crawl, 10_000).unref();
  }
  for (const t of timers) t.unref();
  return () => timers.forEach(clearInterval);
}

/** Shopify dökümü yapılan mağazalar (lib/stores.mjs shopify: true): tam tur bitince 24 saat bekler, tur başına 20 sayfa. */
async function shopifyStep(ctx, c) {
  const domains = STORES.filter(s => s.shopify).map(s => s.domain);
  for (const d of domains) {
    const shop = ctx.db
      .prepare(
        "SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND replace(lower(domain), 'www.', '') = ?",
      )
      .get(d);
    if (!shop) continue;
    const doneAt = Number(c.getState(`shopify-done:${shop.id}`) ?? 0);
    const inProgress = Number(c.getState(`shopify:${shop.id}`) ?? 1) > 1;
    if (!inProgress && ctx.now() - doneAt < 24 * 3600 * 1000) continue;
    await c.importShopify(shop, { pages: 20 });
  }
}

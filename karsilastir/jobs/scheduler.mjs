import { runDueFeeds } from '../feeds/run.mjs';
import { runDueNetworkFeeds } from '../feeds/network.mjs';

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
      ctx
        .getCrawler()
        .runCycle({ limit: 200 })
        .catch(e => console.error('crawler', e))
        .finally(() => (running = false));
    };
    timers.push(setInterval(crawl, 10 * 60 * 1000));
    setTimeout(crawl, 10_000).unref();
  }
  for (const t of timers) t.unref();
  return () => timers.forEach(clearInterval);
}

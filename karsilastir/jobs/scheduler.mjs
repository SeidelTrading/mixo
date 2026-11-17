import { runDueFeeds } from '../feeds/run.mjs';

/** Zamanlayıcı: besleme çalıştırma (15 dk'da bir kontrol) ve - yalnızca CRAWLER_ENABLED=1 ise - tarayıcı turu. */
export function startScheduler(ctx) {
  const timers = [];
  const feeds = () =>
    runDueFeeds(ctx.db, { now: ctx.now, allowPrivateHosts: ctx.config.allowPrivateHosts }).catch(e =>
      console.error('feed', e),
    );
  timers.push(setInterval(feeds, 15 * 60 * 1000));
  setTimeout(feeds, 5000).unref();
  if (ctx.config.crawlerEnabled) {
    const crawl = () =>
      ctx
        .getCrawler()
        .runCycle()
        .catch(e => console.error('crawler', e));
    timers.push(setInterval(crawl, 10 * 60 * 1000));
    setTimeout(crawl, 10_000).unref();
  }
  for (const t of timers) t.unref();
  return () => timers.forEach(clearInterval);
}

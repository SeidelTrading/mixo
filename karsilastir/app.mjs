import { createServer } from 'node:http';
import { createCrawler } from './crawler/crawler.mjs';
import { openDb } from './db.mjs';
import { createAuth } from './lib/auth.mjs';
import { startScheduler } from './jobs/scheduler.mjs';
import { provisionStores } from './lib/stores.mjs';
import { createHandler } from './routes/handler.mjs';

/** Uygulamayı kurar (dinlemeden). start() dinler; stop() her şeyi kapatır. */
export function createApp(config, { now = Date.now } = {}) {
  const db = openDb(config.dataDir);
  if (config.crawlerEnabled) {
    const r = provisionStores(db);
    if (r.added.length || r.disabled.length) console.log(`stores: added ${r.added}; disabled ${r.disabled}`);
  }
  const auth = createAuth({
    password: config.adminPassword,
    secureCookie: config.siteUrl.startsWith('https:'),
    now,
  });
  const ctx = { config, db, auth, now, crawler: null, getCrawler: () => ctx.crawler };
  ctx.getCrawler = () =>
    (ctx.crawler ??= createCrawler({
      db,
      siteUrl: config.siteUrl,
      now,
      allowPrivateHosts: config.allowPrivateHosts,
      log: m => console.log(m),
    }));
  const server = createServer(createHandler(ctx));
  let stopScheduler = () => {};
  return {
    ctx,
    server,
    start: () =>
      new Promise(resolve =>
        server.listen(config.port, config.host, () => {
          const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
          if (!config.siteUrlFromEnv) config.siteUrl = `http://localhost:${port}`;
          if (config.scheduler) stopScheduler = startScheduler(ctx);
          resolve(port);
        }),
      ),
    stop: () =>
      new Promise(resolve => {
        stopScheduler();
        server.closeAllConnections();
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

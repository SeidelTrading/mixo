import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Pazarlar: yol öneki -> dil, para birimi, yerel biçim. */
export const MARKETS = {
  tr: { id: 'tr', lang: 'tr', locale: 'tr-TR', currency: 'TRY', name: 'Türkiye' },
  de: { id: 'de', lang: 'de', locale: 'de-DE', currency: 'EUR', name: 'Deutschland' },
  nl: { id: 'nl', lang: 'nl', locale: 'nl-NL', currency: 'EUR', name: 'Nederland' },
};
export const MARKET_IDS = Object.keys(MARKETS);
export const isMarket = m => Object.hasOwn(MARKETS, m);

/** Çevre değişkenlerinden ayar okur. siteUrl PORT=0 ise dinlemeden sonra server.mjs tarafından düzeltilir. */
export function loadConfig(env = process.env) {
  const port = env.PORT === undefined ? 3100 : Number(env.PORT);
  return {
    dataDir: env.DATA_DIR || join(ROOT, 'data'),
    port,
    host: env.HOST || '127.0.0.1',
    siteUrl: (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    siteUrlFromEnv: !!env.SITE_URL,
    adminPassword: env.ADMIN_PASSWORD || '',
    crawlerEnabled: env.CRAWLER_ENABLED === '1',
    scheduler: env.SCHEDULER !== '0',
    offerMaxAgeDays: Number(env.OFFER_MAX_AGE_DAYS || 30),
    allowPrivateHosts: env.ALLOW_PRIVATE_HOSTS === '1',
    ownDomains: (env.OWN_DOMAINS || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean),
    ownIntervalMs: Number(env.OWN_INTERVAL_MS || 2000),
    mixoCatalogTotal: Number(env.MIXO_CATALOG_TOTAL || 44862),
  };
}

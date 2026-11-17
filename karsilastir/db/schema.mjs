export const SCHEMA_VERSION = 2;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  ean TEXT PRIMARY KEY, title TEXT NOT NULL, brand TEXT, category TEXT, image TEXT, createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL, name TEXT NOT NULL, domain TEXT NOT NULL,
  shippingDefault REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  feedUrl TEXT, feedFormat TEXT, feedMapping TEXT, feedIntervalHours INTEGER NOT NULL DEFAULT 24,
  lastFeedAt INTEGER, lastFeedResult TEXT
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopId INTEGER NOT NULL REFERENCES shops(id), ean TEXT NOT NULL REFERENCES products(ean),
  price REAL NOT NULL, currency TEXT NOT NULL, shipping REAL NOT NULL DEFAULT 0,
  url TEXT NOT NULL, inStock INTEGER NOT NULL DEFAULT 1, seenAt INTEGER NOT NULL,
  UNIQUE (shopId, ean)
);
CREATE INDEX IF NOT EXISTS offers_ean ON offers(ean);
CREATE TABLE IF NOT EXISTS price_history (
  ean TEXT NOT NULL, market TEXT NOT NULL, day TEXT NOT NULL, minPrice REAL NOT NULL,
  PRIMARY KEY (ean, market, day)
);
CREATE TABLE IF NOT EXISTS unmatched (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopId INTEGER NOT NULL REFERENCES shops(id), title TEXT, rawEan TEXT,
  price REAL NOT NULL, currency TEXT NOT NULL, shipping REAL NOT NULL DEFAULT 0,
  url TEXT NOT NULL, inStock INTEGER NOT NULL DEFAULT 1, seenAt INTEGER NOT NULL,
  brand TEXT, category TEXT, image TEXT,
  UNIQUE (shopId, url)
);
CREATE TABLE IF NOT EXISTS clicks (
  day TEXT NOT NULL, offerId INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, offerId)
);
CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopId INTEGER NOT NULL REFERENCES shops(id), url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'admin', lastCrawledAt INTEGER, lastStatus TEXT
);
CREATE TABLE IF NOT EXISTS optouts (domain TEXT PRIMARY KEY, addedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS host_backoff (host TEXT PRIMARY KEY, until INTEGER NOT NULL, reason TEXT);
CREATE TABLE IF NOT EXISTS robots_cache (host TEXT PRIMARY KEY, body TEXT NOT NULL, fetchedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS network_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, format TEXT,
  secretEnv TEXT, secret TEXT, market TEXT, mapping TEXT,
  rowLimit INTEGER NOT NULL DEFAULT 500000, intervalHours INTEGER NOT NULL DEFAULT 24,
  active INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL, lastRunAt INTEGER, lastResult TEXT
);
`;

/**
 * Sürüm 1 -> 2: CREATE TABLE IF NOT EXISTS mevcut tablolara sütun eklemez; eksik sütunlar burada eklenir.
 * offers.deepLink / unmatched.deepLink: affiliate yönlendirme bağlantısı (/go bunu kullanır).
 * shops.network + networkMerchantId: ağ beslemesinden otomatik açılan mağazanın kimliği (ağ, ağdaki mağaza no, pazar).
 */
export function migrate(db) {
  const cols = t => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
  const add = (t, c, def) => {
    if (!cols(t).has(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
  };
  add('offers', 'deepLink', 'TEXT');
  add('unmatched', 'deepLink', 'TEXT');
  add('shops', 'network', 'TEXT');
  add('shops', 'networkMerchantId', 'TEXT');
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS shops_network ON shops(network, networkMerchantId, market) WHERE network IS NOT NULL',
  );
}

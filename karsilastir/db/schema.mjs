import { mpnKey } from '../lib/ingest.mjs';
import { extractMpn, isInternalSku } from '../lib/mpn.mjs';

export const SCHEMA_VERSION = 4;

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
CREATE TABLE IF NOT EXISTS lookups (shopId INTEGER NOT NULL, ean TEXT NOT NULL, checkedAt INTEGER NOT NULL, PRIMARY KEY (shopId, ean));
CREATE TABLE IF NOT EXISTS crawl_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mixo_enrich (
  handle TEXT PRIMARY KEY, shopId INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 1, price REAL,
  checkedAt INTEGER, status TEXT, ean TEXT
);
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
 * Sürüm 2 -> 3: üretici parça numarası (schema.org mpn). products.mpn ham değer, products.mpnKey normalize
 * "marka|mpn" anahtarı (lib/ingest.mjs mpnKey); EAN'sız teklif yalnızca bu anahtar TEK ürüne denk gelirse eşleşir.
 * unmatched.mpn / unmatched.sku: ham tanımlayıcılar (sku yalnızca kayıt için, eşleştirmede kullanılmaz).
 * Sürüm 3 -> 4: unmatched.mpnKey (+ indeks): eşleşmeyen satırlar arası marka+mpn eşleşmesi ve promoteUnmatched için.
 * mixo_enrich tablosu (Mixoutlet ürün .json zenginleştirme kuyruğu: crawler/mixoEnrich.mjs) SCHEMA içinde açılır.
 * Anahtar normalizasyonu değiştiği (eğik çizgi/nokta/alt çizgi, marka takma adları, en az 5 karakter ve bir rakam, iç kod
 * yasağı) için tüm products.mpnKey ve unmatched.mpnKey bir kereye mahsus yeniden hesaplanır; Mixoutlet iç kodları
 * (BA-, arp-, OT-, UHREN1-) mpn olarak temizlenir (başlıktan gerçek MPN çıkarılabiliyorsa o yazılır).
 */
export function migrate(db) {
  const cols = t =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .map(c => c.name),
    );
  const add = (t, c, def) => {
    if (!cols(t).has(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
  };
  add('offers', 'deepLink', 'TEXT');
  add('unmatched', 'deepLink', 'TEXT');
  add('shops', 'network', 'TEXT');
  add('shops', 'networkMerchantId', 'TEXT');
  add('products', 'mpn', 'TEXT');
  add('products', 'mpnKey', 'TEXT');
  add('unmatched', 'mpn', 'TEXT');
  add('unmatched', 'sku', 'TEXT');
  add('unmatched', 'mpnKey', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS products_mpnKey ON products(mpnKey) WHERE mpnKey IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS unmatched_mpnKey ON unmatched(mpnKey) WHERE mpnKey IS NOT NULL');
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS shops_network ON shops(network, networkMerchantId, market) WHERE network IS NOT NULL',
  );
  if (Number(db.prepare('PRAGMA user_version').get().user_version) < 4) rekey(db);
}

/** Sürüm 4: anahtarları yeni normalizasyonla yeniden hesaplar, iç kodları temizler (tek işlemde). */
function rekey(db) {
  db.exec('BEGIN');
  try {
    const upProduct = db.prepare('UPDATE products SET mpn = ?, mpnKey = ? WHERE ean = ?');
    for (const r of db.prepare('SELECT ean, brand, mpn FROM products WHERE mpn IS NOT NULL').all()) {
      const mpn = isInternalSku(r.mpn) ? null : r.mpn;
      upProduct.run(mpn, mpnKey(r.brand, mpn), r.ean);
    }
    db.prepare('UPDATE products SET mpnKey = NULL WHERE mpn IS NULL AND mpnKey IS NOT NULL').run();
    const upU = db.prepare('UPDATE unmatched SET mpn = ?, mpnKey = ? WHERE id = ?');
    for (const r of db.prepare('SELECT id, title, brand, mpn, sku, rawEan FROM unmatched').all()) {
      let mpn = r.mpn;
      if (mpn && isInternalSku(mpn))
        mpn = extractMpn({ title: r.title, brand: r.brand, sku: r.sku || r.mpn, ean: r.rawEan });
      const key = mpnKey(r.brand, mpn);
      if (mpn !== r.mpn || key !== null || r.mpn) upU.run(mpn, key, r.id);
    }
    db.exec('PRAGMA user_version = 4');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

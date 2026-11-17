// Şema sürümü 1 (PRAGMA user_version). Sonraki sürümler ayrı geçiş betikleridir (SCHEMA_V2 ...); db.mjs sırayla uygular.
export const SCHEMA = `
CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE orders (id TEXT PRIMARY KEY, t INTEGER NOT NULL, status TEXT NOT NULL, email TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX orders_t ON orders(t);
CREATE TABLE events (n INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX events_t ON events(t);
CREATE TABLE changes (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, t INTEGER NOT NULL, by TEXT NOT NULL, user TEXT, summary TEXT NOT NULL, undo TEXT, undone INTEGER NOT NULL DEFAULT 0);
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL, pw TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, pw_changed INTEGER NOT NULL);
CREATE TABLE sessions (sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, exp INTEGER NOT NULL, seen INTEGER NOT NULL);
CREATE TABLE logins (n INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, ip TEXT, username TEXT, ok INTEGER NOT NULL);
CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, run_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5, last_error TEXT, created INTEGER NOT NULL, done_at INTEGER);
CREATE INDEX jobs_due ON jobs(status, run_at);
`;

// Sürüm 2: ürün havuzu. v1'den geçişte yalnız yeni tablolar eklenir, mevcut veriye dokunulmaz.
//  pool      kanonik ürün kartı (gerçek ürün başına bir kayıt)
//  pool_ean  ürünün EAN'ları; market '*' = her pazar yeri, aksi halde yalnız o pazar yeri için geçerli EAN
//  pool_src  her kaynak kaydının (wawi, amazon, idealo...) bağlandığı kanonik ürün; birleştirmeyi geri alınabilir kılan kayıt
export const SCHEMA_V2 = `
CREATE TABLE pool (id TEXT PRIMARY KEY, title TEXT NOT NULL, vendor TEXT NOT NULL DEFAULT '', mpn TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, updated INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE pool_ean (ean TEXT NOT NULL, pool_id TEXT NOT NULL, market TEXT NOT NULL DEFAULT '*', added INTEGER NOT NULL, PRIMARY KEY (ean, market));
CREATE INDEX pool_ean_pool ON pool_ean(pool_id);
CREATE TABLE pool_src (src TEXT NOT NULL, ref TEXT NOT NULL, pool_id TEXT NOT NULL, t INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (src, ref));
CREATE INDEX pool_src_pool ON pool_src(pool_id);
`;

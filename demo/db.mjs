// Kalıcı veri katmanı: SQLite (Node'un yerleşik node:sqlite modülü; ek bağımlılık yok, Node >= 22.13 gerekir).
// Sunucu veriyi bellekte tutmayı sürdürür; bu modül yalnız kalıcılığı, iş kuyruğunu ve yedeği sağlar.
// Komut satırı:  node db.mjs verify <yedek.db>            yedeği doğrular (bütünlük + tablo sayıları)
//                node db.mjs restore <yedek.db> <DATA_DIR> yedeği geri yükler (ÖNCE SUNUCUYU DURDURUN)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_NAME = 'mixo.db';
const TABLES = ['kv', 'orders', 'events', 'changes', 'sessions', 'users', 'logins', 'jobs'];
const SCHEMA = `
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
const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function openStore(dataDir, { log = console.log } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, DB_NAME), db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  if (db.prepare('PRAGMA user_version').get().user_version < 1) tx(() => db.exec(SCHEMA + 'PRAGMA user_version=1;'));
  const cache = new Map(), q = sql => cache.get(sql) || cache.set(sql, db.prepare(sql)).get(sql);

  /* belgeler: ayarlar, pazarlama ve Instagram durumu tek JSON belgesi olarak saklanır */
  const doc = (key, fallback) => { const r = q('SELECT value FROM kv WHERE key=?').get(key); if (!r) return fallback; const v = parse(r.value, undefined); if (v === undefined) { log(`UYARI: kv/${key} okunamadı; varsayılanla devam ediliyor.`); return fallback; } return v; };
  const saveDoc = (key, obj) => { q('INSERT INTO kv(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated').run(key, JSON.stringify(obj), Date.now()); };

  /* siparişler */
  const allOrders = () => q('SELECT data FROM orders ORDER BY t, rowid').all().map(r => parse(r.data, null)).filter(isObj);
  const putOrder = o => { q('INSERT INTO orders(id,t,status,email,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, email=excluded.email, data=excluded.data').run(o.id, o.t, o.status, o.customer?.email || '', JSON.stringify(o)); };

  /* değişiklik günlüğü */
  const allChanges = () => q('SELECT id,t,by,user,summary,undo,undone FROM changes ORDER BY n').all().map(r => ({ id: r.id, t: r.t, by: r.by, ...(r.user ? { user: r.user } : {}), summary: r.summary, undo: r.undo ? parse(r.undo, null) : null, undone: !!r.undone }));
  const addChange = c => { q('INSERT INTO changes(id,t,by,user,summary,undo,undone) VALUES(?,?,?,?,?,?,?)').run(c.id, c.t, String(c.by), c.user || null, String(c.summary), c.undo ? JSON.stringify(c.undo) : null, c.undone ? 1 : 0); };
  const setUndone = id => { q('UPDATE changes SET undone=1 WHERE id=?').run(id); };

  /* ziyaretçi olayları */
  const allEvents = () => q('SELECT data FROM events ORDER BY n').all().map(r => parse(r.data, null)).filter(isObj);
  const addEvents = list => { if (list.length) tx(() => { const s = q('INSERT INTO events(t,data) VALUES(?,?)'); for (const e of list) s.run(e.t, JSON.stringify(e)); }); };
  // from'dan eski olanlar ve max üstündeki en eski kayıtlar silinir; silinen sayı döner.
  const pruneEvents = (from, max) => tx(() => { let n = Number(q('DELETE FROM events WHERE t < ?').run(from).changes);
    const c = q('SELECT COUNT(*) c FROM events').get().c; if (c > max) n += Number(q('DELETE FROM events WHERE n IN (SELECT n FROM events ORDER BY n LIMIT ?)').run(c - max).changes); return n; });

  /* kullanıcılar, oturumlar, giriş kaydı */
  const users = {
    all: () => q('SELECT id,username,role,disabled,created,pw_changed FROM users ORDER BY id').all(),
    byName: name => q('SELECT * FROM users WHERE username=?').get(name),
    byId: id => q('SELECT * FROM users WHERE id=?').get(id),
    add: (username, role, pw) => { const now = Date.now(); return Number(q('INSERT INTO users(username,role,pw,created,pw_changed) VALUES(?,?,?,?,?)').run(username, role, pw, now, now).lastInsertRowid); },
    setPw: (id, pw) => { q('UPDATE users SET pw=?, pw_changed=? WHERE id=?').run(pw, Date.now(), id); },
    setRole: (id, role) => { q('UPDATE users SET role=? WHERE id=?').run(role, id); },
    setDisabled: (id, d) => { q('UPDATE users SET disabled=? WHERE id=?').run(d ? 1 : 0, id); },
    activeAdmins: () => q("SELECT COUNT(*) c FROM users WHERE role='yonetici' AND disabled=0").get().c,
  };
  const sessions = {
    put: (sid, userId, exp) => { q('INSERT INTO sessions(sid,user_id,exp,seen) VALUES(?,?,?,?)').run(sid, userId, exp, Date.now()); },
    get: sid => q('SELECT sid,user_id,exp,seen FROM sessions WHERE sid=?').get(sid),
    touch: sid => { q('UPDATE sessions SET seen=? WHERE sid=?').run(Date.now(), sid); },
    del: sid => { q('DELETE FROM sessions WHERE sid=?').run(sid); },
    delUser: userId => Number(q('DELETE FROM sessions WHERE user_id=?').run(userId).changes),
    purge: idleMs => { const now = Date.now(); q('DELETE FROM sessions WHERE exp < ? OR seen < ?').run(now, now - idleMs); },
  };
  const logins = {
    add: (ip, username, ok) => { q('INSERT INTO logins(t,ip,username,ok) VALUES(?,?,?,?)').run(Date.now(), String(ip || '').slice(0, 64), String(username || '').slice(0, 40), ok ? 1 : 0); },
    recent: (limit = 50) => q('SELECT t,ip,username,ok FROM logins ORDER BY n DESC LIMIT ?').all(limit).map(r => ({ ...r, ok: !!r.ok })),
    prune: days => { q('DELETE FROM logins WHERE t < ?').run(Date.now() - days * 864e5); },
  };

  /* iş kuyruğu: kalıcıdır; sunucu yeniden başlasa da bekleyen işler sürer */
  const jobs = {
    // unique: aynı türde bekleyen/çalışan iş varsa yenisi eklenmez (yinelenen işlerin çoğalmaması için)
    enqueue: (type, payload = {}, { runAt = Date.now(), maxAttempts = 5, unique = false } = {}) => {
      if (unique && q("SELECT 1 x FROM jobs WHERE type=? AND status IN ('queued','running') LIMIT 1").get(type)) return null;
      return Number(q("INSERT INTO jobs(type,payload,status,run_at,max_attempts,created) VALUES(?,?,'queued',?,?,?)").run(type, JSON.stringify(payload), runAt, maxAttempts, Date.now()).lastInsertRowid); },
    claim: (now = Date.now()) => tx(() => { const j = q("SELECT * FROM jobs WHERE status='queued' AND run_at<=? ORDER BY run_at, id LIMIT 1").get(now); if (!j) return null;
      q("UPDATE jobs SET status='running', attempts=attempts+1 WHERE id=?").run(j.id); return { ...j, attempts: j.attempts + 1, payload: parse(j.payload, {}) }; }),
    done: id => { q("UPDATE jobs SET status='done', done_at=?, last_error=NULL WHERE id=?").run(Date.now(), id); },
    // retryAt verilirse iş yeniden sıraya girer; verilmezse 'failed' olarak kalır
    fail: (id, err, retryAt) => { q('UPDATE jobs SET status=?, run_at=COALESCE(?,run_at), last_error=?, done_at=? WHERE id=?').run(retryAt ? 'queued' : 'failed', retryAt ?? null, String(err).slice(0, 300), retryAt ? null : Date.now(), id); },
    recover: () => Number(q("UPDATE jobs SET status='queued' WHERE status='running'").run().changes),
    list: (limit = 60) => q('SELECT id,type,status,run_at,attempts,max_attempts,last_error,created,done_at FROM jobs ORDER BY id DESC LIMIT ?').all(limit),
    prune: days => { q("DELETE FROM jobs WHERE status IN ('done','failed') AND done_at < ?").run(Date.now() - days * 864e5); },
  };

  /* yedek: VACUUM INTO tutarlı, tek dosyalık bir kopya üretir (sunucu çalışırken alınabilir) */
  const backupDir = path.join(dataDir, 'backups');
  const listBackups = () => fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => /^mixo-\d{8}-\d{6}\.db$/.test(f)).sort().reverse().map(f => { const st = fs.statSync(path.join(backupDir, f)); return { name: f, size: st.size, t: Math.round(st.mtimeMs) }; }) : [];
  const backup = (keep = 14) => { fs.mkdirSync(backupDir, { recursive: true });
    const d = new Date(), p2 = n => String(n).padStart(2, '0'), name = `mixo-${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.db`, dest = path.join(backupDir, name);
    if (fs.existsSync(dest)) fs.rmSync(dest); db.prepare('VACUUM INTO ?').run(dest);
    const v = verifyFile(dest); if (!v.ok) { fs.rmSync(dest, { force: true }); throw new Error('yedek doğrulanamadı: ' + v.integrity); }
    for (const old of listBackups().slice(Math.max(1, keep))) fs.rmSync(path.join(backupDir, old.name), { force: true });
    return { name, size: fs.statSync(dest).size, counts: v.counts }; };

  /* eski JSON dosyalarından bir kerelik içe aktarma */
  function importLegacy() {
    if (doc('legacy_import', null)) return null;
    const f = n => path.join(dataDir, n), has = n => fs.existsSync(f(n)), names = ['settings.json', 'marketing.json', 'instagram.json', 'orders.json', 'changes.jsonl', 'events.jsonl', 'sessions.json'].filter(has);
    if (!names.length) { saveDoc('legacy_import', { t: Date.now(), files: [] }); return null; }
    const readJson = n => parse(fs.readFileSync(f(n), 'utf8'), undefined), lines = n => fs.readFileSync(f(n), 'utf8').split('\n').filter(Boolean).map(l => parse(l, null)).filter(isObj), out = {};
    tx(() => {
      for (const k of ['settings', 'marketing', 'instagram']) if (has(k + '.json')) { const v = readJson(k + '.json'); if (isObj(v)) { saveDoc(k, v); out[k] = 1; } }
      if (has('orders.json')) { const v = readJson('orders.json'); out.orders = 0; if (Array.isArray(v)) for (const o of v) if (isObj(o) && o.id && isObj(o.customer)) { putOrder(o); out.orders++; } }
      if (has('changes.jsonl')) { out.changes = 0; const seen = new Set(); for (const c of lines('changes.jsonl')) if (c.id && !seen.has(c.id)) { seen.add(c.id); addChange({ ...c, t: Number(c.t) || Date.now(), summary: c.summary ?? '' }); out.changes++; } }
      if (has('events.jsonl')) { const s = q('INSERT INTO events(t,data) VALUES(?,?)'); out.events = 0; for (const e of lines('events.jsonl')) if (Number.isFinite(e.t)) { s.run(e.t, JSON.stringify(e)); out.events++; } }
      saveDoc('legacy_import', { t: Date.now(), files: names, counts: out });
    });
    for (const n of names) fs.renameSync(f(n), f(n) + '.tasindi');     // eski dosyalar silinmez; bir sonraki açılışta yeniden aktarılmaz
    return out;
  }
  const counts = () => Object.fromEntries(TABLES.map(t => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
  return { file, doc, saveDoc, allOrders, putOrder, allChanges, addChange, setUndone, allEvents, addEvents, pruneEvents, users, sessions, logins, jobs, backup, listBackups, backupDir, importLegacy, counts, tx, close: () => db.close() };
}

// Bir veritabanı dosyasını (yedek) doğrular: SQLite bütünlük denetimi + tablo sayıları. Dosyayı değiştirmez.
export function verifyFile(file) {
  let db; try { db = new DatabaseSync(file, { readOnly: true }); const integrity = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]).join('; ');
    const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)), missing = TABLES.filter(t => !have.has(t));
    const counts = Object.fromEntries(TABLES.filter(t => have.has(t)).map(t => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
    return { ok: integrity === 'ok' && !missing.length, integrity: missing.length ? `eksik tablo: ${missing.join(', ')}` : integrity, counts };
  } catch (e) { return { ok: false, integrity: e.message, counts: {} }; } finally { try { db?.close(); } catch {} }
}

// Geri yükleme: yedek doğrulanır, mevcut veritabanı .onceki-<zaman> adıyla kenara alınır, yedek yerine kopyalanır.
export function restoreFile(src, dataDir) {
  const v = verifyFile(src); if (!v.ok) throw new Error('Yedek geçersiz: ' + v.integrity);
  const dest = path.join(dataDir, DB_NAME), tag = '.onceki-' + Date.now();
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(dest + ext)) fs.renameSync(dest + ext, dest + tag + ext);
  fs.copyFileSync(src, dest); return { restored: dest, previous: fs.existsSync(dest + tag) ? dest + tag : null, counts: v.counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'verify' && a) { const v = verifyFile(a); console.log(JSON.stringify(v, null, 1)); process.exit(v.ok ? 0 : 1); }
  else if (cmd === 'restore' && a && b) { try { console.log(JSON.stringify(restoreFile(a, b), null, 1)); } catch (e) { console.error(e.message); process.exit(1); } }
  else { console.error('Kullanım: node db.mjs verify <yedek.db> | node db.mjs restore <yedek.db> <DATA_DIR>   (geri yüklemeden önce sunucuyu durdurun)'); process.exit(2); }
}

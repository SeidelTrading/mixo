// Kalıcı veri katmanı: SQLite (Node'un yerleşik node:sqlite modülü; ek bağımlılık yok, Node >= 22.13 gerekir).
// Sunucu veriyi bellekte tutmayı sürdürür; bu modül yalnız kalıcılığı, iş kuyruğunu ve yedeği sağlar.
// Komut satırı:  node db.mjs verify <yedek.db>            yedeği doğrular (bütünlük + tablo sayıları)
//                node db.mjs restore <yedek.db> <DATA_DIR> yedeği geri yükler (ÖNCE SUNUCUYU DURDURUN)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_NAME, TABLES } from './db/util.mjs';
import { SCHEMA, SCHEMA_V2, SCHEMA_V3 } from './db/schema.mjs';
import { restoreFile, verifyFile } from './db/verify.mjs';
import { makeDocuments } from './db/documents.mjs';
import { makeRecords } from './db/records.mjs';
import { makePool } from './db/pool.mjs';
import { makeRecs } from './db/recs.mjs';
import { makeAccounts } from './db/accounts.mjs';
import { makeJobs } from './db/jobs.mjs';
import { makeBackup } from './db/backup.mjs';
import { makeLegacy } from './db/legacy.mjs';

export { DB_NAME, restoreFile, verifyFile };

export function openStore(dataDir, { log = console.log } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, DB_NAME),
    db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  // Müşteri verisi ve parola özetleri içerir: yalnız sahibi okuyabilsin.
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(file + ext)) fs.chmodSync(file + ext, 0o600);
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  // Şema geçişleri sırayla uygulanır; v1 veritabanı v2'ye yükseltilirken yalnız yeni tablolar eklenir.
  const version = () => Number(db.prepare('PRAGMA user_version').get().user_version);
  if (version() < 1) tx(() => db.exec(SCHEMA + 'PRAGMA user_version=1;'));
  if (version() < 2) tx(() => db.exec(SCHEMA_V2 + 'PRAGMA user_version=2;'));
  if (version() < 3) tx(() => db.exec(SCHEMA_V3 + 'PRAGMA user_version=3;'));
  const cache = new Map(),
    q = sql => cache.get(sql) || cache.set(sql, db.prepare(sql)).get(sql);
  const { doc, saveDoc, docSizes } = makeDocuments({ q, log });
  const records = makeRecords({ q, tx });
  const pool = makePool({ q });
  const recs = makeRecs({ q, tx });
  const { users, sessions, logins } = makeAccounts({ q });
  const { jobs } = makeJobs({ q, tx });
  const { backupDir, listBackups, backup } = makeBackup({ db, dataDir });
  const { importLegacy } = makeLegacy({
    q,
    tx,
    dataDir,
    doc,
    saveDoc,
    putOrder: records.putOrder,
    addChange: records.addChange,
  });
  const counts = () =>
    Object.fromEntries(TABLES.map(t => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
  return {
    file,
    doc,
    saveDoc,
    docSizes,
    ...records,
    users,
    sessions,
    logins,
    jobs,
    pool,
    recs,
    backup,
    listBackups,
    backupDir,
    importLegacy,
    counts,
    tx,
    close: () => db.close(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'verify' && a) {
    const v = verifyFile(a);
    console.log(JSON.stringify(v, null, 1));
    process.exit(v.ok ? 0 : 1);
  } else if (cmd === 'restore' && a && b) {
    try {
      console.log(JSON.stringify(restoreFile(a, b), null, 1));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else {
    console.error(
      'Kullanım: node db.mjs verify <yedek.db> | node db.mjs restore <yedek.db> <DATA_DIR>   (geri yüklemeden önce sunucuyu durdurun)',
    );
    process.exit(2);
  }
}

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DB_NAME, TABLES } from './util.mjs';

// Bir veritabanı dosyasını (yedek) doğrular: SQLite bütünlük denetimi + tablo sayıları. Dosyayı değiştirmez.
export function verifyFile(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const integrity = db
      .prepare('PRAGMA integrity_check')
      .all()
      .map(r => Object.values(r)[0])
      .join('; ');
    const have = new Set(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map(r => r.name),
      ),
      missing = TABLES.filter(t => !have.has(t));
    const counts = Object.fromEntries(
      TABLES.filter(t => have.has(t)).map(t => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]),
    );
    return {
      ok: integrity === 'ok' && !missing.length,
      integrity: missing.length ? `eksik tablo: ${missing.join(', ')}` : integrity,
      counts,
    };
  } catch (e) {
    return { ok: false, integrity: e.message, counts: {} };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}
// Geri yükleme: yedek doğrulanır, mevcut veritabanı .onceki-<zaman> adıyla kenara alınır, yedek yerine kopyalanır.
export function restoreFile(src, dataDir) {
  const v = verifyFile(src);
  if (!v.ok) throw new Error('Yedek geçersiz: ' + v.integrity);
  const dest = path.join(dataDir, DB_NAME),
    tag = '.onceki-' + Date.now();
  for (const ext of ['', '-wal', '-shm'])
    if (fs.existsSync(dest + ext)) fs.renameSync(dest + ext, dest + tag + ext);
  fs.copyFileSync(src, dest);
  return { restored: dest, previous: fs.existsSync(dest + tag) ? dest + tag : null, counts: v.counts };
}

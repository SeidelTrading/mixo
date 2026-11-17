import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA, SCHEMA_VERSION, migrate } from './db/schema.mjs';

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'karsilastir.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  // SQLite lower() yalnız ASCII küçültür ("Ö", "İ", "Ş" eşleşmez): arama bu işlevle katlanmış metinde yapılır.
  db.function('fold', { deterministic: true }, v => (v === null ? null : fold(String(v))));
  return db;
}

/** Arama için metin katlama: aksanlar atılır, Türkçe ı/İ ve Almanca ß dahil (örnek → ornek, Größe → grosse). */
export const fold = s =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase();

export const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

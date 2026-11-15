import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.PORT || 8080);
export const DATA_DIR = process.env.DATA_DIR || path.join(HERE, 'store');
export const MODEL = process.env.ASSISTANT_MODEL || 'claude-sonnet-5-5';
export const BULK_LIMIT = 20; // bundan fazla ürünü etkileyen değişiklik yönetici onayı ister
fs.mkdirSync(DATA_DIR, { recursive: true });
export const SITE_URL = (process.env.SITE_URL || 'https://web-production-a959d0b7.up.railway.app').replace(
  /\/$/,
  '',
);
export const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

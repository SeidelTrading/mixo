import { isPrivateHostname } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { mapCsvRows, parseCsv } from './csv.mjs';
import { parseXmlFeed } from './xml.mjs';

const MAX_BYTES = 50 * 1024 * 1024;

/** Besleme metnini satırlara çevirir. format: 'csv' | 'xml' (boşsa içerikten anlaşılır). */
export function parseFeed(body, format, mapping = {}) {
  const fmt = format || (body.trimStart().startsWith('<') ? 'xml' : 'csv');
  return fmt === 'xml'
    ? parseXmlFeed(body, mapping)
    : mapCsvRows(parseCsv(body, mapping._delimiter), mapping);
}

/** Satırları tek işlemde (transaction) veritabanına yazar; sayaç döner. */
export function ingestRows(db, shop, rows, now = Date.now()) {
  const counts = { offer: 0, unmatched: 0, skipped: 0 };
  db.exec('BEGIN');
  try {
    for (const row of rows) counts[ingestOffer(db, shop, row, now)]++;
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return counts;
}

/** Bir mağazanın beslemesini indirir ve işler. Ağ erişimi yalnızca admin'in girdiği feedUrl'e yapılır. */
export async function runFeed(
  db,
  shop,
  { fetchImpl = fetch, now = Date.now, allowPrivateHosts = false } = {},
) {
  let result;
  try {
    const u = new URL(shop.feedUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error('yalnızca http(s) besleme adresi');
    if (!allowPrivateHosts && isPrivateHostname(u.hostname)) throw new Error('özel/yerel adres reddedildi');
    const res = await fetchImpl(u.href, {
      headers: { 'user-agent': 'KarsilastirFeed/0.1' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error('besleme çok büyük');
    const mapping = shop.feedMapping ? JSON.parse(shop.feedMapping) : {};
    const counts = ingestRows(db, shop, parseFeed(body, shop.feedFormat, mapping), now());
    result = { ok: true, ...counts };
  } catch (e) {
    result = { ok: false, error: String(e.message || e).slice(0, 200) };
  }
  db.prepare('UPDATE shops SET lastFeedAt = ?, lastFeedResult = ? WHERE id = ?').run(
    now(),
    JSON.stringify(result),
    shop.id,
  );
  return result;
}

/** Zamanı gelen besleme mağazalarını sırayla çalıştırır. */
export async function runDueFeeds(db, opts = {}) {
  const now = (opts.now || Date.now)();
  const due = db
    .prepare(
      `SELECT * FROM shops WHERE active = 1 AND blocked = 0 AND feedUrl IS NOT NULL AND feedUrl != ''
       AND (lastFeedAt IS NULL OR lastFeedAt + feedIntervalHours * 3600000 <= ?)`,
    )
    .all(now);
  for (const shop of due) await runFeed(db, shop, opts);
  return due.length;
}

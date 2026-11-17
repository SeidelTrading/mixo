import { addShop } from '../db/repo.mjs';
import { MARKETS, isMarket } from '../lib/config.mjs';
import { isPrivateHostname } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { createCsvParser } from './csv.mjs';
import { csvGetter, mapNetworkRow, resolvePreset } from './networks.mjs';
import { decompress, textChunks } from './stream.mjs';
import { createXmlItemSplitter, xmlValue } from './xml.mjs';

/**
 * Affiliate ağı beslemesi (Awin, Daisycon, Tradedoubler): tek dosyada çok mağaza, akışla işlenir.
 * Dosya hiçbir zaman tamamen belleğe alınmaz; satırlar ~500'lük işlemlerle (transaction) yazılır.
 */

export const SECRET_ENV_RE = /^FEED_[A-Z0-9_]+$/;
const BATCH = 500;
const MAX_ERROR_SAMPLES = 5;

/** Aynı beslemenin aynı anda iki kez çalışmasını engeller (veritabanı bağlantısı başına). */
const running = new WeakMap();
const runningSet = db => {
  let s = running.get(db);
  if (!s) running.set(db, (s = new Set()));
  return s;
};
export const isRunning = (db, id) => runningSet(db).has(id);

/** Beslemenin gizli anahtarı: env[secretEnv] (adı FEED_ ile başlamalı) ya da kayıtlı secret. */
export function feedSecret(feed, env = process.env) {
  if (feed.secretEnv) {
    if (!SECRET_ENV_RE.test(feed.secretEnv)) throw new Error('secretEnv adı FEED_[A-Z0-9_]+ olmalı');
    return env[feed.secretEnv] || '';
  }
  return feed.secret || '';
}

/** Görüntülenen adreste anahtar/token değerlerini gizler ({key} yer tutucusu olduğu gibi kalır). */
export function redactUrl(u) {
  return String(u || '').replace(
    /([?&;](?:api[_-]?key|apikey|key|token|secret|password|pass)=)([^&;#]*)/gi,
    (_, k, v) => k + (v === '{key}' || v === '' ? v : '***'),
  );
}

const marketForCurrency = { TRY: 'tr' };

/** Satırın pazarı: ülke (TR/DE/NL) varsa o (para birimi uymalı); yoksa TRY -> tr, EUR -> beslemenin pazarı. */
export function rowMarket(row, feed) {
  if (row.country) {
    const c = row.country.trim().toLowerCase();
    if (!isMarket(c)) return { skip: 'country' };
    if (row.currency && row.currency !== MARKETS[c].currency) return { skip: 'currency' };
    return { market: c };
  }
  const cur = row.currency || (isMarket(feed.market) ? MARKETS[feed.market].currency : '');
  if (marketForCurrency[cur]) return { market: marketForCurrency[cur] };
  if (cur === 'EUR' && isMarket(feed.market) && MARKETS[feed.market].currency === 'EUR')
    return { market: feed.market };
  return { skip: 'currency' };
}

const hostOf = u => {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) ? x.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

/** (ağ, mağaza no, pazar) için mağazayı bulur ya da açar; sonuç önbelleklenir. */
function shopResolver(db, feed, stats) {
  const cache = new Map();
  const find = db.prepare('SELECT * FROM shops WHERE network = ? AND networkMerchantId = ? AND market = ?');
  return (row, market) => {
    const mid = row.merchantId ? String(row.merchantId).slice(0, 64) : `feed:${feed.id}`;
    const key = `${mid}\u0000${market}`;
    let shop = cache.get(key);
    if (shop) return shop;
    shop = find.get(feed.network, mid, market);
    if (!shop) {
      const name = (row.merchantName || (row.merchantId ? `${feed.network} ${mid}` : feed.name)).slice(
        0,
        200,
      );
      const id = addShop(db, { market, name, domain: hostOf(row.url), shippingDefault: 0 });
      db.prepare('UPDATE shops SET network = ?, networkMerchantId = ? WHERE id = ?').run(
        feed.network,
        mid,
        id,
      );
      shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
      stats.shopsCreated++;
    } else if (!shop.domain && hostOf(row.url)) {
      db.prepare("UPDATE shops SET domain = ? WHERE id = ? AND domain = ''").run(hostOf(row.url), shop.id);
      shop.domain = hostOf(row.url);
    }
    cache.set(key, shop);
    stats.merchantKeys.add(key);
    return shop;
  };
}

/** Bayt akışını satır (alan nesnesi) akışına çevirir. */
async function* rowsOf(bytes, preset) {
  if (preset.format === 'xml') {
    const sp = createXmlItemSplitter({ itemTag: preset.itemTag });
    const map = b => mapNetworkRow(c => xmlValue(b, c), preset);
    for await (const t of textChunks(bytes)) for (const b of sp.push(t)) yield map(b);
    for (const b of sp.end()) yield map(b);
    return;
  }
  const p = createCsvParser({ delimiter: preset.delimiter });
  let getter;
  const map = function* (rows) {
    for (const r of rows) {
      if (!getter) getter = csvGetter(r);
      else yield mapNetworkRow(getter(r), preset);
    }
  };
  for await (const t of textChunks(bytes)) yield* map(p.push(t));
  yield* map(p.end());
}

/**
 * Bir ağ beslemesini indirir ve işler. Özeti feed.lastResult'a yazar ve döner.
 * opts.env: gizli anahtarın okunduğu ortam (varsayılan process.env).
 */
export async function runNetworkFeed(
  db,
  feed,
  {
    fetchImpl = fetch,
    now = Date.now,
    allowPrivateHosts = false,
    env = process.env,
    timeoutMs = 30 * 60 * 1000,
    maxBytes = 4 * 1024 ** 3,
  } = {},
) {
  const set = runningSet(db);
  if (set.has(feed.id)) return { ok: false, error: 'already running' };
  set.add(feed.id);
  const started = now();
  const stats = {
    rows: 0,
    merchantKeys: new Set(),
    shopsCreated: 0,
    matched: 0,
    unmatched: 0,
    skipped: {},
    errors: 0,
    errorSamples: [],
    truncated: false,
  };
  const skip = r => (stats.skipped[r] = (stats.skipped[r] || 0) + 1);
  let secret = '';
  const redact = s => {
    let t = String(s);
    if (secret) t = t.split(secret).join('***').split(encodeURIComponent(secret)).join('***');
    return redactUrl(t).slice(0, 300);
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('zaman aşımı')), timeoutMs);
  let result;
  try {
    const preset = resolvePreset(feed.network, feed.mapping ? JSON.parse(feed.mapping) : {});
    if (feed.format) preset.format = feed.format;
    secret = feedSecret(feed, env);
    if (feed.url.includes('{key}') && !secret) throw new Error('gizli anahtar yok (secret/env)');
    const u = new URL(feed.url.split('{key}').join(encodeURIComponent(secret)));
    if (!/^https?:$/.test(u.protocol)) throw new Error('yalnızca http(s) besleme adresi');
    if (!allowPrivateHosts && isPrivateHostname(u.hostname)) throw new Error('özel/yerel adres reddedildi');
    const res = await fetchImpl(u.href, {
      headers: { 'user-agent': 'KarsilastirFeed/0.1' },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error('boş yanıt');

    const resolveShop = shopResolver(db, feed, stats);
    const limit = feed.rowLimit > 0 ? feed.rowLimit : Infinity;
    let batch = [];
    const flush = () => {
      if (!batch.length) return;
      const ts = now();
      db.exec('BEGIN');
      try {
        for (const row of batch) {
          try {
            const m = rowMarket(row, feed);
            if (m.skip) {
              skip(m.skip);
              continue;
            }
            const shop = resolveShop(row, m.market);
            if (!shop.active || shop.blocked) {
              skip('shopInactive');
              continue;
            }
            const r = ingestOffer(db, shop, row, ts);
            if (r === 'offer') stats.matched++;
            else if (r === 'unmatched') stats.unmatched++;
            else skip('invalid');
          } catch (e) {
            stats.errors++;
            if (stats.errorSamples.length < MAX_ERROR_SAMPLES)
              stats.errorSamples.push(redact(e.message || e));
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      batch = [];
    };
    const bytes = decompress(/** @type {AsyncIterable<Uint8Array>} */ (/** @type {unknown} */ (res.body)), {
      maxBytes,
    });
    for await (const row of rowsOf(bytes, preset)) {
      if (ac.signal.aborted) throw ac.signal.reason;
      if (stats.rows >= limit) {
        stats.truncated = true;
        break;
      }
      stats.rows++;
      batch.push(row);
      if (batch.length >= BATCH) flush();
    }
    flush();
    result = { ok: true };
  } catch (e) {
    const err = ac.signal.aborted ? ac.signal.reason : e;
    if (ac.signal.aborted) stats.truncated = true;
    result = { ok: false, error: redact(err?.message || err) };
  } finally {
    clearTimeout(timer);
    ac.abort();
    set.delete(feed.id);
  }
  const { merchantKeys, ...rest } = stats;
  result = { ...result, ...rest, merchants: merchantKeys.size, durationMs: now() - started };
  db.prepare('UPDATE network_feeds SET lastRunAt = ?, lastResult = ? WHERE id = ?').run(
    now(),
    JSON.stringify(result),
    feed.id,
  );
  return result;
}

/** Zamanı gelen etkin ağ beslemelerini sırayla çalıştırır. */
export async function runDueNetworkFeeds(db, opts = {}) {
  const now = (opts.now || Date.now)();
  const due = db
    .prepare(
      `SELECT * FROM network_feeds WHERE active = 1
       AND (lastRunAt IS NULL OR lastRunAt + intervalHours * 3600000 <= ?)`,
    )
    .all(now);
  let n = 0;
  for (const feed of due) {
    if (isRunning(db, feed.id)) continue;
    await runNetworkFeed(db, feed, opts);
    n++;
  }
  return n;
}

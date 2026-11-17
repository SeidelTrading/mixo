import { ingestOffer } from '../lib/ingest.mjs';
import { CONNECTORS } from './connectors.mjs';

const DAY = 86400000;

/** Bağlayıcının mağaza satırını (yoksa) açar. */
function shopFor(db, c) {
  const { market, name, domain } = c.shop;
  const row = db.prepare('SELECT * FROM shops WHERE market = ? AND domain = ?').get(market, domain);
  if (row) return row;
  db.prepare('INSERT INTO shops (market, name, domain, active) VALUES (?, ?, ?, 1)').run(
    market,
    name,
    domain,
  );
  return db.prepare('SELECT * FROM shops WHERE market = ? AND domain = ?').get(market, domain);
}

/**
 * Etkin bağlayıcılarla (anahtarı tanımlı olanlar) Mixoutlet ürünlerinin EAN'ını sorgular ve bulunan en ucuz teklifi
 * ilgili mağazanın teklifi olarak içe aktarır. Yalnızca Mixoutlet'in EAN'lı ürünleri sorgulanır; aynı EAN bir
 * bağlayıcı için `recheckDays` içinde tekrar sorulmaz. env.LOOKUP_BATCH: bağlayıcı başına tur başına en çok sorgu (50).
 * Dönüş: { [connectorId]: { asked, found } }.
 */
export async function runLookups(
  db,
  {
    env = process.env,
    fetchImpl = fetch,
    now = Date.now,
    connectors = CONNECTORS,
    sleep = ms => new Promise(r => setTimeout(r, ms)),
  } = {},
) {
  const out = {};
  const batch = Number(env.LOOKUP_BATCH || 50);
  const delay = Number(env.LOOKUP_DELAY_MS || 1100);
  const recheck = Number(env.LOOKUP_RECHECK_DAYS || 7) * DAY;
  for (const c of connectors.filter(x => x.enabled(env))) {
    const shop = shopFor(db, c);
    const eans = db
      .prepare(
        `SELECT o.ean FROM offers o JOIN shops s ON s.id = o.shopId
         WHERE s.market = 'de' AND replace(lower(s.domain), 'www.', '') = 'mixoutlet.de'
           AND NOT EXISTS (SELECT 1 FROM lookups l WHERE l.shopId = ? AND l.ean = o.ean AND l.checkedAt > ?)
         LIMIT ?`,
      )
      .all(shop.id, now() - recheck, batch)
      .map(r => r.ean);
    const res = (out[c.id] = { asked: 0, found: 0, error: null });
    for (const ean of eans) {
      try {
        const o = await c.lookup(ean, { fetchImpl, env, now });
        res.asked++;
        if (o && ingestOffer(db, shop, { ean, ...o, inStock: true }, now()) === 'offer') res.found++;
        db.prepare(
          'INSERT INTO lookups (shopId, ean, checkedAt) VALUES (?, ?, ?) ON CONFLICT(shopId, ean) DO UPDATE SET checkedAt = excluded.checkedAt',
        ).run(shop.id, ean, now());
      } catch (e) {
        res.error = String(e.message).slice(0, 80); // kota/oturum hatası: bu bağlayıcıyı bu turda bırak
        break;
      }
      await sleep(delay);
    }
  }
  return out;
}

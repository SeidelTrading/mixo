import { isMarket } from './config.mjs';

/**
 * Mağaza kaydı: tarayıcının hangi mağazaları, hangi pazarda tarayacağı KODDA durur ve her açılışta veritabanına
 * uygulanır (yoksa eklenir; var olan satıra dokunulmaz). Böylece yeni bir pazar (TR) elle admin işi beklemeden dolar.
 *
 * crawl: true  -> mağaza yoksa eklenir; tohumları site haritasından otomatik keşfedilir (jobs/scheduler.mjs).
 * crawl: false -> mağaza TARANMAZ: varsa pasife çekilir (active = 0), yoksa eklenmez. Neden `why` alanında.
 *   Engeli aşmaya çalışmayız (UA taklidi, vekil, CAPTCHA yok): ürün sayfaları bot engelli mağazalar için doğru yol
 *   affiliate beslemesidir (Awin / Daisycon / Tradedoubler, admin > Networks). Besleme gelince mağaza o beslemeden
 *   (shops.network) otomatik açılır; bu kayıt yalnızca tarayıcıyı kapalı tutar.
 */
export const STORES = [
  // --- Almanya
  { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de', crawl: true },
  { market: 'de', name: 'Alternate', domain: 'alternate.de', crawl: true },
  { market: 'de', name: 'Christ', domain: 'christ.de', crawl: true },
  { market: 'de', name: 'Uhren4you', domain: 'uhren4you.de', crawl: true },
  { market: 'de', name: 'Parfumdreams', domain: 'parfumdreams.de', crawl: true },
  { market: 'de', name: 'Völkner', domain: 'voelkner.de', crawl: true },
  {
    market: 'de',
    name: 'OTTO',
    domain: 'otto.de',
    crawl: false,
    why: 'Ürün sayfaları bot korumalı (her istek HTTP 400, Kasada). Affiliate beslemesi gerekli.',
  },
  {
    market: 'de',
    name: 'SATURN',
    domain: 'saturn.de',
    crawl: false,
    why: 'Ürün sayfaları 403 döner (bot engeli). Affiliate beslemesi gerekli.',
  },
  {
    market: 'de',
    name: 'MediaMarkt',
    domain: 'mediamarkt.de',
    crawl: false,
    why: 'Ürün sayfaları 403 döner (bot engeli). Affiliate beslemesi gerekli.',
  },
  // --- Hollanda
  { market: 'nl', name: 'Alternate', domain: 'alternate.nl', crawl: true },
  { market: 'nl', name: 'Paradigit', domain: 'paradigit.nl', crawl: true },
  {
    market: 'nl',
    name: 'MediaMarkt',
    domain: 'mediamarkt.nl',
    crawl: false,
    why: 'Ürün sayfaları 403 döner (bot engeli). Affiliate beslemesi gerekli.',
  },
  // --- Türkiye (hepsi robots.txt'e uyuyor ve ürün sayfasında schema.org Product veriyor; 2026-11-17 doğrulandı)
  { market: 'tr', name: 'Boyner', domain: 'boyner.com.tr', crawl: true },
  { market: 'tr', name: 'D&R', domain: 'dr.com.tr', crawl: true },
  { market: 'tr', name: 'FLO', domain: 'flo.com.tr', crawl: true },
  { market: 'tr', name: 'Gratis', domain: 'gratis.com', crawl: true },
  {
    market: 'tr',
    name: 'MediaMarkt',
    domain: 'mediamarkt.com.tr',
    crawl: false,
    why: 'Ürün sayfalarında schema.org Product yok (yalnız kategori), sayfalar 403 döner.',
  },
];

const site = d =>
  String(d)
    .toLowerCase()
    .replace(/^www\./, '');

/**
 * Kaydı veritabanına uygular. Dönüş: { added, disabled } (eklenen mağaza adları, pasife çekilenler).
 * Eşleşme: pazar + www'siz alan adı; yönetici elle farklı ad/ayar vermişse onlar korunur.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function provisionStores(db, stores = STORES) {
  const out = { added: [], disabled: [] };
  const all = db.prepare('SELECT id, market, domain, active FROM shops').all();
  for (const s of stores) {
    if (!isMarket(s.market)) continue;
    const found = all.filter(r => r.market === s.market && site(r.domain) === site(s.domain));
    if (s.crawl) {
      if (found.length) continue;
      db.prepare('INSERT INTO shops (market, name, domain) VALUES (?, ?, ?)').run(s.market, s.name, s.domain);
      out.added.push(`${s.market}:${s.domain}`);
    } else
      for (const r of found.filter(x => x.active)) {
        db.prepare('UPDATE shops SET active = 0 WHERE id = ?').run(r.id);
        out.disabled.push(`${s.market}:${s.domain}`);
      }
  }
  return out;
}

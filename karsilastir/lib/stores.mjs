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
 *
 * İsteğe bağlı alanlar (yalnız crawl: true mağazalar):
 *   search      EAN / marka+MPN arama yolu şablonu ("/yol?q={q}", aynı host); crawler.searchTargeted kullanır. Yalnız
 *               robots.txt arama yoluna izin veriyorsa yazılır (her istek yine de robots denetiminden geçer).
 *   brands      hedefleme ipucu: bu markalar aramada ve hedeflemede öne alınır (küçük harf).
 *   priceNet    true ise sayfadaki fiyat KDV hariç (net) gösterilir; kayda geçmeden önce x1,19 yapılır (B2B mağazalar).
 *   eanFromText true ise JSON-LD / microdata'da gtin yoksa sayfa metnindeki tek "EAN: <13 hane>" kullanılır.
 */
export const STORES = [
  // --- Almanya
  // shopify: true -> ürün listesi /products.json üzerinden içe aktarılır (kullanıcının kendi mağazası; OWN_DOMAINS ile hızlandırılabilir).
  { market: 'de', name: 'Mixoutlet', domain: 'mixoutlet.de', crawl: true, shopify: true },
  { market: 'de', name: 'Alternate', domain: 'alternate.de', crawl: true },
  { market: 'de', name: 'Uhrcenter', domain: 'uhrcenter.de', crawl: true },
  // Christ ve Uhren4you yerel denetimde 403 verdi ama üretimde taranıyor (günlükte 283 / 295 ok): kapatılmaz.
  // Engel gelirse 24 saatlik host beklemesi zaten devreye girer.
  { market: 'de', name: 'Christ', domain: 'christ.de', crawl: true },
  { market: 'de', name: 'Uhren4you', domain: 'uhren4you.de', crawl: true },
  { market: 'de', name: 'Parfumdreams', domain: 'parfumdreams.de', crawl: true },
  { market: 'de', name: 'Völkner', domain: 'voelkner.de', crawl: true },
  // Saha denetimi 2026-11-18: robots serbest, sayfada schema.org gtin/mpn var (ayrıntı docs/KAYNAKLAR.md).
  {
    market: 'de',
    name: 'reichelt',
    domain: 'reichelt.de',
    crawl: true,
    search: '/de/de/shop/suche?search={q}',
    brands: ['delock', 'logilink', 'digitus', 'goobay', 'startech', 'equip', 'tp-link'],
  },
  // Deneme 2026-11-18: arama EAN'ı doğrudan ürüne yönlendiriyor ama ürün sayfasında schema.org Product yok (yalnız
  // BreadcrumbList), EAN yalnız metinde, fiyat anonim sayfada görünmüyor (yalnız veri katmanında): ingest edilemez.
  {
    market: 'de',
    name: 'Secomp',
    domain: 'secomp.de',
    crawl: false,
    why: 'Ürün sayfasında schema.org Product yok, fiyat anonim sayfada görünmüyor (deneme: 41 arama, 0 teklif).',
  },
  // Arama yolu robots'ta yasak: yalnız site haritası ve MPN/EAN hedeflemesi.
  {
    market: 'de',
    name: 'Jacob',
    domain: 'jacob.de',
    crawl: true,
    brands: ['brother', 'hp', 'lenovo', 'samsung'],
  },
  // Arama yolu bulunamadı; URL'de marka ve model geçer, itemprop gtin8 alanında EAN var.
  {
    market: 'de',
    name: 'Mindfactory',
    domain: 'mindfactory.de',
    crawl: true,
    brands: ['asus', 'msi', 'thermaltake'],
  },
  // Deneme 2026-11-18: sayfadaki itemprop="price" zaten BRÜT (4,51 € inkl. MwSt. -> content="4.51"; net fiyat yalnız
  // veri katmanında: 3.79). x1,19 çift KDV olur (5,37), bu yüzden net/brüt doğrulaması tutmadı ve mağaza kapatıldı.
  // priceNet kaldırılırsa fiyatlar doğru olur (3 üründe doğrulandı); karar ana oturumda.
  {
    market: 'de',
    name: 'Office Partner',
    domain: 'office-partner.de',
    crawl: false,
    why: 'net/brüt fiyat doğrulanamadı: sayfadaki fiyat zaten brüt, x1,19 çift KDV veriyor.',
    priceNet: true,
    eanFromText: true,
    brands: ['brother', 'canon', 'hp', 'epson', 'samsung', 'msi'],
  },
  {
    market: 'de',
    name: 'Uhrzeit',
    domain: 'uhrzeit.org',
    crawl: true,
    brands: ['festina', 'casio', 'guess', 'tommy hilfiger', 'seiko'],
  },
  {
    market: 'de',
    name: 'Pieper',
    domain: 'pieper.de',
    crawl: true,
    search: '/search?sSearch={q}',
    brands: ['afnan'],
  },
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
  // İkinci dalga (denetim bekliyor; crawl: true YAPILMADI): wlan-shop24.de, visunext.de, bechtle.com (B2B net fiyat),
  // discounto.de, toneroffice.de, tonermacher.de, hd-toner.de, helveti.eu, lyko.com/de, industry-electronics.com
  // (B2B net fiyat), talk-point.de. Önce robots, site haritası ve net/brüt fiyat denetimi gerekir (docs/KAYNAKLAR.md).
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

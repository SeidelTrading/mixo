import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { SITE_URL } from '../lib/config.mjs';
import { dict, isSafeKey } from '../lib/safe.mjs';
import { eanFor } from './pool.mjs';
import { FeedError, categoryOf, eligible, escXml, field, priceOf } from './feed.mjs';

// Karşılaştırma sitesi feed'leri (idealo CSV, PriceRunner XML). HTTP bilmez.
// Feed ile satış sitesinin ürün sayfası AYNI fiyat işlevlerini (offerPrice, shippingCost) kullanır: platformdaki fiyat
// sayfadakinden ayrışırsa idealo teklifi düşürür, PriceRunner ek tıklama ücreti alır.
const fail = (code, msg) => {
  throw new FeedError(code, msg);
};

// Hedef = platform + ülke. `market` kural motoru ve pazar yerine özel EAN için kullanılır (feed.mjs MARKETS).
export const TARGETS = Object.freeze({
  'idealo-de': Object.freeze({ market: 'idealo', country: 'de', format: 'csv' }),
  'idealo-at': Object.freeze({ market: 'idealo', country: 'at', format: 'csv' }),
  'pricerunner-se': Object.freeze({ market: 'pricerunner', country: 'se', format: 'xml' }),
  'pricerunner-dk': Object.freeze({ market: 'pricerunner', country: 'dk', format: 'xml' }),
  'pricerunner-uk': Object.freeze({ market: 'pricerunner', country: 'uk', format: 'xml' }),
});
const COUNTRIES = ['de', 'at', 'se', 'dk', 'uk'];
const LANGS = ['de', 'sv', 'da', 'en'];
// Teslim süresi metni ülke diline göre; idealo "versandfertig" gibi belirsiz ifadeyi kabul etmez, iş günü ister.
const DAYS = { de: 'Werktage', sv: 'arbetsdagar', da: 'hverdage', en: 'working days' };
// Varsayılan: yalnız para birimi ve dil. Kur, kargo, ödeme ve teslim süresi ELLE girilir (uydurma rakam yok);
// tanımlanmamış ülkenin feed'i üretilmez.
const DEFAULT_COUNTRIES = {
  de: { currency: 'EUR', rate: 1, lang: 'de' },
  at: { currency: 'EUR', rate: 1, lang: 'de' },
  se: { currency: 'SEK', lang: 'sv' },
  dk: { currency: 'DKK', lang: 'da' },
  uk: { currency: 'GBP', lang: 'en' },
};

const txt = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v, lo, hi) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const money = n => (Math.round(n * 100) / 100).toFixed(2);

function readDoc() {
  const d = store.doc('channel_feed', {});
  return d && typeof d === 'object' ? d : {};
}

export function getConfig() {
  const d = readDoc();
  const countries = {};
  for (const c of COUNTRIES) countries[c] = { ...DEFAULT_COUNTRIES[c], ...(d.countries?.[c] ?? {}) };
  return { baseUrl: d.baseUrl || SITE_URL, productPath: d.productPath || '/p/', countries };
}

// Ücret tablosu (kargo firması → ücret, ödeme yöntemi → ücret). Anahtar idealo sütun adının sonuna eklenir
// (deliveryCosts_dhl, paymentCosts_paypal); idealo'nun kabul ettiği adlar CSV belgesindedir.
function costTable(v, name) {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('invalid', `${name} nesne olmalı`);
  const out = dict();
  for (const [k, x] of Object.entries(v)) {
    if (!isSafeKey(k) || !/^[a-z][a-z_]{1,29}$/.test(k)) fail('invalid', `${name}: geçersiz anahtar ${k}`);
    const n = num(x, 0, 1000);
    if (n === null) fail('invalid', `${name}.${k}: 0–1000 arası sayı olmalı`);
    out[k] = n;
  }
  if (Object.keys(out).length > 12) fail('invalid', `${name} en fazla 12 kalem`);
  return { ...out };
}

function cleanCountry(c, v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('invalid', `${c}: nesne bekleniyor`);
  const o = {};
  if (v.currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(txt(v.currency))) fail('invalid', `${c}.currency: üç büyük harf (EUR, SEK…)`);
    o.currency = txt(v.currency);
  }
  if (v.rate !== undefined) {
    const n = num(v.rate, 0.0001, 1000);
    if (n === null) fail('invalid', `${c}.rate: pozitif sayı olmalı (1 EUR karşılığı)`);
    o.rate = n;
  }
  if (v.lang !== undefined) {
    if (!LANGS.includes(v.lang)) fail('invalid', `${c}.lang: ${LANGS.join(', ')}`);
    o.lang = v.lang;
  }
  for (const k of ['deliveryMin', 'deliveryMax']) {
    if (v[k] === undefined) continue;
    const n = num(v[k], 0, 60);
    if (n === null || !Number.isInteger(n)) fail('invalid', `${c}.${k}: 0–60 arası tam sayı (iş günü)`);
    o[k] = n;
  }
  if (v.freeFrom !== undefined) {
    const n = v.freeFrom === null ? null : num(v.freeFrom, 0, 100000);
    if (v.freeFrom !== null && n === null) fail('invalid', `${c}.freeFrom: sayı ya da null`);
    o.freeFrom = n;
  }
  const sh = costTable(v.shipping, `${c}.shipping`),
    pay = costTable(v.payments, `${c}.payments`);
  if (sh) o.shipping = sh;
  if (pay) o.payments = pay;
  return o;
}

// setConfig({ baseUrl?, productPath?, countries?: { de: {...}, ... } }): verilen alanlar birleştirilir.
export function setConfig(input) {
  const b = input && typeof input === 'object' ? input : {};
  const d = readDoc();
  const next = { ...d, countries: { ...(d.countries ?? {}) } };
  if (b.baseUrl !== undefined) {
    let u;
    try {
      u = new URL(txt(b.baseUrl));
    } catch {
      fail('invalid', 'baseUrl geçerli bir adres değil');
    }
    if (!/^https?:$/.test(u.protocol) || u.search || u.hash)
      fail('invalid', 'baseUrl http(s) olmalı, sorgu içermemeli');
    next.baseUrl = u.origin + u.pathname.replace(/\/$/, '');
  }
  if (b.productPath !== undefined) {
    const p = txt(b.productPath);
    if (!/^\/[A-Za-z0-9/_-]{0,40}\/$/.test(p))
      fail('invalid', "productPath '/' ile başlayıp bitmeli (ör. /p/)");
    next.productPath = p;
  }
  if (b.countries !== undefined) {
    if (!b.countries || typeof b.countries !== 'object' || Array.isArray(b.countries))
      fail('invalid', 'countries nesne olmalı');
    for (const [c, v] of Object.entries(b.countries)) {
      if (!COUNTRIES.includes(c)) fail('invalid', `Geçersiz ülke (${COUNTRIES.join(', ')})`);
      next.countries[c] = { ...(next.countries[c] ?? {}), ...cleanCountry(c, v) };
    }
  }
  for (const c of Object.keys(next.countries)) {
    const x = next.countries[c];
    if (x.deliveryMin !== undefined && x.deliveryMax !== undefined && x.deliveryMin > x.deliveryMax)
      fail('invalid', `${c}: deliveryMin, deliveryMax'tan büyük olamaz`);
  }
  store.saveDoc('channel_feed', next);
  return getConfig();
}

// Feed üretilebilmesi için ülkede eksik olanlar (boş dizi = hazır).
export function countryGaps(c) {
  const x = getConfig().countries[c];
  const gaps = [];
  if (!x.rate) gaps.push('rate');
  if (x.deliveryMin === undefined || x.deliveryMax === undefined) gaps.push('delivery');
  if (!x.shipping || !Object.keys(x.shipping).length) gaps.push('shipping');
  if (!x.payments || !Object.keys(x.payments).length) gaps.push('payments');
  return gaps;
}

const cleanTarget = t => {
  const k = typeof t === 'string' ? t.trim().toLowerCase() : '';
  if (!Object.hasOwn(TARGETS, k)) fail('invalid', `Geçersiz hedef (${Object.keys(TARGETS).join(', ')})`);
  return k;
};

// --- Ortak fiyat işlevleri: satış sitesinin ürün sayfası da bunları çağırır ---

// Ülke para biriminde KDV dahil teklif fiyatı. Havuz fiyatı EUR'dur; kur yoksa null (ürün yayınlanmaz).
export function offerPrice(pool, country) {
  const x = getConfig().countries[country];
  const p = priceOf(pool);
  if (!x || !x.rate || p === null) return null;
  return Math.round(p * x.rate * 100) / 100;
}
// En ucuz kargo ücreti (ülke para biriminde); ücretsiz kargo eşiği aşıldıysa 0.
export function shippingCost(price, country) {
  const x = getConfig().countries[country];
  const vals = Object.values(x?.shipping ?? {});
  if (!vals.length) return null;
  if (x.freeFrom !== null && x.freeFrom !== undefined && price >= x.freeFrom) return 0;
  return Math.min(...vals);
}

// --- Ürün satırı ---

// Açıklama: HTML ve denetim karakterleri atılır (PriceRunner alanlarda HTML/JS kabul etmez), 1000 karakterle sınırlı.
const plain = v =>
  txt(v)
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);

function productUrl(cfg, ean, target) {
  const platform = target.split('-')[0];
  const q = new URLSearchParams({ utm_source: platform, utm_medium: 'cpc', utm_campaign: target });
  return `${cfg.baseUrl}${cfg.productPath}${encodeURIComponent(ean)}?${q}`;
}

// Havuz kaydını hedefe göre satıra çevirir; yayınlanamıyorsa null ve nedeni.
function rowOf(p, target, cfg) {
  const { market, country } = TARGETS[target];
  const stock = field(p, 'stock');
  if (stock !== undefined && Number(stock) <= 0) return { skip: 'stok yok' };
  const ean = eanFor(p.id, market);
  if (!ean) return { skip: 'EAN yok' };
  const price = offerPrice(p, country);
  if (price === null) return { skip: 'fiyat yok' };
  const ship = shippingCost(price, country);
  const x = cfg.countries[country];
  return {
    row: {
      sku: p.id,
      ean,
      title: plain(p.title).slice(0, 255),
      brand: plain(p.vendor),
      mpn: plain(p.mpn),
      description: plain(field(p, 'description')),
      image: txt(field(p, 'image')),
      category: plain(categoryOf(p)),
      url: productUrl(cfg, ean, target),
      price,
      shipping: ship,
      delivery: `${x.deliveryMin}-${x.deliveryMax} ${DAYS[x.lang] ?? DAYS.en}`,
      currency: x.currency,
      x,
    },
  };
}

// --- Biçimler ---

// CSV hücresi: her hücre tırnaklı, iç tırnak ikilenir, satır sonu boşluğa çevrilir. Hücre "=" "+" "-" "@" ile
// başlıyorsa başına tek tırnak konur: dosya bir tabloda açılırsa formül çalışmasın.
export function csvCell(v) {
  let s = String(v ?? '').replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// idealo CSV: UTF-8 (BOM'lu), virgül ayırıcı, nokta ondalık, KDV dahil fiyat.
// Zorunlu: sku, title, url, price, delivery, en az bir deliveryCosts_* ve paymentCosts_*.
// Kaynak: https://idealo.github.io/csv-importer/en/csv
function toCsv(rows, x) {
  const ship = Object.keys(x.shipping ?? {}),
    pay = Object.keys(x.payments ?? {});
  const head = [
    'sku',
    'title',
    'url',
    'price',
    'delivery',
    'eans',
    'brand',
    'hans',
    'description',
    'imageUrls',
    'categoryPath',
    ...ship.map(k => 'deliveryCosts_' + k),
    ...pay.map(k => 'paymentCosts_' + k),
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const free = r.shipping === 0;
    lines.push(
      [
        r.sku,
        r.title,
        r.url,
        money(r.price),
        r.delivery,
        r.ean,
        r.brand,
        r.mpn,
        r.description,
        r.image,
        r.category,
        ...ship.map(k => money(free ? 0 : x.shipping[k])),
        ...pay.map(k => money(x.payments[k])),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// PriceRunner XML. Alan adları üçüncü taraf feed belgelerinden alındı (resmi liste satıcı hesabında görülür);
// değişirse yalnız bu tablo güncellenir.
/** @type {Array<[string, (r: any) => any]>} */
const PR_FIELDS = [
  ['SKU', r => r.sku],
  ['ProductName', r => r.title],
  ['Price', r => money(r.price)],
  ['Currency', r => r.currency],
  ['ShippingCost', r => money(r.shipping)],
  ['ProductUrl', r => r.url],
  ['ImageUrl', r => r.image],
  ['Category', r => r.category],
  ['Ean', r => r.ean],
  ['Manufacturer', r => r.brand],
  ['ManufacturerSku', r => r.mpn],
  ['Description', r => r.description],
  ['StockStatus', () => 'In stock'],
  ['DeliveryTime', r => r.delivery],
];
function toXml(rows) {
  const items = rows.map(r => {
    const body = PR_FIELDS.map(([k, f]) => [k, f(r)])
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `    <${k}>${escXml(v)}</${k}>`)
      .join('\n');
    return `  <product>\n${body}\n  </product>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${items.join('\n')}${items.length ? '\n' : ''}</products>\n`;
}

// buildChannel(target, { limit? }) → { target, format, contentType, body, count, skipped }
// Ülke ayarı eksikse üretmez ('notready'): eksik kargo/ödeme alanlı feed platformda reddedilir.
export function buildChannel(target, opts) {
  const tg = cleanTarget(target);
  const { market, country, format } = TARGETS[tg];
  const gaps = countryGaps(country);
  if (gaps.length) fail('notready', `${country} ayarı eksik: ${gaps.join(', ')}`);
  const cfg = getConfig();
  const rows = [],
    skipped = {};
  for (const p of eligible(market, { limit: opts?.limit })) {
    const r = rowOf(p, tg, cfg);
    if (r.row) rows.push(r.row);
    else skipped[r.skip] = (skipped[r.skip] ?? 0) + 1;
  }
  const x = cfg.countries[country];
  return format === 'csv'
    ? {
        target: tg,
        format,
        contentType: 'text/csv; charset=utf-8',
        body: toCsv(rows, x),
        count: rows.length,
        skipped,
      }
    : {
        target: tg,
        format,
        contentType: 'application/xml; charset=utf-8',
        body: toXml(rows),
        count: rows.length,
        skipped,
      };
}

// --- Erişim anahtarı ---
// Feed adresi herkese açık uçtadır; platform onu anahtarla çeker. Belgede yalnız SHA-256 özeti durur,
// düz anahtar yalnız üretildiği anda bir kez döner.
const hash = s => crypto.createHash('sha256').update(s).digest();

export function rotateToken(target) {
  const tg = cleanTarget(target);
  const token = crypto.randomBytes(24).toString('base64url');
  const d = readDoc();
  store.saveDoc('channel_feed', { ...d, tokens: { ...(d.tokens ?? {}), [tg]: hash(token).toString('hex') } });
  return { target: tg, token };
}

export function tokenOk(target, token) {
  if (!Object.hasOwn(TARGETS, target) || typeof token !== 'string' || token.length < 16 || token.length > 200)
    return false;
  const h = readDoc().tokens?.[target];
  if (typeof h !== 'string' || h.length !== 64) return false;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), hash(token));
}

// Panel için hedef listesi: hazır mı, anahtarı var mı, herkese açık adresi.
export function listTargets() {
  const d = readDoc(),
    cfg = getConfig();
  return Object.entries(TARGETS).map(([id, t]) => ({
    id,
    ...t,
    gaps: countryGaps(t.country),
    hasToken: typeof d.tokens?.[id] === 'string',
    path: `/api/feeds/${id}.${t.format}`,
    currency: cfg.countries[t.country].currency,
  }));
}

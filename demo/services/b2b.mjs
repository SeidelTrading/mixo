import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { dict } from '../lib/safe.mjs';

// B2B platformu iş kuralları (HTTP bilmez; gerçek ödeme ya da ağ çağrısı yok). Lojistik yazılımı verisi Wawi verisiyle
// birleştirilir; Türk satıcılar Almanya'daki küçük alıcılarla eşleştirilir ve platform komisyon alır.
// Durum tek belgede: store.doc('b2b') = { sellers, buyers, offers, deals }.

// VARSAYIM: Sunumda komisyon oranı verilmedi; %3 yalnız yer tutucu bir varsayımdır, sözleşmeyle netleşince değişmelidir.
export const COMMISSION_PCT = 3;
// AÇIK SORU: Faturanın kimin üzerine kesileceği (platform mu, satıcı mı) sunumda netleşmedi.
// Şimdilik `invoiceParty` alanı kaydedilir, varsayılan 'platform'; karar çıkınca davranış buna bağlanmalı.
export const INVOICE_PARTIES = ['platform', 'seller'];
export const INCOTERMS = ['EXW', 'FOB', 'DAP', 'DDP'];
const CURRENCIES = ['EUR', 'TRY', 'USD'];

// Geçerli durum geçişleri tek tabloda.
export const TRANSITIONS = {
  open: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['closed'],
  closed: [],
  cancelled: [],
};

// Hata türleri: invalid (girdi), notfound, conflict (adet yetmez). Yönlendirme katmanı HTTP koduna çevirir.
export class B2BError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new B2BError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const newId = prefix => prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 12);

/** @returns {{ sellers: Record<string, any>, buyers: Record<string, any>, offers: Record<string, any>, deals: Record<string, any> }} */
const load = () => {
  /** @type {any} */
  const d = store.doc('b2b', null) || {};
  // kimlikler istekten gelir (offerId, buyerId, deal id): prototipsiz haritalar, `__proto__` bulunamayan kimlik olur
  return { sellers: dict(d.sellers), buyers: dict(d.buyers), offers: dict(d.offers), deals: dict(d.deals) };
};
const run = fn =>
  store.tx(() => {
    const d = load();
    const r = fn(d);
    store.saveDoc('b2b', d);
    return r;
  });

// ISO-2 ülke kodu: iki büyük harf ve Intl'in tanıdığı bir bölge.
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function cleanCountry(v, dflt) {
  const c = (v === undefined || v === null || v === '' ? dflt : String(v)).trim().toUpperCase();
  let ok = false;
  if (/^[A-Z]{2}$/.test(c)) {
    try {
      const n = regionNames.of(c);
      ok = !!n && n !== c;
    } catch {
      ok = false;
    }
  }
  if (!ok) fail('invalid', 'Geçersiz ülke kodu (ISO-2 olmalı)');
  return c;
}
function cleanCategories(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail('invalid', 'categories dizi olmalı');
  return [...new Set(v.map(x => str(x, 60).toLowerCase()).filter(Boolean))];
}
function cleanParty(o, dfltCountry, label) {
  const x = o && typeof o === 'object' ? o : {};
  const name = str(x.name, 200),
    vat = str(x.vat, 40);
  if (!name) fail('invalid', `${label} adı gerekli`);
  if (!vat) fail('invalid', 'VAT/vergi numarası gerekli (B2B için zorunlu)');
  return {
    name,
    vat,
    country: cleanCountry(x.country, dfltCountry),
    categories: cleanCategories(x.categories),
  };
}

export function registerSeller(input) {
  const s = { id: newId('s_'), ...cleanParty(input, 'TR', 'Satıcı'), t: Date.now() };
  return run(d => ((d.sellers[s.id] = s), s));
}
export function registerBuyer(input) {
  const b = { id: newId('b_'), ...cleanParty(input, 'DE', 'Alıcı'), t: Date.now() };
  return run(d => ((d.buyers[b.id] = b), b));
}

// Para: kuruş (tam sayı) hassasiyetinde. Girdi ondalık tutar, en çok 2 basamak; dışarıya da ondalık gösterim döner.
function toCents(v) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) fail('invalid', 'Fiyat pozitif sayı olmalı');
  const c = Math.round(n * 100);
  if (c < 1 || Math.abs(c / 100 - n) > 1e-9) fail('invalid', 'Fiyat en çok 2 ondalık basamaklı olmalı');
  return c;
}
const fromCents = c => c / 100;
const posInt = (v, name) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0)
    fail('invalid', `${name} pozitif tam sayı olmalı`);
  return v;
};

const view = o => ({ ...o, unitPrice: fromCents(o.unitCents) });

export function listOffers() {
  return Object.values(load().offers).map(view);
}

export function addOffer(input) {
  const x = input && typeof input === 'object' ? input : {};
  const title = str(x.title, 300);
  if (!title) fail('invalid', 'title gerekli');
  if (!INCOTERMS.includes(x.incoterm))
    fail('invalid', `incoterm şunlardan biri olmalı: ${INCOTERMS.join(', ')}`);
  const currency = x.currency === undefined ? 'EUR' : String(x.currency).toUpperCase();
  if (!CURRENCIES.includes(currency))
    fail('invalid', `currency şunlardan biri olmalı: ${CURRENCIES.join(', ')}`);
  const qty = posInt(x.qty, 'qty'),
    unitCents = toCents(x.unitPrice);
  return run(d => {
    if (!d.sellers[x.sellerId]) fail('notfound', 'Satıcı yok');
    const o = {
      id: newId('o_'),
      sellerId: x.sellerId,
      poolId: str(x.poolId, 40) || null,
      title,
      qty,
      remaining: qty,
      unitCents,
      currency,
      incoterm: x.incoterm,
      t: Date.now(),
    };
    d.offers[o.id] = o;
    return view(o);
  });
}

// Puanlama (0-100): kategori uyumu 50, fiyat avantajı en çok 40 (tavanın altında kalan oran), teslim dahil incoterm 10.
/** @param {{ buyerId?: any, category?: any, maxUnitPrice?: any }} [o] */
export function match({ buyerId, category, maxUnitPrice } = {}) {
  const d = load();
  const buyer = d.buyers[buyerId];
  if (!buyer) fail('notfound', 'Alıcı yok');
  const cats = category ? [str(category, 60).toLowerCase()] : buyer.categories;
  const cap = maxUnitPrice === undefined || maxUnitPrice === null ? null : toCents(maxUnitPrice);
  const out = [];
  for (const o of Object.values(d.offers)) {
    if (o.remaining <= 0) continue;
    const seller = d.sellers[o.sellerId];
    if (!seller) continue;
    const common = seller.categories.filter(c => cats.includes(c));
    if (cats.length && !common.length) continue;
    if (cap !== null && o.unitCents > cap) continue;
    const why = [];
    let score = 0;
    if (common.length) {
      score += 50;
      why.push(`Satıcı alıcının aradığı kategoride (${common.join(', ')})`);
    } else why.push('Kategori kısıtı verilmedi');
    if (cap !== null) {
      const adv = Math.round(40 * (1 - o.unitCents / cap));
      score += adv;
      why.push(
        adv > 0
          ? `Birim fiyat tavanın %${Math.round((1 - o.unitCents / cap) * 100)} altında`
          : 'Birim fiyat tavana çok yakın',
      );
    } else {
      score += 20;
      why.push('Fiyat tavanı verilmediği için fiyat avantajı orta puanlandı');
    }
    if (o.incoterm === 'DAP' || o.incoterm === 'DDP') {
      score += 10;
      why.push(`${o.incoterm}: teslimat satıcıya ait, küçük alıcı için kolay`);
    } else why.push(`${o.incoterm}: nakliyeyi alıcı üstlenir`);
    out.push({ offer: view(o), score, why: why.join('; ') + '.' });
  }
  return out.sort((a, b) => b.score - a.score || a.offer.unitPrice - b.offer.unitPrice);
}

// Komisyon, baz puan (%1 = 100) üzerinden yarım yukarı yuvarlanır; her şey kuruş cinsinden tam sayıdır.
const quoteCents = (unitCents, qty) => {
  const net = unitCents * qty,
    bp = Math.round(COMMISSION_PCT * 100);
  const commission = Math.floor((net * bp + 5000) / 10000);
  return { net, commission, gross: net + commission };
};
const quoteOf = (o, qty) => {
  const c = quoteCents(o.unitCents, qty);
  return {
    net: fromCents(c.net),
    commission: fromCents(c.commission),
    gross: fromCents(c.gross),
    currency: o.currency,
    cents: c,
  };
};

/** @param {{ offerId?: any, qty?: any }} [o] */
export function quote({ offerId, qty } = {}) {
  const o = load().offers[offerId];
  if (!o) fail('notfound', 'Teklif yok');
  return quoteOf(o, posInt(qty, 'qty'));
}

/** @param {{ offerId?: any, buyerId?: any, qty?: any, invoiceParty?: any }} [o] */
export function createDeal({ offerId, buyerId, qty, invoiceParty } = {}) {
  const q = posInt(qty, 'qty');
  const party = invoiceParty === undefined ? 'platform' : invoiceParty;
  if (!INVOICE_PARTIES.includes(party)) fail('invalid', "invoiceParty 'platform' ya da 'seller' olmalı");
  return run(d => {
    const o = d.offers[offerId];
    if (!o) fail('notfound', 'Teklif yok');
    if (!d.buyers[buyerId]) fail('notfound', 'Alıcı yok');
    if (q > o.remaining) fail('conflict', `Yeterli adet yok (kalan: ${o.remaining})`);
    o.remaining -= q;
    const deal = {
      id: newId('d_'),
      status: 'open',
      offerId,
      buyerId,
      qty: q,
      invoiceParty: party,
      quote: quoteOf(o, q),
      t: Date.now(),
    };
    d.deals[deal.id] = deal;
    return deal;
  });
}

export function advanceDeal(id, status) {
  return run(d => {
    const deal = d.deals[id];
    if (!deal) fail('notfound', 'Anlaşma yok');
    if (!TRANSITIONS[deal.status]?.includes(status))
      fail('invalid', `Geçersiz durum geçişi: ${deal.status} → ${status}`);
    if (status === 'cancelled' && d.offers[deal.offerId]) d.offers[deal.offerId].remaining += deal.qty;
    deal.status = status;
    deal.updated = Date.now();
    return deal;
  });
}

export function summary() {
  const d = load();
  const deals = Object.values(d.deals);
  return {
    commissionPct: COMMISSION_PCT,
    sellers: Object.values(d.sellers),
    buyers: Object.values(d.buyers),
    offers: Object.values(d.offers).map(view),
    deals,
    counts: {
      sellers: Object.keys(d.sellers).length,
      buyers: Object.keys(d.buyers).length,
      offers: Object.keys(d.offers).length,
      deals: deals.length,
    },
  };
}

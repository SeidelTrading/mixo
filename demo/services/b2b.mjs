import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { recordSet, moveDocRows } from './records.mjs';

// B2B platformu iş kuralları (HTTP bilmez; gerçek ödeme ya da ağ çağrısı yok). Lojistik yazılımı verisi Wawi verisiyle
// birleştirilir; Türk satıcılar Almanya'daki küçük alıcılarla eşleştirilir ve platform komisyon alır.
// Durum satır tablosunda (recs): her satıcı, alıcı, teklif ve anlaşma kendi satırıdır; yazma yalnız değişen satıra dokunur.
// Eskiden hepsi tek `store.doc('b2b')` belgesindeydi ve her yazma tüm belgeyi yeniden yazıyordu (bkz. services/records.mjs).
// Belgede artık yalnız taşıma damgası kalır; komisyon oranı gibi yapılandırma zaten sabit olarak kodda durur.

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

const sellers = recordSet('b2b_sellers'),
  buyers = recordSet('b2b_buyers'),
  offers = recordSet('b2b_offers'),
  // Açık anlaşmalar (open/confirmed/shipped) burada, sonuçlanmış olanlar (closed/cancelled) ayrı satır kümesinde durur.
  // Ayrım tavanı güvenli kılar: yalnız sonuçlanmışlar budanır, açık bir anlaşma yaşlı diye asla silinmez.
  dealsOpen = recordSet('b2b_deals'),
  dealsDone = recordSet('b2b_deals_done');

// Tavan: sonuçlanmış anlaşma geçmişi tavansız büyürdü (her işlem bir satır ekler, hiçbiri silinmez).
// 5.000 kapalı/iptal anlaşma yönetim paneli geçmişi için fazlasıyla yeterli; en eskiler budanır.
// Satıcı, alıcı ve teklifler ana veridir (anlaşmalar bunlara bağlıdır), bilerek tavansızdır.
// (Nesne olarak dışa açık: testler küçük bir tavanla çalışabilsin.)
export const LIMITS = { maxDoneDeals: 5000 };
const isDone = st => st === 'closed' || st === 'cancelled';
const findDeal = id => dealsOpen.get(id) || dealsDone.get(id);

// Eski kurulumlarda kayıtlar `b2b` belgesinde harita olarak duruyordu: modül yüklenirken bir kez satıra taşınır.
// (store.tx dışında: putMany kendi işlemini açar.) Haritadaki anahtar kimliktir; değerlerde de `id` vardır.
const entries = m =>
  m && typeof m === 'object' && !Array.isArray(m)
    ? Object.entries(m).map(([id, v]) => ({ ...v, id: v?.id ?? id }))
    : [];
/** @type {{ rs: ReturnType<typeof recordSet>, field: string, pick: (r: any) => boolean }[]} */
const MOVES = [
  { rs: sellers, field: 'sellers', pick: () => true },
  { rs: buyers, field: 'buyers', pick: () => true },
  { rs: offers, field: 'offers', pick: () => true },
  { rs: dealsOpen, field: 'deals', pick: r => !isDone(r.status) },
  { rs: dealsDone, field: 'deals', pick: r => isDone(r.status) },
];
for (const { rs, field, pick } of MOVES) {
  // deals alanı iki kümeye bölünür; belge alanı ancak ikincisi (done) bittikten sonra silinir.
  moveDocRows(rs.kind, 'b2b', {
    rows: d => entries(d[field]).filter(pick),
    strip: d => {
      if (field !== 'deals' || rs === dealsDone) delete d[field];
    },
  });
}

// Çok adımlı oku-değiştir-yaz dizileri tek işlemde.
const run = fn => store.tx(fn);

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
  return run(() => sellers.put(s));
}
export function registerBuyer(input) {
  const b = { id: newId('b_'), ...cleanParty(input, 'DE', 'Alıcı'), t: Date.now() };
  return run(() => buyers.put(b));
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
  return offers.all().map(view);
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
  return run(() => {
    if (!sellers.get(x.sellerId)) fail('notfound', 'Satıcı yok');
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
    return view(offers.put(o));
  });
}

// Puanlama (0-100): kategori uyumu 50, fiyat avantajı en çok 40 (tavanın altında kalan oran), teslim dahil incoterm 10.
/** @param {{ buyerId?: any, category?: any, maxUnitPrice?: any }} [o] */
export function match({ buyerId, category, maxUnitPrice } = {}) {
  const buyer = buyers.get(buyerId);
  if (!buyer) fail('notfound', 'Alıcı yok');
  const cats = category ? [str(category, 60).toLowerCase()] : buyer.categories;
  const cap = maxUnitPrice === undefined || maxUnitPrice === null ? null : toCents(maxUnitPrice);
  const out = [];
  const sellerOf = new Map();
  for (const o of offers.all()) {
    if (o.remaining <= 0) continue;
    if (!sellerOf.has(o.sellerId)) sellerOf.set(o.sellerId, sellers.get(o.sellerId));
    const seller = sellerOf.get(o.sellerId);
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
  const o = offers.get(offerId);
  if (!o) fail('notfound', 'Teklif yok');
  return quoteOf(o, posInt(qty, 'qty'));
}

/** @param {{ offerId?: any, buyerId?: any, qty?: any, invoiceParty?: any }} [o] */
export function createDeal({ offerId, buyerId, qty, invoiceParty } = {}) {
  const q = posInt(qty, 'qty');
  const party = invoiceParty === undefined ? 'platform' : invoiceParty;
  if (!INVOICE_PARTIES.includes(party)) fail('invalid', "invoiceParty 'platform' ya da 'seller' olmalı");
  return run(() => {
    const o = offers.get(offerId);
    if (!o) fail('notfound', 'Teklif yok');
    if (!buyers.get(buyerId)) fail('notfound', 'Alıcı yok');
    if (q > o.remaining) fail('conflict', `Yeterli adet yok (kalan: ${o.remaining})`);
    offers.put({ ...o, remaining: o.remaining - q });
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
    return dealsOpen.put(deal);
  });
}

export function advanceDeal(id, status) {
  return run(() => {
    const deal = findDeal(id);
    if (!deal) fail('notfound', 'Anlaşma yok');
    if (!TRANSITIONS[deal.status]?.includes(status))
      fail('invalid', `Geçersiz durum geçişi: ${deal.status} → ${status}`);
    if (status === 'cancelled') {
      const o = offers.get(deal.offerId);
      if (o) offers.put({ ...o, remaining: o.remaining + deal.qty });
    }
    const next = { ...deal, status, updated: Date.now() };
    if (isDone(status)) {
      // Sonuçlandı: açık kümeden çıkar, geçmişe taşı ve geçmişi tavanda tut.
      dealsOpen.del(id);
      dealsDone.put(next);
      dealsDone.prune(LIMITS.maxDoneDeals);
      return next;
    }
    return dealsOpen.put(next);
  });
}

export function summary() {
  // Anlaşmalar önceki davranışla aynı sırada (oluşturulma zamanı, eskiden yeniye) döner.
  const deals = [...dealsOpen.all(), ...dealsDone.all()].sort((a, b) => a.t - b.t);
  return {
    commissionPct: COMMISSION_PCT,
    sellers: sellers.all(),
    buyers: buyers.all(),
    offers: offers.all().map(view),
    deals,
    counts: {
      sellers: sellers.count(),
      buyers: buyers.count(),
      offers: offers.count(),
      deals: deals.length,
    },
  };
}

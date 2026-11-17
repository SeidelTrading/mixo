import { store } from '../lib/store.mjs';
import { money } from './pricing.mjs';
import { dict } from '../lib/safe.mjs';

// Kargo başarı skoru, otomatik etiket seçimi ve UPS kuralı (HTTP bilmez, ağ çağrısı yok; etiket basma simülasyondur).
// Firmalar belgede tablo olarak durur: yeni firma kod değişikliği olmadan addCarrier ile eklenir.
// Bölge: Alman posta kodunun ilk 2 hanesi (plz2). Sayaçlar bölge × firma × sonuç olarak tutulur.
export const MIN_SAMPLES = 20; // bölgede bir firmanın skoruna güvenmek için gereken en az teslimat sayısı (tek yer)
export const LOG_MAX = 1000; // seçim günlüğü sınırı; taşarsa en eski kayıt atılır
const LATE_WEIGHT = 0.5; // geç teslim yarım başarı sayılır, kayıp sıfır
const UPS_ID = 'ups';
const ID_RE = /^[a-z0-9_-]{1,20}$/;
const OUTCOMES = ['delivered', 'lost', 'late'];
const DOC = 'shipping';

// Hata türleri: invalid (girdi), notfound. Yönlendirme katmanı HTTP koduna çevirir.
export class ShippingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new ShippingError(code, msg);
};

const fresh = () => ({
  carriers: [
    { id: 'dhl', name: 'DHL', enabled: true, handoverFee: 0 },
    { id: 'gls', name: 'GLS', enabled: true, handoverFee: 0 },
    { id: 'ups', name: 'UPS', enabled: true, handoverFee: 1.5 },
  ],
  defaultCarrier: 'dhl',
  // Sunumda tutar eşiği verilmedi: 250 € VARSAYILAN bir değerdir, yönetici değiştirebilir.
  upsMinTotal: 250,
  stats: {},
  log: [],
});
const load = () => {
  const d = store.doc(DOC, null);
  if (!d || !Array.isArray(d.carriers)) return fresh();
  // stats: bölge → firma → sayaç; her iki düzey de prototipsiz (firma kimliği 'constructor' gibi olabilir)
  const stats = dict(d.stats);
  for (const z of Object.keys(stats)) stats[z] = dict(stats[z]);
  return { ...fresh(), ...d, stats, log: Array.isArray(d.log) ? d.log : [] };
};
const save = d => store.saveDoc(DOC, d);
// Oku-değiştir-yaz dizisi tek işlemde (kayıp güncelleme olmasın). store.tx iç içe açılamaz.
const run = fn => store.tx(fn);

export function plz2(zip) {
  const z = String(zip ?? '').trim();
  if (!/^\d{5}$/.test(z) || z.startsWith('00'))
    fail('invalid', 'Geçersiz posta kodu (5 haneli Alman posta kodu olmalı)');
  return z.slice(0, 2);
}

/* ───────── firmalar ───────── */
const cleanCarrier = (o, prev) => {
  if (!o || typeof o !== 'object') fail('invalid', 'Firma nesnesi gerekli');
  const id = String(o.id ?? prev?.id ?? '')
    .trim()
    .toLowerCase();
  if (!ID_RE.test(id)) fail('invalid', 'Geçersiz firma kimliği');
  const name = String(o.name ?? prev?.name ?? id)
    .trim()
    .slice(0, 40);
  if (!name) fail('invalid', 'Firma adı gerekli');
  const fee = o.handoverFee ?? prev?.handoverFee ?? 0;
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0 || fee > 100)
    fail('invalid', 'handoverFee 0 ile 100 arasında sayı olmalı');
  return { id, name, enabled: (o.enabled ?? prev?.enabled ?? true) !== false, handoverFee: money(fee) };
};

export const listCarriers = () => load().carriers;

export function addCarrier(o) {
  const c = cleanCarrier(o);
  return run(() => {
    const d = load();
    if (d.carriers.some(x => x.id === c.id)) fail('invalid', `Firma zaten var: ${c.id}`);
    d.carriers.push(c);
    save(d);
    return c;
  });
}

export function setCarrier(id, patch) {
  return run(() => {
    const d = load();
    const i = d.carriers.findIndex(x => x.id === String(id ?? '').toLowerCase());
    if (i < 0) fail('notfound', 'Firma yok');
    const c = cleanCarrier({ ...patch, id: d.carriers[i].id }, d.carriers[i]);
    d.carriers[i] = c;
    save(d);
    return c;
  });
}

export function setConfig(cfg) {
  const { upsMinTotal, defaultCarrier } = cfg || {};
  return run(() => {
    const d = load();
    if (upsMinTotal !== undefined) {
      if (typeof upsMinTotal !== 'number' || !Number.isFinite(upsMinTotal) || upsMinTotal < 0)
        fail('invalid', 'upsMinTotal negatif olmayan sayı olmalı');
      d.upsMinTotal = money(upsMinTotal);
    }
    if (defaultCarrier !== undefined) {
      if (!d.carriers.some(x => x.id === defaultCarrier)) fail('notfound', 'Varsayılan firma yok');
      d.defaultCarrier = defaultCarrier;
    }
    save(d);
    return { upsMinTotal: d.upsMinTotal, defaultCarrier: d.defaultCarrier };
  });
}

/* ───────── sayaçlar ve skor ───────── */
export function recordDelivery(rec) {
  const { carrier, zip, outcome } = rec || {};
  const z = plz2(zip);
  if (!OUTCOMES.includes(outcome)) fail('invalid', 'outcome delivered, lost ya da late olmalı');
  return run(() => {
    const d = load();
    if (!d.carriers.some(x => x.id === carrier)) fail('notfound', 'Firma yok');
    const zone = (d.stats[z] ??= dict());
    const cell = (zone[carrier] ??= { delivered: 0, lost: 0, late: 0 });
    cell[outcome]++;
    save(d);
    return { zone: z, carrier, ...cell };
  });
}

function scoreFrom(cell) {
  const n = cell ? cell.delivered + cell.lost + cell.late : 0;
  const score = n ? (cell.delivered + LATE_WEIGHT * cell.late) / n : 0;
  return {
    score: Math.round(score * 1000) / 1000,
    samples: n,
    reliable: n >= MIN_SAMPLES,
    deliveredRate: n ? Math.round((cell.delivered / n) * 1000) / 1000 : 0,
    lostRate: n ? Math.round((cell.lost / n) * 1000) / 1000 : 0,
  };
}
const scoreIn = (d, carrier, z) => scoreFrom(d.stats[z]?.[carrier]);

export function scoreOf(carrier, zip) {
  const z = plz2(zip);
  const d = load();
  if (!d.carriers.some(x => x.id === carrier)) fail('notfound', 'Firma yok');
  const { score, samples, reliable } = scoreIn(d, carrier, z);
  return { score, samples, reliable };
}

/* ───────── seçim ───────── */
const pct = s => `%${Math.round(s * 100)}`;

function decide(d, { zip, orderTotal, businessAddress }) {
  const z = plz2(zip);
  const enabled = d.carriers.filter(c => c.enabled);
  if (!enabled.length) fail('invalid', 'Etkin kargo firması yok');
  const rows = enabled.map(c => ({ c, ...scoreIn(d, c.id, z) }));
  // Güvenilir veriye sahip firmalar, skora göre (eşitlikte tablo sırası) sıralı
  const ranked = rows.filter(r => r.reliable).sort((a, b) => b.score - a.score);
  const summary = ranked.map(r => `${r.c.name} ${pct(r.score)} (${r.samples} teslimat)`).join(', ');
  const total = Number.isFinite(orderTotal) ? orderTotal : 0;
  const business = businessAddress === true;
  const big = total > d.upsMinTotal;

  // (1) UPS kuralı: şirket adresi ya da yüksek tutar; UPS bölgede güvenilir ve ilk ikide olmalı
  const ups = enabled.find(c => c.id === UPS_ID);
  if (ups && (business || big)) {
    const rank = ranked.findIndex(r => r.c.id === UPS_ID);
    if (rank >= 0 && rank <= 1) {
      const why = business
        ? 'şirket adresine teslim'
        : `sipariş tutarı ${money(total)} € (eşik ${d.upsMinTotal} €)`;
      return {
        carrier: UPS_ID,
        extraCost: ups.handoverFee,
        reason: `Bölge ${z}: ${why}; UPS bu bölgede ${rank + 1}. sırada (${summary}), el teslimi ek ücreti ${ups.handoverFee} € eklendi.`,
      };
    }
  }
  // (2) skoru en yüksek güvenilir firma
  if (ranked.length)
    return {
      carrier: ranked[0].c.id,
      extraCost: 0,
      reason: `Bölge ${z}: en yüksek başarı skoru ${ranked[0].c.name} (${summary}).`,
    };
  // (3) güvenilir veri yok: varsayılan firma
  const def = enabled.find(c => c.id === d.defaultCarrier) || enabled[0];
  return {
    carrier: def.id,
    extraCost: 0,
    reason: `Bölge ${z}: güvenilir veri yok (en az ${MIN_SAMPLES} teslimat gerekir), varsayılan firma ${def.name} seçildi.`,
  };
}

export const chooseCarrier = q => decide(load(), q || {});

export function labelFor(order) {
  const o = order || {};
  const cu = o.customer || {};
  const { r, zip } = run(() => {
    const d = load();
    const r = decide(d, {
      zip: cu.zip ?? o.zip,
      orderTotal: o.total,
      businessAddress: cu.business === true || o.businessAddress === true,
    });
    const zip = String(cu.zip ?? o.zip).trim();
    d.log.push({
      t: Date.now(),
      orderId: o.id ?? null,
      zip,
      carrier: r.carrier,
      reason: r.reason,
      extraCost: r.extraCost,
    });
    if (d.log.length > LOG_MAX) d.log.splice(0, d.log.length - LOG_MAX);
    save(d);
    return { r, zip };
  });
  console.log(`kargo: sipariş ${o.id ?? '-'} → ${r.carrier}; ${r.reason}`);
  return { ...r, zip };
}

export const selectionLog = (limit = 100) => {
  const n = Math.max(1, Math.min(LOG_MAX, Number(limit) || 100));
  return load().log.slice(-n).reverse();
};

export function stats() {
  const d = load();
  const zones = Object.keys(d.stats)
    .sort()
    .map(z => ({
      zone: z,
      carriers: Object.fromEntries(d.carriers.map(c => [c.id, scoreIn(d, c.id, z)])),
    }));
  return {
    minSamples: MIN_SAMPLES,
    upsMinTotal: d.upsMinTotal,
    defaultCarrier: d.defaultCarrier,
    carriers: d.carriers,
    zones,
  };
}

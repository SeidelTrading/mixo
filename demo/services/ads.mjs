import { store } from '../lib/store.mjs';
import { EMAIL_RE, lintText } from '../marketing/shared.mjs';
import { dict } from '../lib/safe.mjs';
import { audit } from './audit.mjs';

// Reklam ve paylaşım ajanı (HTTP bilmez): K-10 Meta/Instagram paylaşımı, K-11 Google Ads kelime listesi, K-12 retargeting.
// SİMÜLASYON: Meta ve Google Ads'e GERÇEK AĞ ÇAĞRISI YOKTUR. Paylaşım, kelime değişikliği ve e-posta metni yalnız
// 'ads' belgesine yazılır / döndürülür; canlıya bağlanınca bu dosyadaki kayıt noktaları API çağrısına dönüşür.
// Durum tek belge: store.doc('ads') (yeni tablo yok).

// Varsayım: sunumda sayı verilmedi. Hesap kapanmasın diye muhafazakâr varsayılan: günde 4, saatte 1 paylaşım (kanal başına).
// Tavanlar belgedeki `limits` alanından değiştirilebilir.
export const DEFAULT_LIMITS = { perDay: 4, perHour: 1 };
// Varsayım: ilk alışveriş indirimi yüzdesi (belgedeki `appDiscountPercent` ile değişir).
export const DEFAULT_APP_DISCOUNT = 10;
const HOUR = 36e5,
  DAY = 864e5,
  MAX_POSTS = 500;

// Hata türleri (PoolError deseni): invalid (girdi), notfound, conflict (kural/ön koşul çakışması), limit (paylaşım tavanı).
export class AdsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new AdsError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const lc = s => s.toLocaleLowerCase('tr');

function load() {
  const d = store.doc('ads', {});
  const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  return {
    limits: { ...DEFAULT_LIMITS, ...(o.limits || {}) },
    appDiscountPercent: o.appDiscountPercent ?? DEFAULT_APP_DISCOUNT,
    authorizedBrands: Array.isArray(o.authorizedBrands) ? o.authorizedBrands : [],
    posts: Array.isArray(o.posts) ? o.posts : [],
    // kampanya adı kullanıcıdan gelir: prototipsiz harita (`__proto__` / `constructor` sıradan ad olur)
    campaigns: dict(o.campaigns),
  };
}
const save = d => store.saveDoc('ads', d);
// Oku-değiştir-yaz dizisi tek işlemde (kayıp güncelleme olmasın). store.tx iç içe açılamaz: fn içinde başka tx açılmaz.
const run = fn => store.tx(fn);

/* ───────── K-10: paylaşım sıklığı ve marka kapısı ───────── */

const cleanChannel = ch => {
  const c = lc(str(ch, 40));
  if (!/^[a-z0-9._-]{1,40}$/.test(c)) fail('invalid', 'Geçersiz kanal');
  return c;
};

function counts(d, channel, now) {
  const mine = d.posts.filter(p => p.channel === channel);
  return {
    day: mine.filter(p => now - p.t < DAY && p.t <= now).length,
    hour: mine.filter(p => now - p.t < HOUR && p.t <= now).length,
  };
}

// Günlük ve saatlik tavan denetimi (yazmaz). ok:false ise reason açıklar.
export function canPost({ channel, now = Date.now() } = /** @type {any} */ ({})) {
  const ch = cleanChannel(channel);
  const d = load();
  const c = counts(d, ch, now);
  const { perDay, perHour } = d.limits;
  let reason = null;
  if (c.day >= perDay) reason = `Günlük paylaşım tavanı doldu (${perDay})`;
  else if (c.hour >= perHour) reason = `Saatlik paylaşım tavanı doldu (${perHour})`;
  return { ok: !reason, reason, day: c.day, hour: c.hour, perDay, perHour };
}

const brandKey = b => lc(str(b, 80));

// Marka yetkisi kapısı. Marka yetkisi olmadan paylaşım platform kural ihlalidir; bu yüzden yetkisiz markayı
// gizleyerek / markasız göstermek diye bir yol YOKTUR: yetkili listede değilse paylaşım reddedilir.
export function brandAllowed(brand) {
  const k = brandKey(brand);
  return !!k && load().authorizedBrands.some(b => b.key === k);
}

// Yetki kaydı: insan kararıdır (ör. marka sahibiyle yazılı izin); reference kanıt/sözleşme notudur.
export function authorizeBrand(brand, { reference } = /** @type {any} */ ({})) {
  const name = str(brand, 80),
    key = brandKey(brand);
  if (!key) fail('invalid', 'Marka gerekli');
  const ref = str(reference, 300);
  if (!ref) fail('invalid', 'Yetki kanıtı (reference) gerekli');
  return run(() => {
    const d = load();
    const prev = d.authorizedBrands.find(b => b.key === key);
    if (prev) {
      prev.reference = ref;
      prev.name = name;
    } else d.authorizedBrands.push({ key, name, reference: ref, t: Date.now() });
    save(d);
    // Marka yetkisi yasal etkilidir (yetkisiz paylaşım platform kural ihlali): kimin, hangi kanıtla verdiği kayda geçer.
    audit('Reklam', `Marka yetkisi verildi: ${name} (kanıt: ${ref.slice(0, 80)})`);
    return { brand: name, reference: ref, authorizedBrands: d.authorizedBrands.map(b => b.name) };
  });
}

// Paylaşımı kaydeder (simülasyon: Meta'ya gönderilmez). Sıra: girdi → marka kapısı → tavan.
export function recordPost({ channel, text, brand, now = Date.now() } = /** @type {any} */ ({})) {
  const ch = cleanChannel(channel);
  const body = str(text, 2200);
  if (!body) fail('invalid', 'Paylaşım metni gerekli');
  if (!brandKey(brand)) fail('invalid', 'Marka gerekli');
  if (!brandAllowed(brand))
    fail(
      'conflict',
      `"${str(brand, 80)}" için marka yetkisi kaydı yok; paylaşım platform kurallarını ihlal eder`,
    );
  // Tavan denetimi ile yazma aynı işlemde: iki eşzamanlı paylaşım tavanı birlikte aşamaz.
  return run(() => {
    const gate = canPost({ channel: ch, now });
    if (!gate.ok) fail('limit', gate.reason);
    const d = load();
    const post = { t: now, channel: ch, text: body, brand: str(brand, 80) };
    d.posts.push(post);
    if (d.posts.length > MAX_POSTS) d.posts.splice(0, d.posts.length - MAX_POSTS);
    save(d);
    // Uyarı verir, engellemez (Almanya UWG kalıpları).
    return { ok: true, post, warnings: lintText(body), simulated: true };
  });
}

/* ───────── K-11: Google Ads anahtar / negatif kelime (simülasyon) ───────── */

const cleanCampaign = c => {
  const n = lc(str(c, 80));
  if (!n) fail('invalid', 'Kampanya gerekli');
  return n;
};
const cleanWord = w => {
  const n = lc(str(w, 80)).replace(/\s+/g, ' ');
  if (!n) fail('invalid', 'Kelime boş olamaz');
  return n;
};

export function keywords({ campaign } = /** @type {any} */ ({})) {
  const name = cleanCampaign(campaign);
  const k = load().campaigns[name];
  if (!k) fail('notfound', 'Kampanya yok');
  return { campaign: name, positive: [...k.positive], negative: [...k.negative] };
}

export function addKeyword(campaign, word, { negative = false } = /** @type {any} */ ({})) {
  const name = cleanCampaign(campaign),
    w = cleanWord(word);
  return run(() => {
    const d = load();
    const k = (d.campaigns[name] ??= { positive: [], negative: [] });
    const [mine, other] = negative ? [k.negative, k.positive] : [k.positive, k.negative];
    // Aynı kelime iki listede birden olamaz: pozitif ile negatif birbirini boşa çıkarır.
    if (other.includes(w)) fail('conflict', `"${w}" zaten ${negative ? 'pozitif' : 'negatif'} listede`);
    const added = !mine.includes(w);
    if (added) mine.push(w);
    save(d);
    return { campaign: name, word: w, negative: !!negative, added, simulated: true };
  });
}

export function removeKeyword(campaign, word, { negative = false } = /** @type {any} */ ({})) {
  const name = cleanCampaign(campaign),
    w = cleanWord(word);
  return run(() => {
    const d = load();
    const list = d.campaigns[name]?.[negative ? 'negative' : 'positive'];
    if (!list || !list.includes(w)) fail('notfound', `"${w}" listede yok`);
    list.splice(list.indexOf(w), 1);
    save(d);
    return { campaign: name, word: w, negative: !!negative, removed: true, simulated: true };
  });
}

const L = '(?<![\\p{L}\\d])';
const ADD_RE = new RegExp(`${L}(ekle\\p{L}*|ilave\\p{L}*)`, 'iu');
const DEL_RE = new RegExp(`${L}(kaldır\\p{L}*|çıkar\\p{L}*|sil\\p{L}*)`, 'iu');
const DEICTIC = new Set(['şu', 'bu', 'o', 'ilgili', 'aktif', 'her', 'tüm', 'hangi', 'bir', 'diğer', 'son']);

// Serbest metin komutu. Belirsizse (kampanya, kelime, ekle/kaldır ya da liste türü seçilemiyorsa) HİÇBİR ŞEY yapmaz.
// Tahmin yok: "şu kampanya" gibi gösterme sözcükleri kampanya sayılmaz; çağıran `campaign` verirse o kullanılır.
export function applyCommand(text, { campaign } = /** @type {any} */ ({})) {
  const t = lc(str(text, 300));
  if (!t) return { applied: false, reason: 'Komut boş' };
  const add = ADD_RE.test(t),
    del = DEL_RE.test(t);
  if (add === del) return { applied: false, reason: 'Ekle mi kaldır mı olduğu belirsiz' };
  const neg = /negatif/.test(t),
    pos = /pozitif|anahtar/.test(t);
  if (neg && pos) return { applied: false, reason: 'Pozitif mi negatif mi olduğu belirsiz' };
  if (!neg && !pos) return { applied: false, reason: 'Liste türü (negatif / pozitif) belirtilmemiş' };
  let camp = str(campaign, 80);
  if (!camp) {
    const m = new RegExp(`${L}([\\p{L}\\d_-]+)\\s+kampanya\\p{L}*`, 'iu').exec(t);
    if (m && !DEICTIC.has(m[1])) camp = m[1];
  }
  if (!camp) return { applied: false, reason: 'Kampanya belirsiz' };
  const wm =
    /["“”']([^"“”']+)["“”']/.exec(t) ||
    new RegExp(`${L}olarak\\s+([\\p{L}\\d_-]+)`, 'iu').exec(t) ||
    new RegExp(
      `${L}([\\p{L}\\d_-]+)\\s+(?:negatif\\s+|pozitif\\s+)?(?:anahtar\\s+)?kelime(?:si|sini)`,
      'iu',
    ).exec(t);
  let word = wm?.[1];
  if (!word || ['negatif', 'pozitif', 'anahtar', 'kelime'].includes(word) || /^kampanya/.test(word))
    return { applied: false, reason: 'Kelime belirsiz' };
  word = cleanWord(word);
  try {
    const opts = { negative: neg };
    const r = add ? addKeyword(camp, word, opts) : removeKeyword(camp, word, opts);
    return { applied: true, action: add ? 'add' : 'remove', ...r };
  } catch (e) {
    if (e instanceof AdsError) return { applied: false, reason: e.message, code: e.code };
    throw e;
  }
}

/* ───────── K-12: retargeting ───────── */

// Alıcı listesi: kind 'cart' (sepet terk) | 'repeat' (eski müşteri).
// ÇİFT ONAY KAPISI: bu fonksiyon alıcıyı listeye ALMADAN önce her adresi marketing/consent.mjs'in consentOk
// kapısından (mk.consentOk) geçirir. Onaysız adres listeye girmez, skippedNoConsent sayılır. Bu kural BAŞKA yerde tekrarlanmaz;
// listeyi üreten tek yer burasıdır.
export async function audience({ kind } = /** @type {any} */ ({})) {
  if (kind !== 'cart' && kind !== 'repeat') fail('invalid', "kind 'cart' ya da 'repeat' olmalı");
  const { mk } = await import('../services/channels.mjs');
  const cands = new Map();
  if (kind === 'cart') {
    // Varsayım: sipariş verilince sepet silinir (orderPlaced), kalan sepet terk edilmiş sayılır.
    const carts = store.doc('marketing', {})?.carts || {};
    for (const [email, c] of Object.entries(carts))
      cands.set(email.toLowerCase(), { email: email.toLowerCase(), name: c?.name || '', t: c?.t || 0 });
  } else {
    const { customers } = await import('../services/orders.mjs');
    // Varsayım: eski müşteri = en az bir geçerli (iptal/doğrulanmamış olmayan) siparişi olan adres.
    for (const c of customers())
      if (c.spent > 0 && EMAIL_RE.test(String(c.email)))
        cands.set(String(c.email).toLowerCase(), {
          email: String(c.email).toLowerCase(),
          name: c.name,
          t: c.last,
        });
  }
  const recipients = [];
  let skippedNoConsent = 0;
  for (const r of cands.values()) {
    if (!mk.consentOk(r.email)) {
      skippedNoConsent++;
      continue;
    }
    recipients.push(r);
  }
  return { kind, recipients, skippedNoConsent };
}

// İlk alışveriş indirimiyle mobil uygulama teşviki (simülasyon: gönderilmez, metin döner). Yalnız onaylı adrese.
export async function appPromo({ email } = /** @type {any} */ ({})) {
  const to = str(email, 200).toLowerCase();
  if (!EMAIL_RE.test(to)) fail('invalid', 'Geçersiz e-posta');
  const { mk } = await import('../services/channels.mjs');
  if (!mk.consentOk(to)) fail('conflict', 'Adres çift onaylı değil; gönderim yapılamaz');
  const pct = load().appDiscountPercent;
  return {
    to,
    subject: 'Unsere App: Rabatt auf Ihren ersten Einkauf',
    // Pazarlama e-postasında abonelikten çıkma bağlantısı zorunludur (UWG/GDPR): yer tutucu değil,
    // adresin kendisine bağlı imzalı ve çalışan bağlantı (bkz. marketing/consent.mjs unsubscribeUrl).
    body: `Hallo,\n\nladen Sie unsere Mobile-App herunter: Beim ersten Einkauf in der App erhalten Sie ${pct} % Rabatt.\n\nSie erhalten diese E-Mail, weil Sie Ihre Adresse bestätigt haben.\nAbmelden: ${mk.unsubscribeUrl(to)}`,
    simulated: true,
  };
}

/* ───────── durum ───────── */

export function status({ now = Date.now() } = /** @type {any} */ ({})) {
  const d = load();
  const channels = [...new Set(d.posts.map(p => p.channel))];
  return {
    limits: d.limits,
    authorizedBrands: d.authorizedBrands.map(b => ({ brand: b.name, reference: b.reference, t: b.t })),
    campaigns: Object.entries(d.campaigns).map(([name, k]) => ({
      name,
      positive: k.positive.length,
      negative: k.negative.length,
    })),
    channels: channels.map(ch => ({ channel: ch, ...counts(d, ch, now) })),
    simulated: true,
  };
}

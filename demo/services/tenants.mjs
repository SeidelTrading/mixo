import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { dict } from '../lib/safe.mjs';
import { audit } from './audit.mjs';

// Çok kiracılılık (K-07) ve entegrasyon anahtarları (K-09) iş kuralları (HTTP bilmez).
// Durum iki belgede durur: 'tenants' (kiracılar) ve 'tenant_keys' (şifreli anahtarlar). Anahtarlar kiracı kaydından ayrı tutulur ki
// getTenant / listTenants yanıtı hiçbir koşulda şifreli veriyi bile taşımasın.

// Paket limitleri (K-08'in temeli): companies = aynı hesap (account) altında açılabilecek şirket, shops = bir şirketin mağaza sayısı.
export const PLAN_LIMITS = {
  bronze: { companies: 1, shops: 3 },
  silver: { companies: 3, shops: 10 },
  gold: { companies: 10, shops: 50 },
};

const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const USER_RE = /^[\w.@-]{1,80}$/;
const MARKET_RE = /^[a-z0-9._-]{1,40}$/i;

// Hata türleri: invalid (girdi), notfound, conflict (aynı kayıt var), limit (paket sınırı). Yönlendirme katmanı HTTP koduna çevirir.
export class TenantError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new TenantError(code, msg);
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const plain = v => JSON.parse(JSON.stringify(v));
const load = () => dict(store.doc('tenants', {}));
// kiracı → sağlayıcı → kayıt; sağlayıcı adı 'constructor' gibi olabildiği için her iki düzey prototipsiz
const loadKeys = () => {
  const keys = dict(store.doc('tenant_keys', {}));
  for (const k of Object.keys(keys)) keys[k] = dict(keys[k]);
  return keys;
};
// Oku-değiştir-yaz dizisi tek işlemde (kayıp güncelleme olmasın). store.tx iç içe açılamaz: fn içinde başka tx açılmaz.
const run = fn => store.tx(fn);
const cleanPlan = p => {
  if (!Object.hasOwn(PLAN_LIMITS, p)) fail('invalid', 'plan bronze, silver ya da gold olmalı');
  return p;
};
const cleanProvider = p => {
  const v = str(p, 40).toLowerCase();
  if (!PROVIDER_RE.test(v)) fail('invalid', 'Geçersiz entegrasyon adı');
  return v;
};
const must = (d, id) => {
  const t = typeof id === 'string' && Object.hasOwn(d, id) ? d[id] : null;
  if (!t) fail('notfound', 'Kiracı yok');
  return t;
};

/* ───────── kiracılar ───────── */

// createTenant({ name, plan, account? }): account verilirse aynı hesaptaki şirket sayısı paketin şirket limitini aşamaz.
export function createTenant({ name, plan, account } = /** @type {any} */ ({})) {
  const nm = str(name, 120);
  if (!nm) fail('invalid', 'name gerekli');
  const pl = cleanPlan(plan);
  const acc = str(account, 80);
  return run(() => {
    const d = load();
    const all = Object.values(d);
    if (all.some(t => t.name.toLowerCase() === nm.toLowerCase())) fail('conflict', 'Bu adda bir kiracı var');
    if (acc && all.filter(t => t.account === acc).length >= PLAN_LIMITS[pl].companies)
      fail('limit', `${pl} paketinde en fazla ${PLAN_LIMITS[pl].companies} şirket açılabilir`);
    const id = 't_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const t = { id, name: nm, plan: pl, created: Date.now(), shops: [], users: [], disabled: false };
    if (acc) t.account = acc;
    d[id] = t;
    store.saveDoc('tenants', d);
    return plain(t);
  });
}

export function getTenant(id) {
  const d = load();
  return typeof id === 'string' && Object.hasOwn(d, id) ? plain(d[id]) : null;
}

export const listTenants = () => Object.values(load()).map(plain);

// updateTenant(id, { name?, plan?, disabled? }): pakit düşürülürken mevcut mağaza sayısı yeni sınırı aşıyorsa limit hatası.
export function updateTenant(id, patch) {
  return run(() => {
    const d = load();
    const t = must(d, id);
    const p = patch && typeof patch === 'object' ? patch : {};
    if (p.name !== undefined) {
      const nm = str(p.name, 120);
      if (!nm) fail('invalid', 'name boş olamaz');
      if (Object.values(d).some(x => x.id !== t.id && x.name.toLowerCase() === nm.toLowerCase()))
        fail('conflict', 'Bu adda bir kiracı var');
      t.name = nm;
    }
    if (p.plan !== undefined) {
      const pl = cleanPlan(p.plan);
      if (t.shops.length > PLAN_LIMITS[pl].shops)
        fail('limit', `${pl} paketi en fazla ${PLAN_LIMITS[pl].shops} mağazaya izin verir`);
      t.plan = pl;
    }
    if (p.disabled !== undefined) {
      if (typeof p.disabled !== 'boolean') fail('invalid', 'disabled true ya da false olmalı');
      t.disabled = p.disabled;
    }
    store.saveDoc('tenants', d);
    return plain(t);
  });
}

export function addShop(tenantId, { name, market } = /** @type {any} */ ({})) {
  return run(() => {
    const d = load();
    const t = must(d, tenantId);
    const nm = str(name, 120),
      mk = str(market, 40).toLowerCase();
    if (!nm) fail('invalid', 'name gerekli');
    if (!MARKET_RE.test(mk)) fail('invalid', 'Geçersiz pazar yeri');
    if (t.shops.length >= PLAN_LIMITS[t.plan].shops)
      fail('limit', `${t.plan} paketinde en fazla ${PLAN_LIMITS[t.plan].shops} mağaza açılabilir`);
    if (t.shops.some(s => s.market === mk && s.name.toLowerCase() === nm.toLowerCase()))
      fail('conflict', 'Bu mağaza zaten var');
    const shop = { id: 's_' + crypto.randomUUID().replaceAll('-', '').slice(0, 10), name: nm, market: mk };
    t.shops.push(shop);
    store.saveDoc('tenants', d);
    return plain(shop);
  });
}

export function removeShop(tenantId, shopId) {
  return run(() => {
    const d = load();
    const t = must(d, tenantId);
    const i = t.shops.findIndex(s => s.id === shopId);
    if (i < 0) fail('notfound', 'Mağaza yok');
    t.shops.splice(i, 1);
    store.saveDoc('tenants', d);
    return plain(t);
  });
}

/* ───────── kullanıcı → kiracı ───────── */

// Bir kullanıcı tek kiracıya bağlıdır; başka kiracıya atanırsa eski bağ kalkar.
export function assignUser(tenantId, username) {
  const u = str(username, 80);
  if (!USER_RE.test(u)) fail('invalid', 'Geçersiz kullanıcı adı');
  return run(() => {
    const d = load();
    const t = must(d, tenantId);
    for (const x of Object.values(d)) x.users = x.users.filter(n => n !== u);
    t.users.push(u);
    store.saveDoc('tenants', d);
    return plain(t);
  });
}

export const tenantOfUser = username => {
  const t = Object.values(load()).find(x => x.users.includes(username));
  return t ? plain(t) : null;
};

// Kullanıcının görebileceği kiracı kimliği (bağ yoksa null). 'yonetici' için hepsini görme kararı çağıranındır.
export const scopeOf = username => tenantOfUser(username)?.id ?? null;

/* ───────── entegrasyon anahtarları (K-09) ───────── */

// AES-256-GCM; şifreleme anahtarı SESSION_SECRET'tan scrypt ile türetilir (gizli değer değişmedikçe önbellekte tutulur).
let derived = null;
const encKey = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) fail('invalid', 'SESSION_SECRET tanımlı değil; anahtar saklanamaz');
  if (!derived || derived.secret !== secret)
    derived = { secret, key: crypto.scryptSync(secret, 'mixo-tenant-keys-v1', 32) };
  return derived.key;
};
const aad = (tenantId, provider) => Buffer.from(`${tenantId}|${provider}`);
const encrypt = (plainText, tenantId, provider) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  c.setAAD(aad(tenantId, provider));
  const data = Buffer.concat([c.update(plainText, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
};
const decrypt = (rec, tenantId, provider) => {
  const dc = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(rec.iv, 'base64'));
  dc.setAAD(aad(tenantId, provider));
  dc.setAuthTag(Buffer.from(rec.tag, 'base64'));
  return Buffer.concat([dc.update(Buffer.from(rec.data, 'base64')), dc.final()]).toString('utf8');
};
const goodShape = k => typeof k === 'string' && k.length >= 8 && k.length <= 512 && !/\s/.test(k);

export function setKey(tenantId, provider, apiKey) {
  must(load(), tenantId);
  const pv = cleanProvider(provider);
  if (!goodShape(apiKey)) fail('invalid', 'Anahtar 8-512 karakter olmalı ve boşluk içermemeli');
  return run(() => {
    must(load(), tenantId);
    const keys = loadKeys();
    keys[tenantId] ||= dict();
    keys[tenantId][pv] = {
      ...encrypt(apiKey, tenantId, pv),
      added: Date.now(),
      last4: apiKey.slice(-4),
      active: true,
    };
    store.saveDoc('tenant_keys', keys);
    // Anahtar DEĞERİ asla günlüğe yazılmaz; yalnız kimin hangi sağlayıcı için anahtar koyduğu.
    audit('Kiracı', `Entegrasyon anahtarı tanımlandı: ${tenantId} / ${pv} (…${apiKey.slice(-4)})`);
    return { provider: pv, added: keys[tenantId][pv].added, last4: keys[tenantId][pv].last4, active: true };
  });
}

// Yalnız sunucu içi kullanım: çözülmüş anahtar. Yok, iptal edilmiş ya da çözülemiyorsa null.
export function getKey(tenantId, provider) {
  const rec = loadKeys()[tenantId]?.[String(provider).toLowerCase()];
  if (!rec || !rec.active) return null;
  try {
    return decrypt(rec, tenantId, String(provider).toLowerCase());
  } catch {
    return null;
  }
}

// Anahtar değeri DÖNMEZ.
export function listKeys(tenantId) {
  const m = loadKeys()[tenantId] || {};
  return Object.entries(m).map(([provider, r]) => ({
    provider,
    added: r.added,
    last4: r.last4,
    active: r.active,
  }));
}

// İptalde şifreli veri silinir; kayıt (provider, added, last4) etkin değil olarak kalır.
export function revokeKey(tenantId, provider) {
  const pv = cleanProvider(provider);
  return run(() => {
    const keys = loadKeys();
    const rec = keys[tenantId]?.[pv];
    if (!rec) fail('notfound', 'Anahtar yok');
    keys[tenantId][pv] = { iv: '', tag: '', data: '', added: rec.added, last4: rec.last4, active: false };
    store.saveDoc('tenant_keys', keys);
    // Anahtar DEĞERİ asla günlüğe yazılmaz; yalnız hangi kiracının hangi sağlayıcı anahtarının iptal edildiği.
    audit('Kiracı', `Entegrasyon anahtarı iptal edildi: ${tenantId} / ${pv} (…${rec.last4})`);
    return { provider: pv, added: rec.added, last4: rec.last4, active: false };
  });
}

// Ağ çağrısı yok: yalnız anahtar var mı, çözülüyor mu, biçimi sağlıklı mı.
export function testKey(tenantId, provider) {
  const rec = loadKeys()[tenantId]?.[String(provider).toLowerCase()];
  if (!rec) return { ok: false, reason: 'Anahtar tanımlı değil' };
  if (!rec.active) return { ok: false, reason: 'Anahtar iptal edilmiş' };
  const k = getKey(tenantId, provider);
  if (k === null) return { ok: false, reason: 'Anahtar çözülemedi' };
  if (!goodShape(k)) return { ok: false, reason: 'Anahtar biçimi geçersiz' };
  return { ok: true };
}

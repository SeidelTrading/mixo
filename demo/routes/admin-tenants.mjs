import { send } from '../lib/http.mjs';
import { logChange, saveSettings, settings } from '../services/settings.mjs';
import { assertScope, filterScope } from '../services/scope.mjs';
import {
  TenantError,
  addShop,
  assignUser,
  createTenant,
  getTenant,
  listKeys,
  listTenants,
  removeShop,
  revokeKey,
  setKey,
  testKey,
  updateTenant,
} from '../services/tenants.mjs';

// Kiracı uçları: liste, tek kayıt, create, update, shop, user, key (yazma uçları POST).
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Anahtar değeri hiçbir yanıtta ve hiçbir log satırında geçmez: yanıtlar yalnız listKeys özetini (provider, added, last4, active) taşır.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409, limit: 409 };
const ID_RE = /^[\w-]{1,40}$/;
const WRITES = new Set(['create', 'update', 'shop', 'user', 'key', 'origin']);
const MARKET_RE = /^[a-z0-9._-]{1,40}$/i;
const str = v =>
  String(v ?? '')
    .trim()
    .slice(0, 80);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);
const withKeys = t => ({ ...t, keys: listKeys(t.id) });

// Kiracı kapsamı (services/scope.mjs): 'yonetici' tüm kiracıları görür, diğer roller yalnız kendi kiracısını.
// create/update/key/user uçları ayrıca handler.mjs'teki ADMIN_ONLY tablosuyla yöneticiye kısıtlıdır.
export async function adminTenantRoutes(c) {
  const { req, res, p, body, me } = c;
  const m = /^\/api\/admin\/tenants(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      const b = body && typeof body === 'object' ? body : {};
      // Bu vitrinin kimliği: bundan sonraki siparişlerin hangi kiracıya, mağazaya ve kanala yazılacağı.
      // Geçmiş siparişleri DEĞİŞTİRMEZ (satışın nerede olduğu sonradan yeniden yazılamaz).
      if (sub === 'origin') {
        const o = settings.origin || {};
        const tenantId = b.tenantId === null || b.tenantId === '' ? null : str(b.tenantId);
        const shop = b.shop === undefined ? o.shop : str(b.shop);
        const market = b.market === undefined ? o.market : str(b.market);
        if (!shop || !market) return bad(res, 'shop ve market boş olamaz');
        if (!MARKET_RE.test(market)) return bad(res, 'market biçimi geçersiz');
        if (tenantId) assertScope(me, tenantId);
        settings.origin = { tenantId, shop, market };
        saveSettings();
        logChange('Panel', `Vitrin kimliği: ${shop} / ${market}${tenantId ? ' / ' + tenantId : ''}`, {
          kind: 'settings.origin',
          before: o,
        });
        return send(res, 200, { ok: true, origin: settings.origin });
      }
      if (sub === 'create') {
        const err = needStr(b.name, 'name') || needStr(b.plan, 'plan');
        if (err) return bad(res, err);
        return send(res, 201, { ok: true, tenant: createTenant(b) });
      }
      const err = needStr(b.tenantId, 'tenantId');
      if (err) return bad(res, err);
      assertScope(me, b.tenantId); // başka kiracının kaydına yazma yok (yönetici hepsine yazabilir)
      if (sub === 'update') return send(res, 200, { ok: true, tenant: updateTenant(b.tenantId, b) });
      if (sub === 'shop') {
        // shop: { tenantId, action: 'add' | 'remove', name, market | shopId }
        if (b.action === 'add')
          return send(res, 200, { ok: true, shop: addShop(b.tenantId, b), tenant: getTenant(b.tenantId) });
        if (b.action === 'remove') {
          const e = needStr(b.shopId, 'shopId');
          if (e) return bad(res, e);
          return send(res, 200, { ok: true, tenant: removeShop(b.tenantId, b.shopId) });
        }
        return bad(res, 'action add ya da remove olmalı');
      }
      if (sub === 'user') {
        const e = needStr(b.username, 'username');
        if (e) return bad(res, e);
        return send(res, 200, { ok: true, tenant: assignUser(b.tenantId, b.username) });
      }
      // key: { tenantId, provider, action: 'set' | 'revoke' | 'test', apiKey? }; yanıtta anahtar değeri yok
      const e = needStr(b.provider, 'provider');
      if (e) return bad(res, e);
      if (b.action === 'set') {
        const e2 = needStr(b.apiKey, 'apiKey');
        if (e2) return bad(res, e2);
        return send(res, 200, { ok: true, key: setKey(b.tenantId, b.provider, b.apiKey) });
      }
      if (b.action === 'revoke') return send(res, 200, { ok: true, key: revokeKey(b.tenantId, b.provider) });
      if (b.action === 'test') {
        if (!getTenant(b.tenantId)) return send(res, 404, { error: 'Kiracı yok', code: 'notfound' });
        return send(res, 200, { ok: true, result: testKey(b.tenantId, b.provider) });
      }
      return bad(res, 'action set, revoke ya da test olmalı');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    // Liste ve tek kayıt kapsamla süzülür: kiracı kullanıcısı başka kiracıyı (ve anahtar özetini) görmez.
    if (!sub) return send(res, 200, { tenants: filterScope(me, listTenants(), t => t.id).map(withKeys) });
    if (!ID_RE.test(sub)) return bad(res, 'Geçersiz kimlik');
    assertScope(me, sub);
    const t = getTenant(sub);
    return t ? send(res, 200, withKeys(t)) : send(res, 404, { error: 'Kiracı yok' });
  } catch (e) {
    if (e instanceof TenantError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

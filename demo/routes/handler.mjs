import { actorCtx } from '../lib/store.mjs';
import { SUNUM_PROTECT } from '../lib/config.mjs';
import { ScopeError } from '../services/scope.mjs';
import { authOf, clientIp, endSession } from '../lib/auth.mjs';
import { SEC_HEADERS, readBody, send, serveStatic } from '../lib/http.mjs';
import { publicRoutes } from './public.mjs';
import { adminAuthRoutes } from './admin-auth.mjs';
import { adminMeRoutes } from './admin-me.mjs';
import { adminSystemRoutes } from './admin-system.mjs';
import { adminDataRoutes } from './admin-data.mjs';
import { adminHealthRoutes } from './admin-health.mjs';
import { adminPoolRoutes } from './admin-pool.mjs';
import { adminTenantRoutes } from './admin-tenants.mjs';
import { adminFeedRoutes } from './admin-feed.mjs';
import { adminRulesRoutes } from './admin-rules.mjs';
import { adminShippingRoutes } from './admin-shipping.mjs';
import { adminRefundRoutes } from './admin-refunds.mjs';
import { adminSupportRoutes } from './admin-support.mjs';
import { adminDashboardRoutes } from './admin-dashboard.mjs';
import { adminAdsRoutes } from './admin-ads.mjs';
import { adminInsightsRoutes } from './admin-insights.mjs';
import { adminB2bRoutes } from './admin-b2b.mjs';
import { adminStoreRoutes } from './admin-store.mjs';
import { adminAssistantRoutes } from './admin-assistant.mjs';

// Uç işleyicileri: her biri bağlamı (c) alır, eşleşirse yanıtı yazar. Yanıt yazıldıysa (headersSent) zincir durur.
// Sıra önemlidir: herkese açık uçlar → oturum → yetki kapıları → okuma uçları → yazma uçları (yalnız POST) → asistan.
const PUBLIC = [publicRoutes, adminAuthRoutes, adminMeRoutes];
const ADMIN = [
  adminSystemRoutes,
  adminDataRoutes,
  adminHealthRoutes,
  adminPoolRoutes,
  adminTenantRoutes,
  adminFeedRoutes,
  adminRulesRoutes,
  adminShippingRoutes,
  adminRefundRoutes,
  adminSupportRoutes,
  adminDashboardRoutes,
  adminAdsRoutes,
  adminInsightsRoutes,
  adminB2bRoutes,
  adminStoreRoutes,
  adminAssistantRoutes,
];

// Yönetici rolü isteyen uçlar: yol kalıbı → gereken rol tablosu (konsey bulgusu: rol kapısı yalnız users|backups|jobs'u kısıtlıyordu).
// `when` verilirse kapı yalnız o koşulda (gövdeye bakarak) uygulanır; verilmezse yol eşleşmesi yeter.
// Dağınık `if` yığını yerine tek tablo: yeni bir uç yöneticiye kısıtlanacaksa buraya bir satır eklenir.
const ADMIN_ONLY = [
  { p: /^\/api\/admin\/(users|backups?|jobs)$/, why: 'kullanıcı, yedek ve iş uçları' },
  // Kiracı kasası ve paket yönetimi: anahtar koyma/iptal, kiracı oluşturma, paket değiştirme, kullanıcı atama.
  { p: /^\/api\/admin\/tenants\/(create|update|key|user)$/, why: 'kiracı yönetimi ve API anahtarı kasası' },
  // Eşik üstü iade onayı: onay isteği (approve:true) yalnız yöneticiden gelebilir (dört göz kuralı servis katmanında).
  { p: /^\/api\/admin\/refunds\/settle$/, when: b => b?.approve === true, why: 'iade onayı' },
  { p: /^\/api\/admin\/ads\/brand$/, why: 'marka yetkisi verme' },
  // Satış yasağı kuralı silme ve fiyat stratejisi değiştirme/silme.
  { p: /^\/api\/admin\/rules\/(remove|strategy|strategy-remove)$/, why: 'kural ve fiyat stratejisi' },
  { p: /^\/api\/admin\/b2b\/deal-status$/, why: 'B2B anlaşma durumu' },
];
// Eşleşen ilk satırın gerekçesi (yönetici değilse) ya da null. Birim testi tabloyu bu işlevle denetler.
export const adminOnlyReason = (p, body) =>
  ADMIN_ONLY.find(g => g.p.test(p) && (!g.when || g.when(body)))?.why ?? null;

async function run(handlers, c) {
  for (const h of handlers) {
    await h(c);
    if (c.res.headersSent) return true;
  }
  return false;
}

export const handle = async (req, res) => {
  for (const k in SEC_HEADERS) res.setHeader(k, SEC_HEADERS[k]);
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const ip = clientIp(req),
    p = url.pathname,
    secure =
      req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  try {
    if (!p.startsWith('/api/')) {
      if (SUNUM_PROTECT && p.startsWith('/sunum') && !authOf(req)) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return res.end('Bu sunum için panel girişi gerekir: /admin');
      }
      return req.method === 'GET' || req.method === 'HEAD'
        ? serveStatic(req, res, url)
        : (res.writeHead(405), res.end());
    }
    if (req.method === 'POST') {
      const ct = req.headers['content-type'] || '',
        adm = p.startsWith('/api/admin/');
      // Yönetici uçları yalnız application/json kabul eder (text/plain yalnız herkese açık olay ucundaki sendBeacon için) ve yabancı Origin'li istek reddedilir (CSRF).
      if (!(/^application\/json\b/i.test(ct) || (!adm && /^text\/plain\b/i.test(ct))))
        return send(res, 415, { error: 'json bekleniyor' });
      if (adm && req.headers.origin) {
        let h = '';
        try {
          h = new URL(req.headers.origin).host;
        } catch {}
        if (h !== req.headers.host) return send(res, 403, { error: 'Yabancı kaynaktan istek reddedildi.' });
      }
    }
    // Yönetici uçları yalnız GET, HEAD ve POST kabul eder: PUT/PATCH/DELETE, POST için konan içerik türü, Origin ve rol denetimlerini atlamasın.
    if (p.startsWith('/api/admin/') && !['GET', 'HEAD', 'POST'].includes(req.method))
      return send(res, 405, { error: 'Yöntem desteklenmiyor.' }, { allow: 'GET, HEAD, POST' });
    const auth = authOf(req);
    const c = { req, res, url, p, ip, secure, auth };
    if (await run(PUBLIC, c)) return;
    if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'yok' });
    if (!auth) return send(res, 401, { error: 'Oturum açmanız gerekiyor.' });
    c.body = req.method === 'POST' ? await readBody(req) : {};
    if (p === '/api/admin/logout') {
      if (req.method !== 'POST')
        return send(res, 405, { error: 'Yöntem desteklenmiyor.' }, { allow: 'POST' });
      endSession(auth.sid);
      return send(
        res,
        200,
        { ok: true },
        { 'set-cookie': 'mxadm=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' },
      );
    }
    const me = auth.user,
      isBoss = me.role === 'yonetici',
      canEdit = me.role !== 'goruntuleyen';
    // Yetki: okuma uçları tüm roller · değiştiren uçlar düzenleyen ve yönetici · ADMIN_ONLY tablosundaki uçlar yalnız yönetici.
    if (req.method === 'POST' && !canEdit && p !== '/api/admin/password')
      return send(res, 403, { error: 'Bu hesap yalnız görüntüleme yetkisine sahip.' });
    if (!isBoss) {
      const why = adminOnlyReason(p, c.body);
      if (why) return send(res, 403, { error: `Bu işlem için yönetici rolü gerekir (${why}).` });
    }
    c.me = me;
    return await actorCtx.run(me, async () => {
      if (await run(ADMIN, c)) return;
      return send(res, 404, { error: 'yok' });
    });
  } catch (e) {
    // Kiracı kapsamı ihlali: uçlar services/scope.mjs yardımcılarını çağırır, hata tek yerde 403'e çevrilir.
    if (e instanceof ScopeError && !res.headersSent)
      return send(res, 403, { error: e.message, code: e.code });
    const code = e?.http || 500;
    if (code === 500) console.error(e);
    if (!res.headersSent)
      send(
        res,
        code,
        { error: code === 413 ? 'İstek çok büyük.' : code === 400 ? 'Geçersiz istek.' : 'Sunucu hatası.' },
        code === 413 ? { connection: 'close' } : {},
      );
  }
};

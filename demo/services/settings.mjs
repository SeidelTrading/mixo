import crypto from 'node:crypto';
import { actorCtx, isObj, store } from '../lib/store.mjs';

/* ───────── kalıcı ayarlar + değişiklik günlüğü ───────── */
export const settings = Object.assign(
  {
    announcement: '',
    hidden: {},
    featured: [],
    cleared: {},
    approved: {},
    overrides: {},
    content: {},
    categories: {},
    marketing: {},
    // Bu vitrinin kimliği: siparişin hangi kiracının, hangi mağazasının, hangi kanalın satışı olduğu.
    // Sunucu tarafında durur ve isteyene göre DEĞİŞMEZ: herkese açık kasa ucu kiracı seçemesin.
    origin: { tenantId: null, shop: 'mixoutlet', market: 'shop' },
  },
  (x => (isObj(x) ? x : {}))(store.doc('settings', {})),
);
for (const k of ['hidden', 'cleared', 'approved', 'overrides', 'content', 'categories', 'marketing'])
  if (!isObj(settings[k])) settings[k] = {};
if (!Array.isArray(settings.featured)) settings.featured = [];
if (!isObj(settings.origin)) settings.origin = { tenantId: null, shop: 'mixoutlet', market: 'shop' };
export const changes = store.allChanges();
export const saveSettings = () => store.saveDoc('settings', settings);
// orderCompleted: sipariş gerçekten geçerli olduğunda (doğrulama kapalıysa oluşturulunca, açıksa e-posta onayından
// sonra) çalışır. Pano hedef sayaçları ve kargo seçimi buna bağlıdır. Doğrudan import edilemez: dashboard ve
// shipping zaten orders'ı okuyor, ters yönde import döngü yaratırdı (bkz. ARCHITECTURE.md).
export const hooks = {
  igRefresh: null,
  orderPlaced: null,
  orderCompleted: null,
  optIn: null,
  runJobs: null,
}; // Instagram modülü: mağaza değişince taslak/gönderi bayraklarını yeniler
export function logChange(by, summary, undo) {
  const user = actorCtx.getStore()?.username,
    c = {
      id: crypto.randomUUID().slice(0, 8),
      t: Date.now(),
      by,
      ...(user ? { user } : {}),
      summary,
      undo,
      undone: false,
    };
  changes.push(c);
  store.addChange(c);
  if (hooks.igRefresh && by !== 'Instagram')
    try {
      hooks.igRefresh();
    } catch (e) {
      console.error('instagram', e.message);
    }
  return c;
}

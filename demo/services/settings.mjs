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
  },
  (x => (isObj(x) ? x : {}))(store.doc('settings', {})),
);
for (const k of ['hidden', 'cleared', 'approved', 'overrides', 'content', 'categories', 'marketing'])
  if (!isObj(settings[k])) settings[k] = {};
if (!Array.isArray(settings.featured)) settings.featured = [];
export const changes = store.allChanges();
export const saveSettings = () => store.saveDoc('settings', settings);
export const hooks = { igRefresh: null, orderPlaced: null, optIn: null, runJobs: null }; // Instagram modülü: mağaza değişince taslak/gönderi bayraklarını yeniler
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

// Pazarlama modülü: (1) veriden kampanya önerisi, (2) Instagram içerik hattı (instagram.mjs'i kullanır), (3) sepet/yeniden sipariş hatırlatması.
// Hatırlatmalar YALNIZ simülasyondur: hiçbir e-posta gönderilmez. Alıcı olabilmek için açık izin (opt-in) şarttır.
import crypto from 'node:crypto';
import { makeSuggest } from './marketing/suggest.mjs';
import { makeIgBridge } from './marketing/ig.mjs';
import { makeRules } from './marketing/rules.mjs';
import { makeReminders } from './marketing/reminders.mjs';
import { makeConsent } from './marketing/consent.mjs';
import { makeAdmin } from './marketing/admin.mjs';

export function initMarketing(ctx) {
  const {
    P,
    CATS,
    settings,
    saveSettings,
    effP,
    shopOk,
    getEvents,
    getOrders,
    actions,
    logChange,
    searchProducts,
    norm,
    ig,
    doc,
    saveDoc,
  } = ctx;
  const SITE = (process.env.SITE_URL || 'https://web-production-a959d0b7.up.railway.app').replace(/\/$/, '');
  const db = Object.assign(
    { optins: {}, carts: {}, sim: [] },
    (x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}))(doc('marketing', {})),
  );
  const save = () => saveDoc('marketing', db);
  const MAX_OPTINS = 20000,
    CONSENT_TEXT = 'v1-2026-11';
  // izin kaydı tavanı · onay metni sürümü
  const eur = n =>
    Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const uid = () => crypto.randomUUID().slice(0, 8);
  const ok = (obj = {}) => ({ code: 200, obj: { ok: true, ...obj } }),
    bad = (code, error) => ({ code, obj: { error } });
  /** @type {Record<string, any>} */
  const c = {
    P,
    CATS,
    settings,
    saveSettings,
    effP,
    shopOk,
    getEvents,
    getOrders,
    actions,
    logChange,
    searchProducts,
    norm,
    ig,
    doc,
    saveDoc,
    SITE,
    db,
    save,
    MAX_OPTINS,
    CONSENT_TEXT,
    eur,
    uid,
    ok,
    bad,
    ctx,
  };
  Object.assign(c, makeSuggest(c));
  Object.assign(c, makeIgBridge(c));
  Object.assign(c, makeRules(c));
  Object.assign(c, makeReminders(c));
  Object.assign(c, makeConsent(c));
  Object.assign(c, makeAdmin(c));
  const {
    admin,
    suggestions,
    applyCampaign,
    preview,
    simulate,
    igDraftsAuto,
    igQueue,
    optIn,
    saveCart,
    orderPlaced,
    simMail,
  } = c;
  return {
    admin,
    suggestions,
    applyCampaign,
    preview,
    simulate,
    igDraftsAuto,
    igQueue,
    optIn,
    saveCart,
    orderPlaced,
    simMail,
    rules: () => settings.marketing.rules,
  };
}

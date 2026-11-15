// Instagram yönetim modülü: gönderi/hikâye taslakları, onay kuyruğu, DM + yorum yanıt taslakları, siteyle senkron.
// Token yoksa SİMÜLASYON modu: hiçbir şey Instagram'a gitmez. Gerçek bağlantı için yalnız ortam değişkenleri:
//   INSTAGRAM_TOKEN, INSTAGRAM_USER_ID (Instagram Business hesap kimliği), IG_APP_SECRET (webhook imzası),
//   IG_VERIFY_TOKEN (webhook doğrulama dizesi), SITE_URL (herkese açık mağaza adresi), IG_GRAPH_BASE (isteğe bağlı).
import crypto from 'node:crypto';
import { makeContent } from './instagram/content.mjs';
import { makeDrafts } from './instagram/drafts.mjs';
import { makeFlags } from './instagram/flags.mjs';
import { makePublish } from './instagram/publish.mjs';
import { makeReplies } from './instagram/replies.mjs';
import { makeInbox } from './instagram/inbox.mjs';
import { makeViews } from './instagram/views.mjs';
import { makeAdmin } from './instagram/admin.mjs';

export function initInstagram(ctx) {
  const {
    P,
    settings,
    effP,
    isPending,
    shopOk,
    logChange,
    searchProducts,
    norm,
    getClient,
    model,
    freeShip,
    shipFee,
    limited,
    doc,
    saveDoc,
  } = ctx;
  const db = Object.assign(
    { posts: [], inbox: [] },
    (x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}))(doc('instagram', {})),
  );
  const save = () => saveDoc('instagram', db);
  const E = process.env;
  const TOKEN = E.INSTAGRAM_TOKEN || '',
    USER = E.INSTAGRAM_USER_ID || '',
    APP_SECRET = E.IG_APP_SECRET || '',
    VERIFY = E.IG_VERIFY_TOKEN || '';
  const SITE = (E.SITE_URL || 'https://web-production-a959d0b7.up.railway.app').replace(/\/$/, '');
  const BASE = E.IG_GRAPH_BASE || 'https://graph.facebook.com/v21.0';
  const LIVE = !!(TOKEN && USER);
  // token + hesap kimliği varsa canlı
  const CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/';
  const eur = n =>
    Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const uid = () => crypto.randomUUID().slice(0, 8);
  const BY = 'Instagram';
  /** @type {Record<string, any>} */
  const c = {
    P,
    settings,
    effP,
    isPending,
    shopOk,
    logChange,
    searchProducts,
    norm,
    getClient,
    model,
    freeShip,
    shipFee,
    limited,
    doc,
    saveDoc,
    db,
    save,
    E,
    TOKEN,
    USER,
    APP_SECRET,
    VERIFY,
    SITE,
    BASE,
    LIVE,
    CDN,
    eur,
    uid,
    BY,
    ctx,
  };
  Object.assign(c, makeContent(c));
  Object.assign(c, makeDrafts(c));
  Object.assign(c, makeFlags(c));
  Object.assign(c, makePublish(c));
  Object.assign(c, makeReplies(c));
  Object.assign(c, makeInbox(c));
  Object.assign(c, makeViews(c));
  Object.assign(c, makeAdmin(c));
  const { webhook, admin, refreshFlags, previewDraft, createDraft, draftView } = c;
  return { webhook, admin, refresh: refreshFlags, live: LIVE, previewDraft, createDraft, draftView };
}

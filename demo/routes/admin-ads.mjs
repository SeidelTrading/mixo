import { send } from '../lib/http.mjs';
import {
  AdsError,
  addKeyword,
  applyCommand,
  audience,
  authorizeBrand,
  recordPost,
  removeKeyword,
  status,
} from '../services/ads.mjs';

// Reklam ve paylaşım uçları (simülasyon; Meta/Google Ads'e ağ çağrısı yok): durum, paylaşım, marka yetkisi, kelime, komut, alıcı listesi.
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409, limit: 429 };
const WRITES = new Set(['post', 'brand', 'keyword', 'command']);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);

export async function adminAdsRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/ads(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'post') {
        const err =
          needStr(body.channel, 'channel') || needStr(body.text, 'text') || needStr(body.brand, 'brand');
        if (err) return bad(res, err);
        return send(res, 201, recordPost({ channel: body.channel, text: body.text, brand: body.brand }));
      }
      if (sub === 'brand') {
        const err = needStr(body.brand, 'brand') || needStr(body.reference, 'reference');
        if (err) return bad(res, err);
        return send(res, 200, { ok: true, ...authorizeBrand(body.brand, { reference: body.reference }) });
      }
      if (sub === 'keyword') {
        // keyword: { campaign, word, negative?, action: 'add' | 'remove' }
        const err = needStr(body.campaign, 'campaign') || needStr(body.word, 'word');
        if (err) return bad(res, err);
        if (body.action !== 'add' && body.action !== 'remove')
          return bad(res, 'action add ya da remove olmalı');
        const opts = { negative: body.negative === true };
        const r =
          body.action === 'add'
            ? addKeyword(body.campaign, body.word, opts)
            : removeKeyword(body.campaign, body.word, opts);
        return send(res, 200, { ok: true, ...r });
      }
      // command: { text, campaign? }; belirsizse hiçbir şey yapılmaz (applied:false)
      const err = needStr(body.text, 'text');
      if (err) return bad(res, err);
      const opts = typeof body.campaign === 'string' ? { campaign: body.campaign } : {};
      return send(res, 200, { ok: true, ...applyCommand(body.text, opts) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    if (!sub) return send(res, 200, status());
    if (sub === 'audience')
      return send(res, 200, await audience({ kind: url.searchParams.get('kind') ?? '' }));
    return send(res, 404, { error: 'Uç yok' });
  } catch (e) {
    if (e instanceof AdsError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

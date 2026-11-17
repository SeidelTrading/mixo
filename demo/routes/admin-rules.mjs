import { send } from '../lib/http.mjs';
import { assertShared } from '../services/scope.mjs';
import {
  PriceError,
  listStrategies,
  priceDecision,
  removeStrategy,
  setStrategy,
} from '../services/price-strategy.mjs';
import { RulesError, addRule, listRules, preview, removeRule, updateRule } from '../services/rules.mjs';

// Satış yasağı kuralları ve fiyat stratejisi uçları (/api/admin/rules altında).
// GET: kural listesi (`/`), strateji listesi (`/strategy`). POST: add, update, remove, preview, price, strategy, strategy-remove.
// Yetki ve yöntem kapıları handler.mjs'tedir; burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409 };
const POSTS = new Set(['add', 'update', 'remove', 'preview', 'price', 'strategy', 'strategy-remove']);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);

// KAPSAM NOTU: kural ve fiyat stratejisi kayıtlarında kiracı alanı YOK (kurallar tüm kurulum için ortaktır).
// Listeleme uçları bu yüzden kiracıya bağlı kullanıcıya (yönetici dışı) kapalıdır; silme/strateji uçları
// ayrıca handler.mjs'teki ADMIN_ONLY tablosuyla yöneticiye kısıtlıdır.
export async function adminRulesRoutes(c) {
  const { req, res, p, body, me } = c;
  const m = /^\/api\/admin\/rules(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (POSTS.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'add') return send(res, 201, { ok: true, rule: addRule(body) });
      if (sub === 'update') {
        const err = needStr(body.id, 'id');
        if (err) return bad(res, err);
        return send(res, 200, { ok: true, rule: updateRule(body.id, body) });
      }
      if (sub === 'remove') {
        const err = needStr(body.id, 'id');
        if (err) return bad(res, err);
        return send(res, 200, { ok: true, rule: removeRule(body.id) });
      }
      if (sub === 'preview') {
        if (!Array.isArray(body.vendors)) return bad(res, 'vendors dizi olmalı');
        return send(res, 200, { ok: true, items: preview(body) });
      }
      if (sub === 'price') return send(res, 200, { ok: true, ...priceDecision(body) });
      if (sub === 'strategy') return send(res, 200, { ok: true, strategy: setStrategy(body) });
      removeStrategy(body.company);
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    if (!sub || sub === 'strategy') assertShared(me, 'Kural ve fiyat stratejisi');
    if (!sub) return send(res, 200, { rules: listRules() });
    if (sub === 'strategy') return send(res, 200, { strategies: listStrategies() });
    return send(res, 404, { error: 'Uç yok' });
  } catch (e) {
    if (e instanceof RulesError || e instanceof PriceError)
      return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

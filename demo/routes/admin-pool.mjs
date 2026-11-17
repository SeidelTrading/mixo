import { send } from '../lib/http.mjs';
import { assertShared } from '../services/scope.mjs';
import {
  PoolError,
  addEan,
  getPool,
  ingest,
  listPools,
  merge,
  removeEan,
  unmerge,
  unmergeById,
} from '../services/pool.mjs';

// Ürün havuzu uçları: listele, tek ürün, kaynak ekle (ingest), birleştir / geri al, EAN ekle-sil.
// Yetki ve yöntem kapıları handler.mjs'tedir (yalnız GET/HEAD/POST; POST için düzenleyen ya da yönetici); burada yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404, conflict: 409, limit: 409 };
const ID_RE = /^[\w-]{1,40}$/;
const WRITES = new Set(['ingest', 'merge', 'unmerge', 'ean']);

const bad = (res, msg) => send(res, 400, { error: msg });
const needStr = (v, name) => (typeof v === 'string' && v.trim() ? null : `${name} gerekli`);

// KAPSAM NOTU: havuz kayıtlarında kiracı alanı YOK (tek ortak havuz). Kayıt kiracıya bağlanamadığı için
// listeleme ve tek kayıt uçları, bir kiracıya bağlı kullanıcıya (yönetici dışı) assertShared ile kapatılır.
export async function adminPoolRoutes(c) {
  const { req, res, p, url, body, me } = c;
  const m = /^\/api\/admin\/pool(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (WRITES.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'ingest') {
        const err = needStr(body.src, 'src') || needStr(body.ref, 'ref') || needStr(body.title, 'title');
        if (err) return bad(res, err);
        const r = ingest(body);
        return send(res, r.created ? 201 : 200, { ok: true, ...r });
      }
      if (sub === 'merge') {
        const err = needStr(body.keepId, 'keepId') || needStr(body.dropId, 'dropId');
        if (err) return bad(res, err);
        return send(res, 200, { ok: true, undo: merge(body.keepId, body.dropId) });
      }
      if (sub === 'unmerge') {
        // Tercih edilen yol: changeId (günlükten). undo nesnesi eski çağrılar için kabul edilir.
        if (typeof body.changeId === 'string' && body.changeId)
          return send(res, 200, { ok: true, ...unmergeById(body.changeId) });
        if (!body.undo || typeof body.undo !== 'object') return bad(res, 'changeId ya da undo gerekli');
        return send(res, 200, { ok: true, ...unmerge(body.undo) });
      }
      // ean: { poolId, ean, market?, action: 'add' | 'remove' }
      const err = needStr(body.poolId, 'poolId') || needStr(body.ean, 'ean');
      if (err) return bad(res, err);
      if (body.action !== 'add' && body.action !== 'remove')
        return bad(res, 'action add ya da remove olmalı');
      if (body.action === 'add') addEan(body.poolId, body.ean, body.market);
      else removeEan(body.poolId, body.ean, body.market);
      return send(res, 200, { ok: true, pool: getPool(body.poolId) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    assertShared(me, 'Ürün havuzu');
    if (!sub) {
      const sp = url.searchParams;
      return send(
        res,
        200,
        listPools({ limit: sp.get('limit') ?? undefined, offset: sp.get('offset') ?? undefined }),
      );
    }
    if (!ID_RE.test(sub)) return bad(res, 'Geçersiz kimlik');
    const pool = getPool(sub);
    return pool ? send(res, 200, pool) : send(res, 404, { error: 'Ürün yok' });
  } catch (e) {
    if (e instanceof PoolError) return send(res, STATUS[e.code] || 400, { error: e.message, code: e.code });
    throw e;
  }
}

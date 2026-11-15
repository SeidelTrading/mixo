import { send } from '../lib/http.mjs';
import { actions, undo } from '../services/actions.mjs';
import { adminItem, filterProblems } from '../services/visibility.mjs';
import { CATS, P } from '../services/catalog.mjs';
import { settings } from '../services/settings.mjs';
import { cleanContent, cleanOverride } from '../services/overrides.mjs';
import { changeList, pending } from '../services/assistant-gate.mjs';

// Mağazayı değiştiren uçlar (hepsi POST): gizle, onayla, sipariş durumu, ürün/içerik/kategori, geri al, bekleyen onay.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminStoreRoutes(c) {
  const { req, res, p, body, me } = c;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' });
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string').slice(0, 2000) : [];
  if (p === '/api/admin/hide') {
    const c =
      body.hidden === false
        ? actions.unhide_products({ ids }, 'yönetici')
        : actions.hide_products({ ids, reason: 'yönetici' }, 'yönetici');
    return send(res, 200, { ok: true, change: c.summary });
  }
  if (p === '/api/admin/hide-filter') {
    const f = filterProblems({
      type: body.type || undefined,
      brand: body.brand || undefined,
      category: body.category || undefined,
      q: body.q || undefined,
      state: 'approved',
    }).map(x => x.id);
    const c = actions.hide_products({ ids: f, reason: 'sorunlu görsel' }, 'yönetici');
    return send(res, 200, { ok: true, change: c.summary });
  }
  if (p === '/api/admin/approve') {
    const c =
      body.approved === false
        ? actions.unapprove_products({ ids }, 'yönetici')
        : actions.approve_products({ ids }, 'yönetici');
    return send(res, 200, { ok: true, change: c.summary });
  }
  if (p === '/api/admin/approve-filter') {
    const f = filterProblems({
      type: body.type || undefined,
      brand: body.brand || undefined,
      category: body.category || undefined,
      q: body.q || undefined,
      state: 'pending',
    }).map(x => x.id);
    const c = actions.approve_products({ ids: f }, 'yönetici');
    return send(res, 200, { ok: true, change: c.summary });
  }
  if (p === '/api/admin/order-status') {
    const c = actions.set_order_status(
      { id: String(body.id || ''), status: String(body.status || '') },
      'yönetici',
    );
    return c
      ? send(res, 200, { ok: true, change: c.summary })
      : send(res, 400, { error: 'Sipariş ya da durum geçersiz.' });
  }
  if (p === '/api/admin/clear')
    return send(res, 200, { ok: true, change: actions.clear_problems({ ids }, 'yönetici').summary });
  if (p === '/api/admin/announcement')
    return send(res, 200, {
      ok: true,
      change: actions.set_announcement({ text: body.text }, 'yönetici').summary,
    });
  if (p === '/api/admin/featured')
    return send(res, 200, { ok: true, change: actions.set_featured({ ids }, 'yönetici').summary });
  if (p === '/api/admin/product') {
    const id = String(body.id || '');
    if (!P.has(id)) return send(res, 404, { error: 'Ürün bulunamadı.' });
    const f = body.reset
        ? Object.fromEntries(Object.keys(settings.overrides[id] || {}).map(k => [k, null]))
        : body.fields,
      v = cleanOverride(f);
    if (v.err) return send(res, 400, { error: v.err });
    const c = actions.update_product({ id, fields: v.fields }, 'yönetici');
    return c
      ? send(res, 200, { ok: true, change: c.summary, product: adminItem(P.get(id)) })
      : send(res, 200, { ok: true, change: 'Değişiklik yok', product: adminItem(P.get(id)) });
  }
  if (p === '/api/admin/content') {
    const v = cleanContent(body.patch);
    if (v.err) return send(res, 400, { error: v.err });
    const c = actions.set_content({ patch: v.patch }, 'yönetici');
    return send(res, 200, { ok: true, change: c ? c.summary : 'Değişiklik yok' });
  }
  if (p === '/api/admin/category') {
    const key = String(body.key || '');
    if (!CATS.some(c => c.k === key)) return send(res, 404, { error: 'Kategori bulunamadı.' });
    if (body.label !== undefined && String(body.label).trim().length > 40)
      return send(res, 400, { error: 'Kategori adı en çok 40 karakter olabilir.' });
    const c = actions.set_category(
      { key, label: body.label, hidden: body.hidden === undefined ? undefined : !!body.hidden },
      'yönetici',
    );
    return send(res, 200, { ok: true, change: c ? c.summary : 'Değişiklik yok' });
  }
  if (p === '/api/admin/undo') {
    const c = undo(String(body.id), 'yönetici');
    if (c?.conflict)
      return send(res, 409, {
        error: `Bu kayıttan sonra aynı alan yeniden değişti (“${String(c.conflict.summary).slice(0, 80)}”). Önce o değişikliği geri alın.`,
      });
    return c
      ? send(res, 200, { ok: true, change: c.summary })
      : send(res, 400, { error: 'Bu değişiklik geri alınamıyor.' });
  }
  if (p === '/api/admin/pending') {
    const x = pending.get(String(body.id));
    if (!x) return send(res, 404, { error: 'Bekleyen işlem bulunamadı (süresi dolmuş olabilir).' });
    if (x.owner != null && x.owner !== me.id && me.role !== 'yonetici')
      return send(res, 403, { error: 'Bu onay başka bir kullanıcının asistan konuşmasına ait.' });
    pending.delete(x.id);
    if (!body.apply) return send(res, 200, { ok: true, change: 'İşlem iptal edildi' });
    return send(res, 200, {
      ok: true,
      change:
        changeList(x.run('AI asistan (yönetici onayıyla)'))
          .map(c => c.summary)
          .join(' · ') || 'Değişiklik yok',
    });
  }
}

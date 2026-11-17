import { store } from '../lib/store.mjs';
import { CATS, P } from './catalog.mjs';
import { changes, logChange, saveSettings, settings } from './settings.mjs';
import { ORDER_STATUS, canMoveOrder, orders, saveOrder } from './orders.mjs';
import { CONTENT_KEYS, baseOf, catDefaultLabel, effP } from './overrides.mjs';
import { PROBLEM_IDS, isProblem } from './visibility.mjs';
import { unmergeById } from './pool.mjs';

// Mağazayı değiştiren her işlem buradan geçer; hepsi günlüğe yazılır ve geri alınabilir.
export const actions = {
  set_announcement({ text }, by) {
    const old = settings.announcement;
    settings.announcement = String(text || '').slice(0, 160);
    saveSettings();
    return logChange(
      by,
      settings.announcement ? `Duyuru metni: “${settings.announcement}”` : 'Duyuru metni varsayılana döndü',
      { type: 'set_announcement', text: old },
    );
  },
  hide_products({ ids, reason }, by) {
    const done = ids.filter(id => P.has(id) && !settings.hidden[id]);
    done.forEach(id => {
      settings.hidden[id] = reason || 'yönetici';
    });
    saveSettings();
    return logChange(by, `${done.length} ürün mağazadan gizlendi${reason ? ` (${reason})` : ''}`, {
      type: 'unhide_products',
      ids: done,
    });
  },
  unhide_products({ ids }, by) {
    const done = ids.filter(id => settings.hidden[id]);
    const reasons = Object.fromEntries(done.map(id => [id, settings.hidden[id]]));
    done.forEach(id => delete settings.hidden[id]);
    saveSettings();
    return logChange(by, `${done.length} ürün yeniden görünür yapıldı`, { type: 'rehide', reasons });
  },
  rehide({ reasons }, by) {
    Object.assign(settings.hidden, reasons);
    saveSettings();
    return logChange(by, `${Object.keys(reasons).length} ürün yeniden gizlendi`, {
      type: 'unhide_products',
      ids: Object.keys(reasons),
    });
  },
  set_featured({ ids }, by) {
    const old = settings.featured;
    settings.featured = ids.filter(id => P.has(id)).slice(0, 12);
    saveSettings();
    return logChange(
      by,
      settings.featured.length
        ? `Öne çıkanlar güncellendi (${settings.featured.length} ürün)`
        : 'Öne çıkanlar temizlendi',
      { type: 'set_featured', ids: old },
    );
  },
  update_product({ id, fields }, by) {
    const p = P.get(id);
    if (!p) return null;
    const prev = settings.overrides[id] ? { ...settings.overrides[id] } : null,
      o = { ...(prev || {}) },
      b = baseOf(p),
      ch = [];
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      if (v === null || v === b[k]) {
        if (k in o) {
          delete o[k];
          ch.push(k);
        }
      } else if (o[k] !== v) {
        o[k] = v;
        ch.push(k);
      }
    }
    if (!ch.length) return null;
    if (Object.keys(o).length) settings.overrides[id] = o;
    else delete settings.overrides[id];
    saveSettings();
    return logChange(
      by,
      `Ürün düzenlendi: “${effP(p).title.slice(0, 60)}” (${ch.map(k => ({ title: 'başlık', price: 'fiyat', was: 'eski fiyat', na: 'stok', img: 'görsel' })[k]).join(', ')})`,
      { type: 'restore_override', id, prev },
    );
  },
  restore_override({ id, prev }, by) {
    if (!P.has(id)) return null;
    const cur = settings.overrides[id] ? { ...settings.overrides[id] } : null;
    if (prev && Object.keys(prev).length) settings.overrides[id] = prev;
    else delete settings.overrides[id];
    saveSettings();
    return logChange(by, `Ürün düzenlemesi geri yüklendi: “${effP(P.get(id)).title.slice(0, 60)}”`, {
      type: 'restore_override',
      id,
      prev: cur,
    });
  },
  set_content({ patch }, by) {
    const prev = {},
      ch = [];
    for (const k of Object.keys(patch)) {
      const v = patch[k],
        old = settings.content[k] ?? null;
      if (v === old) continue;
      prev[k] = old;
      ch.push(k);
      if (v === null) delete settings.content[k];
      else settings.content[k] = v;
    }
    if (!ch.length) return null;
    saveSettings();
    return logChange(by, `İçerik güncellendi: ${ch.map(k => CONTENT_KEYS[k][0]).join(', ')}`, {
      type: 'set_content',
      patch: prev,
    });
  },
  /** @param {{ key: string, label?: string, hidden?: boolean }} a */
  set_category({ key, label, hidden }, by) {
    if (!CATS.some(c => c.k === key)) return null;
    const prev = settings.categories[key] ? { ...settings.categories[key] } : null,
      o = { ...(prev || {}) };
    if (label !== undefined) {
      const l = String(label ?? '')
        .trim()
        .slice(0, 40);
      if (!l || l === catDefaultLabel(key)) delete o.label;
      else o.label = l;
    }
    if (hidden !== undefined) {
      if (hidden) o.hidden = true;
      else delete o.hidden;
    }
    if (JSON.stringify(o) === JSON.stringify(prev || {})) return null;
    if (Object.keys(o).length) settings.categories[key] = o;
    else delete settings.categories[key];
    saveSettings();
    return logChange(
      by,
      `Kategori güncellendi: ${catDefaultLabel(key)}${o.label ? ` → “${o.label}”` : ''}${o.hidden ? ' (mağazada gizli)' : ''}`,
      { type: 'restore_category', key, prev },
    );
  },
  restore_category({ key, prev }, by) {
    const cur = settings.categories[key] ? { ...settings.categories[key] } : null;
    if (prev && Object.keys(prev).length) settings.categories[key] = prev;
    else delete settings.categories[key];
    saveSettings();
    return logChange(by, `Kategori ayarı geri yüklendi: ${catDefaultLabel(key)}`, {
      type: 'restore_category',
      key,
      prev: cur,
    });
  },
  clear_problems({ ids }, by) {
    const done = ids.filter(id => PROBLEM_IDS.has(id) && !settings.cleared[id]);
    done.forEach(id => {
      settings.cleared[id] = true;
    });
    saveSettings();
    return logChange(by, `${done.length} ürün “sorun değil” olarak işaretlendi`, {
      type: 'unclear_problems',
      ids: done,
    });
  },
  approve_products({ ids }, by) {
    const done = ids.filter(id => isProblem(id) && !settings.approved[id]);
    done.forEach(id => {
      settings.approved[id] = true;
    });
    saveSettings();
    return logChange(by, `${done.length} sorunlu ürün onaylandı (mağazada görünür)`, {
      type: 'unapprove_products',
      ids: done,
    });
  },
  unapprove_products({ ids }, by) {
    const done = ids.filter(id => settings.approved[id]);
    done.forEach(id => delete settings.approved[id]);
    saveSettings();
    return logChange(by, `${done.length} ürünün onayı geri alındı (mağazadan kalktı)`, {
      type: 'approve_products',
      ids: done,
    });
  },
  set_order_status({ id, status }, by) {
    const o = orders.find(x => x.id === id);
    if (!o || !Object.hasOwn(ORDER_STATUS, status) || !canMoveOrder(o, status)) return null;
    const prev = o.status;
    o.status = status;
    (o.history ||= []).push({ t: Date.now(), status, by });
    saveOrder(o);
    return logChange(by, `Sipariş ${id}: ${ORDER_STATUS[prev]} → ${ORDER_STATUS[status]}`, {
      type: 'set_order_status',
      id,
      status: prev,
    });
  },
  // Pazarlama: kampanyayı vitrine yansıt (öne çıkanlar + isteğe bağlı duyuru şeridi 2); tek günlük kaydıyla geri alınır
  apply_campaign({ cid, title, ids, text }, by) {
    const prev = {
      featured: settings.featured,
      patch: { announce2: settings.content.announce2 ?? null },
      active: settings.marketing.active || null,
    };
    settings.featured = ids.filter(id => P.has(id)).slice(0, 12);
    if (text) settings.content.announce2 = text;
    settings.marketing.active = { id: cid, title, t: Date.now(), text: text || null };
    saveSettings();
    const c = logChange(
      by,
      `Kampanya vitrine yansıtıldı: “${title}” (${settings.featured.length} ürün${text ? ', duyuru şeridi 2 güncellendi' : ''})`,
      { type: 'restore_campaign', ...prev },
    );
    settings.marketing.active.changeId = c.id;
    saveSettings();
    return c;
  },
  restore_campaign({ featured, patch, active }, by) {
    const cur = {
      featured: settings.featured,
      patch: { announce2: settings.content.announce2 ?? null },
      active: settings.marketing.active || null,
    };
    settings.featured = featured;
    for (const k of Object.keys(patch)) {
      if (patch[k] === null) delete settings.content[k];
      else settings.content[k] = patch[k];
    }
    if (active) settings.marketing.active = active;
    else delete settings.marketing.active;
    saveSettings();
    return logChange(by, 'Kampanya vitrin ayarı geri yüklendi', { type: 'restore_campaign', ...cur });
  },
  set_mk_rule({ rule }, by) {
    const prev = JSON.parse(JSON.stringify(settings.marketing.rules)),
      i = settings.marketing.rules.findIndex(r => r.id === rule.id);
    if (i >= 0) {
      if (JSON.stringify(settings.marketing.rules[i]) === JSON.stringify(rule)) return null;
      settings.marketing.rules[i] = rule;
    } else settings.marketing.rules.push(rule);
    saveSettings();
    return logChange(
      by,
      `Hatırlatma kuralı ${i >= 0 ? 'güncellendi' : 'eklendi'}: “${rule.name}” (${rule.days} gün, ${rule.enabled ? 'açık' : 'kapalı'})`,
      { type: 'restore_mk_rules', rules: prev },
    );
  },
  delete_mk_rule({ id }, by) {
    const prev = JSON.parse(JSON.stringify(settings.marketing.rules)),
      r = settings.marketing.rules.find(x => x.id === id);
    if (!r) return null;
    settings.marketing.rules = settings.marketing.rules.filter(x => x.id !== id);
    saveSettings();
    return logChange(by, `Hatırlatma kuralı silindi: “${r.name}”`, { type: 'restore_mk_rules', rules: prev });
  },
  restore_mk_rules({ rules }, by) {
    const cur = JSON.parse(JSON.stringify(settings.marketing.rules));
    settings.marketing.rules = rules;
    saveSettings();
    return logChange(by, 'Hatırlatma kuralları geri yüklendi', { type: 'restore_mk_rules', rules: cur });
  },
  unclear_problems({ ids }, by) {
    ids.forEach(id => delete settings.cleared[id]);
    saveSettings();
    return logChange(by, `${ids.length} ürün yeniden sorunlu listesine alındı`, {
      type: 'clear_problems',
      ids,
    });
  },
  // Havuz birleştirmesinin geri alınması (services/pool.mjs). Panelin genel geri alma düğmesi buradan geçer;
  // asıl iş pool.unmergeById'dedir, o da kaydı 'geri alındı' olarak işaretler. Başarısızsa null döner ve
  // undo() kaydı geri alınmış saymaz.
  pool_unmerge({ changeId }, by) {
    try {
      const r = unmergeById(changeId);
      return logChange(by, `Havuz birleştirmesi geri alındı: ${r.restoredId} ayrıldı`, null);
    } catch (e) {
      console.error('havuz birleştirmesi geri alınamadı:', e?.message);
      return null;
    }
  },
};
// Bir kaydın geri alınması hangi alanlara dokunur? Aynı alan sonradan yeniden değiştiyse eski kaydı geri almak o değişikliği sessizce ezerdi.
const undoTargets = u =>
  !u
    ? []
    : u.type === 'set_announcement'
      ? ['duyuru']
      : u.type === 'set_featured'
        ? ['öne çıkanlar']
        : u.type === 'restore_override'
          ? ['ürün:' + u.id]
          : u.type === 'set_content'
            ? Object.keys(u.patch || {}).map(k => 'içerik:' + k)
            : u.type === 'restore_category'
              ? ['kategori:' + u.key]
              : u.type === 'restore_campaign'
                ? ['öne çıkanlar', ...Object.keys(u.patch || {}).map(k => 'içerik:' + k)]
                : u.type === 'restore_mk_rules'
                  ? ['hatırlatma kuralları']
                  : u.type === 'set_order_status'
                    ? ['sipariş:' + u.id]
                    : // Havuz birleştirmesi iki kanonik kaydı etkiler: korunan ve ayrılacak olan.
                      u.type === 'pool_unmerge'
                      ? ['havuz:' + (u.keepId || ''), 'havuz:' + (u.drop?.id || '')]
                      : [];
export function undoConflict(c) {
  const mine = new Set(undoTargets(c.undo));
  if (!mine.size) return null;
  return (
    changes
      .slice(changes.indexOf(c) + 1)
      .find(
        x =>
          !x.undone &&
          x.undo &&
          !String(x.by).includes('geri alma') &&
          undoTargets(x.undo).some(t => mine.has(t)),
      ) || null
  );
}
// Dönüş: değişiklik kaydı · null (geri alınamaz) · { conflict } (önce sonraki değişiklik geri alınmalı)
export function undo(id, by) {
  const c = changes.find(x => x.id === id);
  if (!c || c.undone || !c.undo || typeof actions[c.undo.type] !== 'function') return null;
  const later = undoConflict(c);
  if (later) return { conflict: later };
  // Önce işlem: sonuç boşsa (değer zaten aynıysa) kayıt “geri alındı” diye işaretlenmez.
  const r = actions[c.undo.type](c.undo, by + ' (geri alma)');
  if (r) {
    c.undone = true;
    store.setUndone(c.id);
  }
  return r;
}

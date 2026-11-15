import { CONTENT_KEYS, cleanContent, cleanOverride, effP } from './overrides.mjs';
import { CATS, P, TUR } from './catalog.mjs';
import { changes, settings } from './settings.mjs';
import { filterProblems, isPending, openProblems, searchProducts } from './visibility.mjs';
import {
  UNTRUSTED_NOTE,
  addPending,
  approvalReason,
  gate,
  maybePending,
  resolveIds,
} from './assistant-gate.mjs';
import { analytics, problemSummary } from './analytics.mjs';
import { ORDER_STATUS, dashboard, orders } from './orders.mjs';
import { actions, undo, undoConflict } from './actions.mjs';
import { mk } from './channels.mjs';

function slim(p0) {
  const p = effP(P.get(p0.id) || p0);
  return {
    id: p.id,
    title: p.title,
    vendor: p.vendor,
    price: p.price,
    category: p.catLabel || P.get(p.id)?.catLabel,
    sub: p.sub,
    hidden: !!settings.hidden[p.id] || undefined,
    awaitingApproval: isPending(p.id) || undefined,
    unavailable: p.na || undefined,
    edited: !!settings.overrides[p.id] || undefined,
  };
}

// Asistan araçları: araç adı → işleyici. Yazan araçlar gate/maybePending ile onay kuralından geçer.
export const TOOL_HANDLERS = {
  async get_analytics(input, conv) {
    return { _not: UNTRUSTED_NOTE, ...analytics(input.days) };
  },
  async get_sales_summary(input, conv) {
    return { _not: UNTRUSTED_NOTE, ...dashboard() };
  },
  async update_order_status(input, conv) {
    const id = String(input.id || ''),
      status = String(input.status || ''),
      o = orders.find(x => x.id === id);
    if (!o || !Object.hasOwn(ORDER_STATUS, status) || o.status === status)
      return { error: 'Sipariş bulunamadı ya da durum aynı/geçersiz.' };
    return gate(conv, 1, `Sipariş ${id}: ${ORDER_STATUS[o.status]} → ${ORDER_STATUS[status]}`, by =>
      actions.set_order_status({ id, status }, by),
    );
  },
  async get_problem_summary(input, conv) {
    return problemSummary();
  },
  async list_problem_products(input, conv) {
    const all = filterProblems({ type: input.type, brand: input.brand, category: input.category }),
      n = Math.min(50, Math.max(1, Number(input.limit) || 15));
    return {
      total: all.length,
      shown: Math.min(n, all.length),
      products: all.slice(0, n).map(p => ({ ...slim(p), problem: TUR[p.tur], note: p.not })),
    };
  },
  async search_products(input, conv) {
    if (typeof input.query !== 'string' || !input.query.trim()) return { error: 'query gerekli' };
    const r = searchProducts(
      input.query,
      input.category,
      Math.min(25, Math.max(1, Number(input.limit) || 10)),
    );
    return { count: r.length, products: r.map(slim) };
  },
  async get_settings(input, conv) {
    return {
      announcement: settings.announcement || '(varsayılan metin)',
      content: settings.content,
      categories: settings.categories,
      editedProductCount: Object.keys(settings.overrides).length,
      hiddenCount: Object.keys(settings.hidden).length,
      pendingApprovalCount: openProblems().filter(p => !settings.approved[p.id]).length,
      featured: settings.featured.map(id => slim(P.get(id))),
      recentChanges: changes
        .slice(-8)
        .reverse()
        .map(c => ({
          id: c.id,
          when: new Date(c.t).toISOString(),
          by: c.by,
          summary: c.summary,
          undone: c.undone,
        })),
    };
  },
  async set_announcement(input, conv) {
    if (typeof input.text !== 'string') return { error: 'text gerekli' };
    const text = input.text.slice(0, 160);
    return gate(
      conv,
      1,
      text ? `Duyuru metnini değiştir: “${text}”` : 'Duyuru metnini varsayılana döndür',
      by => actions.set_announcement({ text }, by),
    );
  },
  async set_featured_products(input, conv) {
    if (!Array.isArray(input.ids)) return { error: 'ids gerekli' };
    const bad = input.ids.filter(id => !P.has(id));
    if (bad.length)
      return {
        error:
          'bilinmeyen ürün kimliği: ' +
          bad.slice(0, 3).join(', ') +
          ' — önce search_products ile kimlikleri bul',
      };
    const ids = input.ids.slice(0, 12);
    return gate(
      conv,
      1,
      ids.length
        ? `Öne çıkanları değiştir (${ids.length} ürün): ${ids
            .slice(0, 4)
            .map(id => `“${effP(P.get(id)).title.slice(0, 40)}”`)
            .join(', ')}${ids.length > 4 ? ' …' : ''}`
        : 'Öne çıkanlar şeridini kaldır',
      by => actions.set_featured({ ids }, by),
    );
  },
  async hide_products(input, conv) {
    const ids = resolveIds(input).filter(id => !settings.hidden[id]);
    if (!ids.length)
      return {
        status: 'nothing',
        message: 'Gizlenecek ürün bulunamadı (zaten gizli olabilir ya da filtre boş).',
      };
    return maybePending(
      'hide_products',
      ids,
      { reason: String(input.reason || 'AI asistan').slice(0, 60) },
      `${ids.length} ürünü mağazadan gizle${input.reason ? ` — ${input.reason}` : ''}`,
      conv,
    );
  },
  async approve_products(input, conv) {
    const ids = resolveIds(input).filter(isPending);
    if (!ids.length) return { status: 'nothing', message: 'Onaylanacak bekleyen sorunlu ürün bulunamadı.' };
    return maybePending(
      'approve_products',
      ids,
      {},
      `${ids.length} sorunlu ürünü onayla (mağazada görünür olur)`,
      conv,
    );
  },
  async unapprove_products(input, conv) {
    const ids = (Array.isArray(input.ids) ? input.ids : []).filter(id => settings.approved[id]);
    if (!ids.length) return { status: 'nothing', message: 'Onayı geri alınacak ürün yok.' };
    return maybePending(
      'unapprove_products',
      ids,
      {},
      `${ids.length} ürünün onayını geri al (mağazadan kalkar)`,
      conv,
    );
  },
  async unhide_products(input, conv) {
    const ids = input.all
      ? Object.keys(settings.hidden)
      : Array.isArray(input.ids)
        ? input.ids.filter(id => settings.hidden[id])
        : [];
    if (!ids.length) return { status: 'nothing', message: 'Açılacak gizli ürün yok.' };
    return maybePending('unhide_products', ids, {}, `${ids.length} gizli ürünü yeniden görünür yap`, conv);
  },
  async update_product(input, conv) {
    if (typeof input.id !== 'string' || !P.has(input.id))
      return { error: 'bilinmeyen ürün kimliği — önce search_products ile kimliği bul' };
    /** @type {Record<string, any>} */
    let f;
    if (input.reset)
      f = Object.fromEntries(Object.keys(settings.overrides[input.id] || {}).map(k => [k, null]));
    else {
      f = {};
      if ('title' in input) f.title = input.title;
      if ('price' in input) f.price = input.price;
      if ('was' in input) f.was = input.was;
      if ('available' in input) f.na = input.available === false;
      if ('img' in input) f.img = input.img;
    }
    if (!Object.keys(f).length) return { status: 'nothing', message: 'Değiştirilecek alan verilmedi.' };
    const v = cleanOverride(f);
    if (v.err) return { error: v.err };
    const lbl = { title: 'başlık', price: 'fiyat', was: 'eski fiyat', na: 'stokta yok', img: 'görsel' },
      pid = input.id;
    return gate(
      conv,
      1,
      `Ürünü düzenle “${effP(P.get(pid)).title.slice(0, 60)}”: ${Object.entries(v.fields)
        .map(([k, x]) => `${lbl[k]} = ${x === null ? '(özgün değer)' : x}`)
        .join('; ')}`,
      by => actions.update_product({ id: pid, fields: v.fields }, by),
    );
  },
  async set_content(input, conv) {
    const patch = { ...input },
      runs = [],
      desc = [];
    if ('announce1' in patch) {
      const t = String(patch.announce1 ?? '').slice(0, 160);
      delete patch.announce1;
      runs.push(by => actions.set_announcement({ text: t }, by));
      desc.push(`Duyuru şeridi 1 = ${t ? `“${t}”` : '(varsayılan)'}`);
    }
    if (Object.keys(patch).length) {
      const v = cleanContent(patch);
      if (v.err) return { error: v.err };
      runs.push(by => actions.set_content({ patch: v.patch }, by));
      desc.push(
        ...Object.entries(v.patch).map(
          ([k, x]) => `${CONTENT_KEYS[k][0]} = ${x === null ? '(varsayılan)' : `“${x}”`}`,
        ),
      );
    }
    if (!runs.length) return { status: 'nothing', message: 'Değişiklik yok.' };
    return gate(conv, 1, 'İçeriği değiştir: ' + desc.join('; '), by => runs.map(r => r(by)));
  },
  async set_category(input, conv) {
    const key = input.key,
      cat = CATS.find(c => c.k === key);
    if (!cat) return { error: 'bilinmeyen kategori anahtarı. Geçerliler: ' + CATS.map(c => c.k).join(', ') };
    const runs = [],
      desc = [];
    let count = 1;
    if (typeof input.label === 'string') {
      const l = input.label.trim();
      if (l.length > 40) return { error: 'Kategori adı en çok 40 karakter olabilir.' };
      runs.push(by => actions.set_category({ key, label: l }, by));
      desc.push(l ? `adı “${l}” yap` : 'adını varsayılana döndür');
    }
    if (typeof input.hidden === 'boolean' && input.hidden !== !!settings.categories[key]?.hidden) {
      const h = input.hidden;
      runs.push(by => actions.set_category({ key, hidden: h }, by));
      desc.push(h ? `mağazadan gizle (${cat.n} ürünü etkiler)` : 'mağazada yeniden göster');
      if (h) count = cat.n;
    }
    if (!runs.length) return { status: 'nothing', message: 'Değişiklik yok.' };
    return gate(conv, count, `“${cat.label}” kategorisi: ${desc.join(', ')}`, by => runs.map(r => r(by)));
  },
  async list_campaign_suggestions(input, conv) {
    const r = mk.suggestions(input.days);
    return {
      _not: UNTRUSTED_NOTE,
      data: r.data,
      active: r.active,
      suggestions: r.items.map(x => ({
        id: x.id,
        title: x.title,
        why: x.why,
        empty: x.empty || undefined,
        shopText: x.shopText || undefined,
        products: x.products.map(p => ({
          id: p.id,
          title: p.title.slice(0, 70),
          vendor: p.vendor,
          price: p.price,
          note: p.note,
        })),
      })),
    };
  },
  async apply_campaign(input, conv) {
    const cid = String(input.id || ''),
      upd = input.update_announcement === true,
      days = Number(input.days) || 7,
      why = approvalReason(conv, 1);
    if (why) {
      const s = mk.suggestions(days).items.find(x => x.id === cid);
      if (!s || !s.products.length)
        return { error: 'Öneri bulunamadı ya da vitrine yansıtılacak ürünü yok. Listeyi yenileyin.' };
      const id = addPending(
        conv,
        `Kampanyayı vitrine yansıt: “${s.title}” (${Math.min(12, s.products.length)} ürün öne çıkanlara${upd && s.shopText ? `; duyuru şeridi 2 = “${s.shopText}”` : ''})`,
        1,
        by => {
          const r = mk.applyCampaign(cid, upd, by, days, {
            cid: s.id,
            title: s.title,
            ids: s.products.map(p => p.id).slice(0, 12),
            text: upd && s.shopText ? s.shopText : null,
          });
          return r.err ? null : r.change;
        },
      );
      return {
        status: 'pending',
        message: `Henüz uygulanmadı (${why}). Yönetici panelde çıkan onay kartından onaylamalı.`,
        pending_id: id,
      };
    }
    const r = mk.applyCampaign(cid, upd, 'AI asistan', days);
    if (r.err) return { error: r.err };
    conv.applied.push(r.change);
    return { status: 'applied', change: r.change.summary, change_id: r.change.id };
  },
  async create_instagram_drafts(input, conv) {
    const r = await mk.igDraftsAuto(input.ids, input.kind, 'AI asistan');
    return {
      status: r.made.length ? 'drafted' : 'nothing',
      note: 'Taslaklar onay kuyruğunda; yayınlanmadı. Yönetici Instagram/Pazarlama sekmesinde onaylamalı.',
      drafts: r.made,
      errors: r.errors,
    };
  },
  async get_reminder_preview(input, conv) {
    return {
      _not: UNTRUSTED_NOTE,
      note: 'Simülasyon: hiçbir e-posta gönderilmez.',
      rules: mk.preview(input.rule_id).map(x => ({
        id: x.rule.id,
        name: x.rule.name,
        type: x.rule.type,
        days: x.rule.days,
        enabled: x.enabled,
        due: x.due.slice(0, 10).map(r => ({
          to: r.emailMasked,
          items: r.items.map(i => i.title.slice(0, 50)),
          reason: r.reason,
        })),
        dueCount: x.due.length,
        scheduledCount: x.scheduled.length,
        doneCount: x.doneCount,
        excludedNoConsent: x.noConsent,
      })),
    };
  },
  async undo_last_change(input, conv) {
    const c = [...changes].reverse().find(x => !x.undone && x.undo && !x.by.includes('geri alma'));
    if (!c) return { status: 'nothing', message: 'Geri alınacak değişiklik yok.' };
    const later = undoConflict(c);
    if (later)
      return { error: `Önce sonraki değişiklik geri alınmalı: “${String(later.summary).slice(0, 80)}”` };
    const g = gate(conv, 1, `Son değişikliği geri al: “${String(c.summary).slice(0, 200)}”`, by => {
      const r = undo(c.id, by);
      return r && r.summary ? r : null;
    });
    return g.status === 'applied' ? { ...g, undone: c.summary } : g;
  },
};

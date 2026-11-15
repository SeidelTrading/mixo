import { send } from '../lib/http.mjs';
import { ORDER_STATUS, customers, dashboard, orderRow, orders } from '../services/orders.mjs';
import { ig, mk } from '../services/channels.mjs';
import { CATS, P, TUR, norm } from '../services/catalog.mjs';
import { analytics, problemSummary } from '../services/analytics.mjs';
import {
  adminItem,
  filterProblems,
  hiddenIds,
  isHidden,
  listProducts,
  openProblems,
} from '../services/visibility.mjs';
import { changes, settings } from '../services/settings.mjs';
import { pending } from '../services/assistant-gate.mjs';
import { MODEL } from '../lib/config.mjs';

// Okuma uçları: pano, pazarlama, Instagram, siparişler, müşteriler, analiz, sorunlu ürünler, ayarlar, ürün listesi.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminDataRoutes(c) {
  const { req, res, url, p, body } = c;
  if (p === '/api/admin/dashboard') return send(res, 200, dashboard());
  if (p.startsWith('/api/admin/marketing')) {
    const r = await mk.admin(p, req.method, body, url);
    return send(res, r.code, r.obj);
  }
  if (p.startsWith('/api/admin/instagram')) {
    const r = await ig.admin(p, req.method, body, url);
    return send(res, r.code, r.obj);
  }
  if (p === '/api/admin/orders') {
    const sp = url.searchParams,
      st = sp.get('status') || '',
      q = norm(sp.get('q') || '');
    const all = orders
        .filter(
          o =>
            (!st || o.status === st) &&
            (!q || norm(o.id + ' ' + o.customer.name + ' ' + o.customer.email).includes(q)),
        )
        .slice()
        .reverse(),
      page = Math.max(0, Number(sp.get('page')) || 0),
      size = 30;
    return send(res, 200, {
      total: all.length,
      page,
      pages: Math.ceil(all.length / size),
      statuses: ORDER_STATUS,
      items: all.slice(page * size, page * size + size).map(o => ({ ...orderRow(o), ...o })),
    });
  }
  if (p === '/api/admin/customers') return send(res, 200, { items: customers().slice(0, 300) });
  if (p === '/api/admin/analytics') return send(res, 200, analytics(url.searchParams.get('days')));
  if (p === '/api/admin/problems') {
    const sp = url.searchParams,
      ap = sp.get('approved'),
      all = filterProblems({
        type: sp.get('type') || undefined,
        brand: sp.get('brand') || undefined,
        category: sp.get('category') || undefined,
        q: sp.get('q') || undefined,
        state: ap === '1' ? 'approved' : ap === '0' ? 'pending' : undefined,
      });
    const page = Math.max(0, Number(sp.get('page')) || 0),
      size = 48;
    return send(res, 200, {
      summary: problemSummary(),
      total: all.length,
      page,
      pages: Math.ceil(all.length / size),
      items: all.slice(page * size, page * size + size).map(x => ({
        ...x,
        ...adminItem(P.get(x.id)),
        turLabel: TUR[x.tur],
        approved: !!settings.approved[x.id],
      })),
    });
  }
  if (p === '/api/admin/problems.csv') {
    const rows = [
      ['urun_id', 'baslik', 'marka', 'kategori', 'alt_kategori', 'sorun', 'not', 'onay', 'gizli'],
    ].concat(
      openProblems().map(x => [
        x.id,
        x.title,
        x.vendor,
        x.catLabel,
        x.sub,
        TUR[x.tur],
        x.not,
        settings.approved[x.id] ? 'onaylı' : 'bekliyor',
        isHidden(x.id) ? 'evet' : 'hayır',
      ]),
    );
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="sorunlu-urunler.csv"',
    });
    const cell = c => {
      let s = String(c ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    }; // tablo programında formül olarak çalışmasın
    return res.end('﻿' + rows.map(r => r.map(cell).join(';')).join('\n'));
  }
  if (p === '/api/admin/settings')
    return send(res, 200, {
      announcement: settings.announcement,
      hiddenCount: hiddenIds().length,
      featured: settings.featured
        .map(id => P.get(id))
        .filter(Boolean)
        .map(adminItem),
      content: settings.content,
      categories: CATS.map(c => ({
        k: c.k,
        label: c.label,
        n: c.n,
        custom: settings.categories[c.k] || {},
      })),
      editedCount: Object.keys(settings.overrides).length,
      changes: changes.slice(-40).reverse(),
      pending: [...pending.values()].map(x => ({
        id: x.id,
        text: x.text,
        count: x.count ?? x.ids.length,
      })),
      model: MODEL,
    });
  if (p === '/api/admin/products') {
    const sp = url.searchParams,
      st = sp.get('state'),
      cat = sp.get('category') || undefined;
    const all = listProducts({
      q: sp.get('q') || '',
      category: CATS.some(c => c.k === cat) ? cat : undefined,
      brand: sp.get('brand') || '',
      state: ['hidden', 'edited', 'na'].includes(st) ? st : '',
    });
    const page = Math.max(0, Number(sp.get('page')) || 0),
      size = 48;
    return send(res, 200, {
      total: all.length,
      page,
      pages: Math.ceil(all.length / size),
      items: all.slice(page * size, page * size + size).map(adminItem),
      featuredCount: settings.featured.length,
    });
  }
}

import { MARKETS, isMarket } from '../lib/config.mjs';
import { normalizeEan } from '../lib/ean.mjs';
import { esc, html, httpUrlOrNull, readForm, redirect, text } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { runFeed } from '../feeds/run.mjs';
import { addShop, countOf } from '../db/repo.mjs';

const page = (
  title,
  body,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/static/style.css"></head><body><main>
<nav><a href="/admin">Admin</a> · <a href="/admin/shops">Shops</a> · <a href="/admin/seeds">Seeds</a> · <a href="/admin/unmatched">Unmatched</a> · <a href="/admin/optouts">Opt-outs</a>
<form method="post" action="/admin/logout" class="inline"><button>Logout</button></form></nav><h1>${esc(title)}</h1>${body}</main></body></html>`;

const post = (action, fields, label) =>
  `<form method="post" action="${action}" class="inline">${Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join('')}<button>${esc(label)}</button></form>`;

const shopOptions = db =>
  db
    .prepare('SELECT id, market, name FROM shops ORDER BY market, name')
    .all()
    .map(s => `<option value="${s.id}">${esc(s.market)} · ${esc(s.name)}</option>`)
    .join('');

const num = v => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const domainOf = v =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

function loginPage(msg) {
  return page(
    'Admin login',
    `${msg ? `<p class="todo">${esc(msg)}</p>` : ''}<form class="stack" method="post" action="/admin/login"><input type="password" name="password" autocomplete="current-password" required autofocus><button>Login</button></form>`,
  );
}

function shopsView(db) {
  const shops = db.prepare('SELECT * FROM shops ORDER BY market, name').all();
  const rows = shops
    .map(
      s => `<tr><td>${s.id}</td><td>${s.market}</td><td>${esc(s.name)}<br><small>${esc(s.domain)}</small></td>
<td>${s.active ? 'active' : 'inactive'}${s.blocked ? ' <strong>BLOCKED</strong>' : ''}</td>
<td>${esc(s.feedUrl || '-')}<br><small>${esc(s.lastFeedResult || '')}</small></td>
<td>${post(`/admin/shops/${s.id}/blocked`, { value: s.blocked ? 0 : 1 }, s.blocked ? 'Unblock' : 'Block')}
${post(`/admin/shops/${s.id}/active`, { value: s.active ? 0 : 1 }, s.active ? 'Deactivate' : 'Activate')}
${s.feedUrl ? post(`/admin/shops/${s.id}/feed-run`, {}, 'Run feed') : ''}
${post(`/admin/shops/${s.id}/discover`, {}, 'Discover seeds')}</td></tr>`,
    )
    .join('');
  const markets = Object.keys(MARKETS)
    .map(m => `<option>${m}</option>`)
    .join('');
  return `<table class="admin"><tr><th>ID</th><th>Market</th><th>Shop</th><th>State</th><th>Feed</th><th></th></tr>${rows}</table>
<h2>Add shop</h2><form class="stack" method="post" action="/admin/shops">
<select name="market">${markets}</select><input name="name" placeholder="Name" required><input name="domain" placeholder="domain.com" required>
<input name="shippingDefault" placeholder="Default shipping (0 = free)" value="0">
<input name="feedUrl" placeholder="Feed URL (optional)"><select name="feedFormat"><option value="">auto</option><option>csv</option><option>xml</option></select>
<textarea name="feedMapping" rows="3" placeholder='Column mapping JSON, e.g. {"ean":"gtin","url":"product_url","_delimiter":";"}'></textarea>
<button>Add shop</button></form>`;
}

export async function handleAdmin(ctx, req, res, url) {
  const { db, auth } = ctx;
  const p = url.pathname;
  if (!auth.enabled()) return (text(res, 503, 'Admin disabled: set ADMIN_PASSWORD.'), true);
  const noStore = { 'cache-control': 'no-store' };

  if (req.method === 'POST' && !auth.sameOrigin(req)) return (text(res, 403, 'Bad origin'), true);

  if (p === '/admin/login' && req.method === 'POST') {
    const f = await readForm(req);
    if (!auth.verify(f.password ?? '')) return (html(res, 401, loginPage('Wrong password'), noStore), true);
    return (redirect(res, '/admin', 303, { 'set-cookie': auth.login() }), true);
  }
  if (!auth.isAuthed(req)) return (html(res, 401, loginPage(''), noStore), true);
  if (p === '/admin/logout' && req.method === 'POST')
    return (redirect(res, '/admin', 303, { 'set-cookie': auth.logout(req) }), true);

  const back = (to = req.headers.referer ? new URL(req.headers.referer).pathname : '/admin') =>
    redirect(res, to.startsWith('/admin') ? to : '/admin');

  if (req.method === 'GET') {
    if (p === '/admin') {
      const c = t => countOf(db, t);
      return (
        html(
          res,
          200,
          page(
            'Admin',
            `<ul><li>Products: ${c('products')}</li><li>Shops: ${c('shops')}</li><li>Offers: ${c('offers')}</li><li>Unmatched: ${c('unmatched')}</li><li>Seeds: ${c('seeds')}</li></ul>`,
          ),
          noStore,
        ),
        true
      );
    }
    if (p === '/admin/shops') return (html(res, 200, page('Shops', shopsView(db)), noStore), true);
    if (p === '/admin/seeds') {
      const rows = db
        .prepare(
          'SELECT s.*, sh.name AS shopName FROM seeds s JOIN shops sh ON sh.id = s.shopId ORDER BY s.id DESC LIMIT 200',
        )
        .all()
        .map(
          s =>
            `<tr><td>${esc(s.shopName)}</td><td>${esc(s.url)}</td><td>${esc(s.source)}</td><td>${esc(s.lastStatus || '-')}</td></tr>`,
        )
        .join('');
      const body = `<form class="stack" method="post" action="/admin/seeds"><select name="shopId">${shopOptions(db)}</select><input name="url" placeholder="https://shop.example/product/123" required><button>Add seed URL</button></form>
<table class="admin"><tr><th>Shop</th><th>URL</th><th>Source</th><th>Last status</th></tr>${rows}</table>`;
      return (html(res, 200, page('Seed URLs', body), noStore), true);
    }
    if (p === '/admin/unmatched') {
      const rows = db
        .prepare(
          'SELECT u.*, s.name AS shopName, s.market FROM unmatched u JOIN shops s ON s.id = u.shopId ORDER BY u.id DESC LIMIT 100',
        )
        .all()
        .map(
          u => `<tr><td>${esc(u.shopName)} (${u.market})</td><td>${esc(u.title)}<br><small><a href="${esc(u.url)}" rel="noopener nofollow">${esc(u.url)}</a></small></td>
<td>${u.price} ${esc(u.currency)}</td><td>${esc(u.rawEan || '')}</td>
<td><form method="post" action="/admin/unmatched/${u.id}/assign"><input name="ean" placeholder="EAN" required size="14"><button>Assign</button></form>
${post(`/admin/unmatched/${u.id}/dismiss`, {}, 'Dismiss')}</td></tr>`,
        )
        .join('');
      return (
        html(
          res,
          200,
          page(
            'Unmatched offers',
            `<table class="admin"><tr><th>Shop</th><th>Title</th><th>Price</th><th>Raw EAN</th><th></th></tr>${rows}</table>`,
          ),
          noStore,
        ),
        true
      );
    }
    if (p === '/admin/optouts') {
      const rows = db
        .prepare('SELECT domain FROM optouts ORDER BY domain')
        .all()
        .map(
          r => `<li>${esc(r.domain)} ${post('/admin/optouts/remove', { domain: r.domain }, 'Remove')}</li>`,
        )
        .join('');
      const body = `<p>Crawler never contacts these domains (applies immediately).</p><form class="stack" method="post" action="/admin/optouts"><input name="domain" placeholder="example.com" required><button>Add opt-out</button></form><ul>${rows}</ul>`;
      return (html(res, 200, page('Crawler opt-outs', body), noStore), true);
    }
    return false;
  }

  if (req.method !== 'POST') return false;
  const f = await readForm(req);
  let m;

  if (p === '/admin/shops') {
    const domain = domainOf(f.domain);
    const ship = num(f.shippingDefault || '0');
    let mapping = null;
    if (f.feedMapping?.trim()) {
      try {
        mapping = JSON.stringify(JSON.parse(f.feedMapping));
      } catch {
        return (html(res, 400, page('Error', '<p>feedMapping is not valid JSON.</p>')), true);
      }
    }
    const feedUrl = f.feedUrl?.trim() ? httpUrlOrNull(f.feedUrl.trim()) : null;
    if (!isMarket(f.market) || !f.name?.trim() || !domain || ship === null || (f.feedUrl?.trim() && !feedUrl))
      return (html(res, 400, page('Error', '<p>Invalid shop data.</p>')), true);
    addShop(db, {
      market: f.market,
      name: f.name.trim(),
      domain,
      shippingDefault: ship,
      feedUrl,
      feedFormat: ['csv', 'xml'].includes(f.feedFormat) ? f.feedFormat : null,
      feedMapping: mapping,
    });
    return (back('/admin/shops'), true);
  }
  if ((m = p.match(/^\/admin\/shops\/(\d+)\/(blocked|active)$/))) {
    db.prepare(`UPDATE shops SET ${m[2]} = ? WHERE id = ?`).run(f.value === '1' ? 1 : 0, Number(m[1]));
    return (back('/admin/shops'), true);
  }
  if ((m = p.match(/^\/admin\/shops\/(\d+)\/feed-run$/))) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(Number(m[1]));
    if (shop?.feedUrl)
      await runFeed(db, shop, { now: ctx.now, allowPrivateHosts: ctx.config.allowPrivateHosts });
    return (back('/admin/shops'), true);
  }
  if ((m = p.match(/^\/admin\/shops\/(\d+)\/discover$/))) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(Number(m[1]));
    if (shop) await ctx.getCrawler().discoverSeeds(shop);
    return (back('/admin/seeds'), true);
  }
  if (p === '/admin/seeds') {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(Number(f.shopId));
    const u = httpUrlOrNull(f.url?.trim());
    const d = shop?.domain.replace(/:\d+$/, '');
    const host = u && new URL(u).hostname;
    if (!shop || !u || !(host === d || host.endsWith('.' + d)))
      return (html(res, 400, page('Error', '<p>Seed URL must be http(s) on the shop domain.</p>')), true);
    db.prepare("INSERT OR IGNORE INTO seeds (shopId, url, source) VALUES (?, ?, 'admin')").run(shop.id, u);
    return (back('/admin/seeds'), true);
  }
  if ((m = p.match(/^\/admin\/unmatched\/(\d+)\/dismiss$/))) {
    db.prepare('DELETE FROM unmatched WHERE id = ?').run(Number(m[1]));
    return (back('/admin/unmatched'), true);
  }
  if ((m = p.match(/^\/admin\/unmatched\/(\d+)\/assign$/))) {
    const u = db.prepare('SELECT * FROM unmatched WHERE id = ?').get(Number(m[1]));
    const ean = normalizeEan(f.ean);
    if (!u || !ean) return (html(res, 400, page('Error', '<p>Invalid EAN (check digit).</p>')), true);
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(u.shopId);
    const r = ingestOffer(db, shop, { ...u, ean, inStock: !!u.inStock }, ctx.now());
    if (r === 'offer') db.prepare('DELETE FROM unmatched WHERE id = ?').run(u.id);
    return (back('/admin/unmatched'), true);
  }
  if (p === '/admin/optouts') {
    const d = domainOf(f.domain);
    if (d) db.prepare('INSERT OR IGNORE INTO optouts (domain, addedAt) VALUES (?, ?)').run(d, ctx.now());
    return (back('/admin/optouts'), true);
  }
  if (p === '/admin/optouts/remove') {
    db.prepare('DELETE FROM optouts WHERE domain = ?').run(domainOf(f.domain));
    return (back('/admin/optouts'), true);
  }
  return false;
}

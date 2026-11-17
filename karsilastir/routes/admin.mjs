import { MARKETS, isMarket } from '../lib/config.mjs';
import { normalizeEan } from '../lib/ean.mjs';
import { esc, html, httpUrlOrNull, readForm, redirect, text } from '../lib/http.mjs';
import { ingestOffer } from '../lib/ingest.mjs';
import { runFeed } from '../feeds/run.mjs';
import { NETWORKS, isNetwork, resolvePreset } from '../feeds/networks.mjs';
import { SECRET_ENV_RE, isRunning, redactUrl, runNetworkFeed } from '../feeds/network.mjs';
import { addShop, countOf } from '../db/repo.mjs';

const page = (
  title,
  body,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/static/style.css"></head><body><main>
<nav><a href="/admin">Admin</a> · <a href="/admin/shops">Shops</a> · <a href="/admin/networks">Networks</a> · <a href="/admin/seeds">Seeds</a> · <a href="/admin/unmatched">Unmatched</a> · <a href="/admin/optouts">Opt-outs</a>
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
<td>${s.network ? `<small>via ${esc(s.network)} #${esc(s.networkMerchantId)}</small><br>` : ''}${s.active ? 'active' : 'inactive'}${s.blocked ? ' <strong>BLOCKED</strong>' : ''}</td>
<td>${esc(s.feedUrl || '-')}<br><small>${esc(s.lastFeedResult || '')}</small></td>
<td>${post(`/admin/shops/${s.id}/blocked`, { value: s.blocked ? 0 : 1 }, s.blocked ? 'Unblock' : 'Block')}
${post(`/admin/shops/${s.id}/active`, { value: s.active ? 0 : 1 }, s.active ? 'Deactivate' : 'Activate')}
${s.feedUrl ? post(`/admin/shops/${s.id}/feed-run`, {}, 'Run feed') : ''}
${s.domain ? post(`/admin/shops/${s.id}/discover`, {}, 'Discover seeds') : ''}</td></tr>`,
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

/** Gizli anahtar asla geri gösterilmez: env adı (var/yok) ya da ••••son4. */
function secretLabel(f, env) {
  if (f.secretEnv) return `env:${f.secretEnv} (${env[f.secretEnv] ? 'set' : 'missing'})`;
  if (!f.secret) return 'none';
  return f.secret.length >= 8 ? `••••${f.secret.slice(-4)}` : '••••';
}

function summary(json) {
  if (!json) return 'never run';
  try {
    const r = JSON.parse(json);
    const sk = Object.entries(r.skipped || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    return [
      r.ok ? 'ok' : `<strong>error</strong>: ${esc(r.error)}`,
      `rows ${r.rows ?? 0}, merchants ${r.merchants ?? 0}, shops created ${r.shopsCreated ?? 0}`,
      `matched ${r.matched ?? 0}, unmatched ${r.unmatched ?? 0}, skipped ${esc(sk || '0')}`,
      r.errors ? `row errors ${r.errors}: ${esc((r.errorSamples || []).join(' | '))}` : '',
      r.truncated ? 'truncated' : '',
      `${r.durationMs ?? 0} ms`,
    ]
      .filter(Boolean)
      .join('<br>');
  } catch {
    return esc(json);
  }
}

function networksView(db, env) {
  const rows = db
    .prepare('SELECT * FROM network_feeds ORDER BY id')
    .all()
    .map(
      f => `<tr><td>${f.id}</td><td>${esc(f.network)}<br>${esc(f.name)}</td>
<td><small>${esc(redactUrl(f.url))}</small><br>secret: ${esc(secretLabel(f, env))}</td>
<td>${esc(f.market || '-')}<br>limit ${f.rowLimit}</td>
<td class="summary"><small>${isRunning(db, f.id) ? '<strong>running…</strong><br>' : ''}${f.lastRunAt ? new Date(f.lastRunAt).toISOString() + '<br>' : ''}${summary(f.lastResult)}</small></td>
<td>${post(`/admin/networks/${f.id}/run`, {}, 'Run now')}
${post(`/admin/networks/${f.id}/active`, { value: f.active ? 0 : 1 }, f.active ? 'Pause' : 'Resume')}
${post(`/admin/networks/${f.id}/delete`, {}, 'Delete')}</td></tr>`,
    )
    .join('');
  const nets = Object.entries(NETWORKS)
    .map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`)
    .join('');
  const markets = Object.keys(MARKETS)
    .map(m => `<option>${m}</option>`)
    .join('');
  return `<p>One affiliate-network file may contain many merchants: shops are created per merchant and market automatically. Market per row: country column if present, else TRY → tr, EUR → the feed's default market.</p>
<table class="admin"><tr><th>ID</th><th>Network</th><th>URL</th><th>Market</th><th>Last run</th><th></th></tr>${rows}</table>
<h2>Add network feed</h2><form class="stack" method="post" action="/admin/networks" autocomplete="off">
<select name="network">${nets}</select><input name="name" placeholder="Name" required>
<input name="url" placeholder="https://…?token={key} — {key} is replaced with the secret" required>
<input name="secretEnv" placeholder="Secret env var name, e.g. FEED_AWIN_KEY (preferred)">
<input type="password" name="secret" placeholder="…or secret (stored, never shown again)" autocomplete="new-password">
<label>Default market for EUR rows <select name="market">${markets}</select></label>
<input name="rowLimit" placeholder="Row limit" value="500000">
<textarea name="mapping" rows="3" placeholder='Optional mapping override JSON, e.g. {"price":"store_price","_delimiter":";"}'></textarea>
<button>Add feed</button></form>`;
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
    if (p === '/admin/networks')
      return (html(res, 200, page('Network feeds', networksView(db, ctx.env || process.env)), noStore), true);
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
  if (p === '/admin/networks') {
    const bad = msg => (html(res, 400, page('Error', `<p>${esc(msg)}</p>`)), true);
    if (!isNetwork(f.network)) return bad('Unknown network.');
    const name = f.name?.trim();
    const url = f.url?.trim() || '';
    if (!name) return bad('Name required.');
    let parsed;
    try {
      parsed = new URL(url.split('{key}').join('k'));
    } catch {
      return bad('Invalid URL.');
    }
    if (!/^https?:$/.test(parsed.protocol)) return bad('URL must be http(s).');
    const secretEnv = f.secretEnv?.trim() || null;
    const secret = f.secret || null;
    if (secretEnv && !SECRET_ENV_RE.test(secretEnv)) return bad('Env var name must match FEED_[A-Z0-9_]+.');
    if (secretEnv && secret) return bad('Give either an env var name or a secret, not both.');
    if (url.includes('{key}') && !secretEnv && !secret) return bad('URL has {key} but no secret given.');
    if (!isMarket(f.market)) return bad('Invalid market.');
    const rowLimit = f.rowLimit?.trim() ? Number(f.rowLimit) : 500000;
    if (!Number.isInteger(rowLimit) || rowLimit < 1) return bad('Row limit must be a positive integer.');
    let mapping = null;
    if (f.mapping?.trim()) {
      try {
        const obj = JSON.parse(f.mapping);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj))
          throw new Error('mapping must be an object');
        resolvePreset(f.network, obj);
        mapping = JSON.stringify(obj);
      } catch (e) {
        return bad(`Invalid mapping JSON: ${e.message}`);
      }
    }
    db.prepare(
      `INSERT INTO network_feeds (network, name, url, format, secretEnv, secret, market, mapping, rowLimit, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      f.network,
      name,
      url,
      NETWORKS[f.network].format,
      secretEnv,
      secret,
      f.market,
      mapping,
      rowLimit,
      ctx.now(),
    );
    return (back('/admin/networks'), true);
  }
  if ((m = p.match(/^\/admin\/networks\/(\d+)\/(run|active|delete)$/))) {
    const id = Number(m[1]);
    if (m[2] === 'delete') db.prepare('DELETE FROM network_feeds WHERE id = ?').run(id);
    else if (m[2] === 'active')
      db.prepare('UPDATE network_feeds SET active = ? WHERE id = ?').run(f.value === '1' ? 1 : 0, id);
    else {
      const feed = db.prepare('SELECT * FROM network_feeds WHERE id = ?').get(id);
      // Arka planda çalışır: büyük dosyalar dakikalar sürebilir; özet sayfada görünür.
      if (feed && !isRunning(db, id))
        runNetworkFeed(db, feed, {
          now: ctx.now,
          allowPrivateHosts: ctx.config.allowPrivateHosts,
          env: ctx.env || process.env,
        }).catch(e => console.error('network feed', e));
    }
    return (back('/admin/networks'), true);
  }
  if ((m = p.match(/^\/admin\/shops\/(\d+)\/discover$/))) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(Number(m[1]));
    if (shop?.domain) await ctx.getCrawler().discoverSeeds(shop);
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

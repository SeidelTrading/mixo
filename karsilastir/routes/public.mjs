import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MARKETS, isMarket } from '../lib/config.mjs';
import { normalizeEan } from '../lib/ean.mjs';
import { esc, html, redirect, text } from '../lib/http.mjs';
import { LEGAL_PAGES, tr, trn } from '../lib/i18n.mjs';
import { sortOffers } from '../lib/pricing.mjs';
import {
  categoriesFor,
  getProduct,
  historyFor,
  logClick,
  marketsWithOffers,
  offersFor,
  priceDrops,
  searchProducts,
  sitemapEans,
} from '../db/repo.mjs';
import { botPage, homeBody, layout, legalPage, marketChooser, productPage, searchBody } from './views.mjs';

const STATIC = {
  'style.css': 'text/css; charset=utf-8',
  'chart.js': 'text/javascript; charset=utf-8',
};

const notFound = (ctx, res, market = 'de') =>
  html(
    res,
    404,
    layout(ctx, market, {
      title: tr(market, 'notFound'),
      robots: 'noindex',
      body: `<h1>${esc(tr(market, 'notFound'))}</h1>`,
    }),
  );

/** Herkese açık rotalar. Eşleşme yoksa false döner. */
export function handlePublic(ctx, req, res, url) {
  const { db, config } = ctx;
  const now = ctx.now();
  const seg = url.pathname.split('/').filter(Boolean);
  const cache = { 'cache-control': 'public, max-age=300' };

  if (url.pathname === '/') return (html(res, 200, marketChooser(ctx), cache), true);
  if (url.pathname === '/bot') return (html(res, 200, botPage(ctx), cache), true);
  if (url.pathname === '/robots.txt')
    return (
      text(
        res,
        200,
        `User-agent: *\nDisallow: /go/\nDisallow: /admin\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
      ),
      true
    );
  if (url.pathname === '/sitemap.xml') {
    const urls = sitemapEans(db).map(
      r => `<url><loc>${esc(`${config.siteUrl}/${r.market}/product/${r.ean}`)}</loc></url>`,
    );
    return (
      text(
        res,
        200,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
        'application/xml; charset=utf-8',
      ),
      true
    );
  }
  if (seg[0] === 'static' && seg.length === 2 && STATIC[seg[1]]) {
    text(res, 200, readFileSync(join(ROOT, 'public', seg[1])), STATIC[seg[1]], {
      'cache-control': 'public, max-age=3600',
    });
    return true;
  }

  if (seg[0] === 'go' && seg.length === 2) {
    const id = Number(seg[1]);
    const o = Number.isInteger(id)
      ? db
          .prepare(
            'SELECT o.id, coalesce(o.deepLink, o.url) AS url FROM offers o JOIN shops s ON s.id = o.shopId WHERE o.id = ? AND s.active = 1 AND s.blocked = 0',
          )
          .get(id)
      : null;
    if (!o) return (notFound(ctx, res), true);
    logClick(db, o.id, now); // yalnızca gün + teklif; IP/UA/çerez saklanmaz
    redirect(res, o.url, 302, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
    return true;
  }

  if (!isMarket(seg[0])) return false;
  const market = seg[0];
  const maxAge = config.offerMaxAgeDays;

  const categories = categoriesFor(db, market, now, maxAge);

  if (seg.length === 1) {
    const all = searchProducts(db, market, '', now, maxAge, 500);
    const byEan = new Map(all.map(p => [p.ean, p]));
    const drops = priceDrops(db, market, now, maxAge)
      .filter(d => byEan.has(d.ean))
      .map(d => ({ ...byEan.get(d.ean), badge: trn(market, 'droppedBadge', d.pct) }));
    const t = k => tr(market, k);
    const body = homeBody(market, { popular: all.slice(0, 24), drops });
    const alternates = Object.keys(MARKETS).map(m => ({ market: m, path: `/${m}/` }));
    return (
      html(
        res,
        200,
        layout(ctx, market, {
          title: t('siteName'),
          canonicalPath: `/${market}/`,
          alternates,
          body,
          categories,
        }),
        cache,
      ),
      true
    );
  }

  if (seg[1] === 'search' && seg.length === 2) {
    const sp = url.searchParams;
    const q = (sp.get('q') || '').trim().slice(0, 100);
    const cat = (sp.get('cat') || '').trim().slice(0, 100);
    const num = k => {
      const n = Number((sp.get(k) || '').trim().replace(',', '.'));
      return sp.get(k) && Number.isFinite(n) && n >= 0 ? n : null;
    };
    const f = {
      cat,
      brand: (sp.get('brand') || '').trim().slice(0, 100),
      min: num('min') === null ? '' : String(num('min')),
      max: num('max') === null ? '' : String(num('max')),
      stock: sp.get('stock') === '1',
      sort: ['cheap', 'new'].includes(sp.get('sort')) ? sp.get('sort') : 'popular',
    };
    const ean = normalizeEan(q);
    let items = q || cat ? searchProducts(db, market, ean || q, now, maxAge, 500) : [];
    if (cat) items = items.filter(p => p.category === cat);
    const brands = [...new Set(items.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (f.brand) items = items.filter(p => p.brand === f.brand);
    if (f.min) items = items.filter(p => p.minTotal !== null && p.minTotal >= Number(f.min));
    if (f.max) items = items.filter(p => p.minTotal !== null && p.minTotal <= Number(f.max));
    if (f.stock) items = items.filter(p => p.minTotal !== null);
    if (f.sort === 'cheap')
      items.sort(
        (a, b) => (a.minTotal ?? Infinity) - (b.minTotal ?? Infinity) || a.title.localeCompare(b.title),
      );
    else if (f.sort === 'new')
      items.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title));
    const total = items.length;
    items = items.slice(0, 48);
    const t = k => tr(market, k);
    const body = searchBody(market, { q, items, brands, f, total });
    return (
      html(
        res,
        200,
        layout(ctx, market, {
          title: `${q || cat || t('results')} | ${t('siteName')}`,
          body,
          robots: 'noindex, follow',
          q,
          categories,
          cat,
        }),
      ),
      true
    );
  }

  if (seg[1] === 'product' && seg.length === 3) {
    const ean = normalizeEan(seg[2]);
    const product = ean && getProduct(db, ean);
    if (!product) return (notFound(ctx, res, market), true);
    if (ean !== seg[2]) return (redirect(res, `/${market}/product/${ean}`, 301), true);
    const offers = sortOffers(offersFor(db, ean, market, now, maxAge));
    const alt = marketsWithOffers(db, ean, now, maxAge);
    if (!offers.length && !alt.length) return (notFound(ctx, res, market), true);
    const alts = alt.includes(market) ? alt : [...alt, market];
    const page = productPage(ctx, market, product, offers, historyFor(db, ean, market), alts, categories);
    return (html(res, 200, page, cache), true);
  }

  if (seg[1] === 'legal' && seg.length === 3 && LEGAL_PAGES[market].some(([s]) => s === seg[2])) {
    return (html(res, 200, legalPage(ctx, market, seg[2])), true);
  }
  return (notFound(ctx, res, market), true);
}

import { MARKETS, MARKET_IDS } from '../lib/config.mjs';
import { esc, jsonForScript } from '../lib/http.mjs';
import { LANGS, LEGAL_PAGES, formatMoney, tr, trn } from '../lib/i18n.mjs';

const LOGO = `<svg class="logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false"><path class="tag-a" d="M3 8a3 3 0 0 1 3-3h9l9 9-8 8-10-10z"/><path class="tag-b" d="M14 13l7-7h5a3 3 0 0 1 3 3v6l-9 9z"/><circle cx="8" cy="9" r="1.8" class="hole"/><circle cx="25" cy="10" r="1.6" class="hole"/></svg>`;

const catHref = (market, c) => `/${market}/search?cat=${encodeURIComponent(c)}`;

/** Ortak sayfa iskeleti. alternates: [{market, path}] -> hreflang; canonicalPath: pazar öneksiz değil, tam yol. */
/** @param {any} ctx @param {string} market @param {any} o */
export function layout(
  ctx,
  market,
  {
    title,
    description,
    canonicalPath,
    alternates = [],
    body,
    jsonLd,
    robots,
    q = '',
    categories = [],
    cat = '',
    lang = market,
  },
) {
  const base = ctx.config.siteUrl;
  const m = MARKETS[market];
  const t = k => tr(lang, k);
  const hreflang = alternates
    .map(a => `<link rel="alternate" hreflang="${MARKETS[a.market].lang}" href="${esc(base + a.path)}">`)
    .join('');
  const xdefault =
    alternates.length > 1
      ? `<link rel="alternate" hreflang="x-default" href="${esc(base + alternates[0].path)}">`
      : '';
  const switcher = MARKET_IDS.map(
    id =>
      `<a href="/${id}/"${id === market ? ' aria-current="true"' : ''} hreflang="${MARKETS[id].lang}">${id.toUpperCase()}</a>`,
  ).join('');
  const legal = LEGAL_PAGES[market]
    .map(([slug, key]) => `<a href="/${market}/legal/${slug}">${esc(t(key))}</a>`)
    .join('');
  const catBar = categories.length
    ? `<nav class="cats" aria-label="${esc(t('categoryNav'))}"><ul>${categories
        .map(
          c =>
            `<li><a class="chip" href="${esc(catHref(market, c))}"${c === cat ? ' aria-current="true"' : ''}>${esc(c)}</a></li>`,
        )
        .join('')}</ul></nav>`
    : '';
  return `<!doctype html>
<html lang="${lang === market ? m.lang : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || t('tagline'))}">
${robots ? `<meta name="robots" content="${robots}">` : ''}
${canonicalPath ? `<link rel="canonical" href="${esc(base + canonicalPath)}">` : ''}${hreflang}${xdefault}
<link rel="stylesheet" href="/static/style.css">
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ''}
</head><body>
<header class="top"><div class="top-in"><a class="brand" href="/${market}/">${LOGO}<span>${esc(t('siteName'))}</span></a>
<form class="search" action="/${market}/search" method="get" role="search"><label class="sr" for="q">${esc(t('searchPlaceholder'))}</label><input id="q" type="search" name="q" value="${esc(q)}" placeholder="${esc(t('searchPlaceholder'))}" required><button type="submit">${esc(t('search'))}</button></form>
<nav class="markets" aria-label="${esc(t('market'))}">${switcher}</nav></div>${catBar}</header>
<main>${body}</main>
<footer><div class="foot-in"><p>${esc(t('disclosure'))}</p><nav class="foot-links" aria-label="${esc(t('footerNav'))}">${legal}<a href="/bot">Bot</a></nav><nav class="markets foot-markets" aria-label="${esc(t('market'))}">${switcher}</nav></div></footer>
</body></html>`;
}

/** Ürün kartı listesi. item.badge (metin) verilirse görsel üstünde rozet gösterilir. */
export function productCards(market, items) {
  const t = k => tr(market, k);
  return `<ul class="cards">${items
    .map(p => {
      const price = p.minTotal === null ? null : formatMoney(market, p.minTotal, p.currency);
      return `<li class="card"><a href="/${market}/product/${esc(p.ean)}">
<span class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" width="160" height="160">` : '<span class="noimg" aria-hidden="true"></span>'}${p.badge ? `<span class="badge drop">${esc(p.badge)}</span>` : ''}</span>
<span class="ctitle">${esc(p.title)}</span>${p.brand ? `<small class="cbrand">${esc(p.brand)}</small>` : ''}
<span class="cprice">${price === null ? `<span class="nostock">${esc(t('outOfStock'))}</span>` : `<span class="sr">${esc(t('lowestPriceAria'))}: </span><strong>${esc(price)}</strong>`}</span>
<span class="cmeta">${esc(p.offerCount === 1 ? t('inShopsOne') : trn(market, 'inShops', p.offerCount))}${p.cheapShop ? ` · <span class="cheap">${esc(t('cheapestAt'))}: ${esc(p.cheapShop)}</span>` : ''}</span></a></li>`;
    })
    .join('')}</ul>`;
}

export function productPage(ctx, market, product, offers, history, altMarkets, categories = []) {
  const t = k => tr(market, k);
  const money = (n, c) => formatMoney(market, n, c);
  const cur = offers[0]?.currency || MARKETS[market].currency;
  const best = offers[0]?.inStock ? offers[0] : null;
  const rows = offers
    .map(
      (
        o,
        i,
      ) => `<tr${i === 0 && best ? ' class="best"' : ''}><th scope="row" class="shopcell">${esc(o.shopName)}${i === 0 && best ? ` <span class="badge cheap">${esc(t('cheapestBadge'))}</span>` : ''}</th><td class="num">${esc(money(o.price, o.currency))}</td>
<td class="num ship">${o.shipping ? esc(money(o.shipping, o.currency)) : esc(t('free'))}</td>
<td class="num total"><strong>${esc(money(o.total, o.currency))}</strong></td><td class="stk ${o.inStock ? 'in' : 'out'}">${o.inStock ? esc(t('inStock')) : esc(t('outOfStock'))}</td>
<td class="act"><a class="btn${i === 0 && best ? '' : ' btn-ghost'}" href="/go/${o.id}" rel="sponsored nofollow noopener" target="_blank">${esc(t('goToShop'))}<span class="sr">: ${esc(o.shopName)}</span></a></td></tr>`,
    )
    .join('');
  const inStock = offers.filter(o => o.inStock);
  const lowHigh = inStock.length ? [inStock[0].total, inStock.at(-1).total] : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    ...(product.ean.length === 13 ? { gtin13: product.ean } : { gtin: product.ean }),
    ...(product.image ? { image: product.image } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(lowHigh
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: cur,
            lowPrice: lowHigh[0],
            highPrice: lowHigh[1],
            offerCount: offers.length,
            offers: offers.map(o => ({
              '@type': 'Offer',
              price: o.total,
              priceCurrency: o.currency,
              url: o.url,
              availability: `https://schema.org/${o.inStock ? 'InStock' : 'OutOfStock'}`,
              seller: { '@type': 'Organization', name: o.shopName },
            })),
          },
        }
      : {}),
  };
  const path = `/${market}/product/${product.ean}`;
  const crumbs = `<nav class="crumbs" aria-label="${esc(t('breadcrumb'))}"><ol><li><a href="/${market}/">${esc(t('home'))}</a></li>${product.category ? `<li><a href="${esc(catHref(market, product.category))}">${esc(product.category)}</a></li>` : ''}<li aria-current="page">${esc(product.title)}</li></ol></nav>`;
  const priceBox = best
    ? `<div class="pricebox"><p class="plabel">${esc(t('lowestPrice'))}</p><p class="pbig"><span class="sr">${esc(t('lowestPriceAria'))}: </span>${esc(money(best.total, best.currency))}</p><p class="psub">${esc(best.shopName)} · ${esc(t('shippingIncluded'))}</p><a class="btn btn-lg" href="/go/${best.id}" rel="sponsored nofollow noopener" target="_blank">${esc(t('goToShop'))}<span class="sr">: ${esc(best.shopName)}</span></a></div>`
    : offers.length
      ? `<div class="pricebox"><p class="psub">${esc(t('noStockOffers'))}</p></div>`
      : '';
  const body = `${crumbs}<article class="product"><div class="pgrid"><div class="pimg">${product.image ? `<img class="hero" src="${esc(product.image)}" alt="${esc(product.title)}" width="320" height="320">` : `<span class="noimg big" role="img" aria-label="${esc(t('productImage'))}"></span>`}</div>
<div class="pinfo"><h1>${esc(product.title)}</h1>
<p class="meta">${product.brand ? `${esc(t('brand'))}: ${esc(product.brand)} · ` : ''}${esc(t('barcode'))}: ${esc(product.ean)}</p>${priceBox}</div></div>
<section class="panel"><h2>${esc(t('offerList'))}</h2>${offers.length ? `<div class="tablewrap"><table class="offers"><thead><tr><th scope="col">${esc(t('shop'))}</th><th scope="col">${esc(t('price'))}</th><th scope="col" class="ship">${esc(t('shipping'))}</th><th scope="col">${esc(t('total'))}</th><th scope="col">${esc(t('stock'))}</th><th scope="col"><span class="sr">${esc(t('goToShop'))}</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p>${esc(t('noOffers'))}</p>`}</section>
${history.length > 1 ? `<section class="panel"><h2>${esc(t('priceHistory'))}</h2><div class="chart" role="img" aria-label="${esc(t('priceHistory'))}" data-points="${esc(JSON.stringify(history.map(h => [h.day, h.minPrice])))}" data-currency="${esc(cur)}" data-locale="${esc(MARKETS[market].locale)}" data-low="${esc(t('chartLow'))}" data-high="${esc(t('chartHigh'))}"></div><script src="/static/chart.js" defer></script></section>` : ''}
</article>`;
  return layout(ctx, market, {
    title: `${product.title} | ${t('siteName')}`,
    description: lowHigh
      ? `${product.title}: ${t('from')} ${money(lowHigh[0], cur)}, ${offers.length} ${t('offers')}`
      : product.title,
    canonicalPath: path,
    alternates: altMarkets.map(m => ({ market: m, path: `/${m}/product/${product.ean}` })),
    body,
    jsonLd,
    categories,
  });
}

/** Arama sonuçları: sol filtre sütunu (mobilde <details>), sıralama, kart ızgarası. f: aktif filtreler. */
export function searchBody(market, { q, items, brands, f, total }) {
  const t = k => tr(market, k);
  const active = !!(f.brand || f.min || f.max || f.stock);
  const sortOpts = [
    ['popular', 'sortPopular'],
    ['cheap', 'sortCheapest'],
    ['new', 'sortNewest'],
  ]
    .map(([v, k]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${esc(t(k))}</option>`)
    .join('');
  const hidden = `${q ? `<input type="hidden" name="q" value="${esc(q)}">` : ''}${f.cat ? `<input type="hidden" name="cat" value="${esc(f.cat)}">` : ''}`;
  const brandOpts = brands
    .map(b => `<option value="${esc(b)}"${b === f.brand ? ' selected' : ''}>${esc(b)}</option>`)
    .join('');
  const clearHref = `/${market}/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.cat ? { cat: f.cat } : {}) })}`;
  const form = `<form class="filterform" action="/${market}/search" method="get">${hidden}
<div class="field"><label for="f-brand">${esc(t('brand'))}</label><select id="f-brand" name="brand"><option value="">${esc(t('allBrands'))}</option>${brandOpts}</select></div>
<fieldset class="field"><legend>${esc(t('priceRange'))}</legend><div class="range"><label class="sr" for="f-min">${esc(t('minPrice'))}</label><input id="f-min" type="number" name="min" min="0" step="any" inputmode="decimal" placeholder="${esc(t('minPrice'))}" value="${esc(f.min)}"><span aria-hidden="true">–</span><label class="sr" for="f-max">${esc(t('maxPrice'))}</label><input id="f-max" type="number" name="max" min="0" step="any" inputmode="decimal" placeholder="${esc(t('maxPrice'))}" value="${esc(f.max)}"></div></fieldset>
<div class="field check"><input id="f-stock" type="checkbox" name="stock" value="1"${f.stock ? ' checked' : ''}><label for="f-stock">${esc(t('onlyInStock'))}</label></div>
<input type="hidden" name="sort" value="${esc(f.sort)}">
<div class="factions"><button type="submit">${esc(t('apply'))}</button><a href="${esc(clearHref)}">${esc(t('reset'))}</a></div></form>`;
  const head = q ? `${esc(t('results'))}: ${esc(q)}` : esc(f.cat || t('results'));
  return `<div class="results"><aside class="filters"><details${active ? ' open' : ''}><summary>${esc(t('filter'))}</summary>${form}</details></aside>
<section class="rbody"><div class="rhead"><div><h1>${head}</h1><p class="meta">${esc(trn(market, 'resultCount', total))}</p></div>
<form class="sortform" action="/${market}/search" method="get">${hidden}${f.brand ? `<input type="hidden" name="brand" value="${esc(f.brand)}">` : ''}${f.min ? `<input type="hidden" name="min" value="${esc(f.min)}">` : ''}${f.max ? `<input type="hidden" name="max" value="${esc(f.max)}">` : ''}${f.stock ? '<input type="hidden" name="stock" value="1">' : ''}<label for="sort">${esc(t('sort'))}</label><select id="sort" name="sort">${sortOpts}</select><button type="submit">${esc(t('apply'))}</button></form></div>
${items.length ? productCards(market, items) : `<p class="empty">${esc(t('noResults'))}</p>`}</section></div>`;
}

export function homeBody(market, { popular, drops }) {
  const t = k => tr(market, k);
  const heroForm = `<form class="search hero-search" action="/${market}/search" method="get"><label class="sr" for="hq">${esc(t('searchPlaceholder'))}</label><input id="hq" type="search" name="q" placeholder="${esc(t('searchPlaceholder'))}" required><button type="submit">${esc(t('search'))}</button></form>`;
  return `<section class="hero-band"><h1>${esc(t('heroTitle'))}</h1><p>${esc(t('tagline'))}</p>${heroForm}</section>
${drops.length ? `<section class="block"><h2>${esc(t('droppedTitle'))}</h2>${productCards(market, drops)}</section>` : ''}
${popular.length ? `<section class="block"><h2>${esc(t('popular'))}</h2>${productCards(market, popular)}</section>` : `<p class="empty">${esc(t('emptyHome'))}</p>`}`;
}

export function legalPage(ctx, market, slug) {
  const t = k => tr(market, k);
  const key = (LEGAL_PAGES[market].find(([s]) => s === slug) || [])[1];
  const body = `<h1>${esc(t(key))}</h1>
<p class="todo"><strong>TODO:</strong> ${esc(t('legalTodo'))}</p>
<ul class="todo"><li>TODO: [FIRMA ADI / COMPANY NAME]</li><li>TODO: [ADRES / ADDRESS]</li><li>TODO: [E-POSTA / EMAIL]</li><li>TODO: [VERGİ / VAT / KvK / HRB NO]</li></ul>`;
  return layout(ctx, market, { title: `${t(key)} | ${t('siteName')}`, body, robots: 'noindex' });
}

export function botPage(ctx) {
  const ua = `KarsilastirBot/0.1 (+${ctx.config.siteUrl}/bot)`;
  return layout(ctx, 'de', {
    title: 'KarsilastirBot',
    robots: 'noindex',
    body: `<h1>KarsilastirBot</h1>
<p>KarsilastirBot is the crawler of this price comparison site. It reads publicly available product data (schema.org Product/Offer markup) from shop product pages.</p>
<ul><li>User-Agent: <code>${esc(ua)}</code></li>
<li>It obeys <code>robots.txt</code> (cached for 24 hours) and never fetches disallowed paths.</li>
<li>At most one request every 10 seconds per host.</li>
<li>It does not log in, accept cookies, solve CAPTCHAs, use proxies or hide its identity.</li>
<li>On HTTP 403, 429 or 503 it stops visiting that host for 24 hours.</li></ul>
<p>To stop crawling your shop, disallow <code>KarsilastirBot</code> in robots.txt or contact us for an immediate opt-out.</p>
<p class="todo"><strong>TODO:</strong> add a real contact e-mail address for opt-out requests.</p>`,
  });
}

const nf = (n, locale = 'en') => new Intl.NumberFormat(locale).format(n);

/** Kök ana sayfa: arama, istatistikler, pazarlar, kategori/marka, örnek ürünler. */
export function marketChooser(ctx, { stats, topCats, brands, latest, mixo, lang = 'en' }) {
  const t = k => tr(lang, k);
  const marketOpts = MARKET_IDS.map(
    id => `<option value="${id}">${esc(MARKETS[id].name)} (${id.toUpperCase()})</option>`,
  ).join('');
  const stat = (n, label) => `<li><strong>${esc(nf(n))}</strong><span>${esc(label)}</span></li>`;
  const cards = MARKET_IDS.map(id => {
    const s = stats.byMarket[id] || { products: 0, shops: 0, offers: 0 };
    const cats = (topCats[id] || [])
      .slice(0, 4)
      .map(c => `<li><a class="chip" href="${esc(catHref(id, c))}">${esc(c)}</a></li>`)
      .join('');
    return `<li class="mcard"><a class="mhead" href="/${id}/" hreflang="${MARKETS[id].lang}"><span class="mcode">${id.toUpperCase()}</span><span><strong>${esc(MARKETS[id].name)}</strong><small>${esc(MARKETS[id].currency)} · ${esc(nf(s.products))} ${esc(t('productsWord'))} · ${esc(nf(s.shops))} ${esc(t('shopsWord'))}</small></span></a>${cats ? `<ul class="mcats">${cats}</ul>` : ''}</li>`;
  }).join('');
  const brandChips = brands
    .map(
      b =>
        `<li><a class="chip" href="/${b.market}/search?q=${encodeURIComponent(b.name)}">${esc(b.name)}</a></li>`,
    )
    .join('');
  const latestCards = latest.length
    ? `<section class="block"><h2>${esc(t('latestMatched'))}</h2><ul class="cards">${latest
        .map(p => {
          const m = p.market;
          return `<li class="card"><a href="/${m}/product/${esc(p.ean)}"><span class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" width="160" height="160">` : '<span class="noimg" aria-hidden="true"></span>'}<span class="badge drop">${m.toUpperCase()}</span></span><span class="ctitle">${esc(p.title)}</span>${p.brand ? `<small class="cbrand">${esc(p.brand)}</small>` : ''}<span class="cprice"><strong>${esc(formatMoney(m, p.minTotal, p.currency))}</strong></span><span class="cmeta">${esc(trn(m, 'inShops', p.offerCount))}</span></a></li>`;
        })
        .join('')}</ul></section>`
    : '';
  const total = stats.total;
  return layout(ctx, 'de', {
    lang,
    title: t('homeTitleTag'),
    description: t('homeDesc'),
    canonicalPath: '/',
    alternates: MARKET_IDS.map(id => ({ market: id, path: `/${id}/` })),
    body: `<nav class="markets lang-switch" aria-label="${esc(t('languageNav'))}">${LANGS.map(l => `<a href="/?lang=${l}"${l === lang ? ' aria-current="true"' : ''} hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`).join('')}</nav>
<section class="hero-band"><h1>${esc(t('homeHeading'))}</h1><p>${esc(t('homeLead'))}</p>
<form class="search hero-search home-search" action="/de/search" method="get" role="search" onsubmit="this.action='/'+this.elements.m.value+'/search'"><label class="sr" for="hq">${esc(t('searchLabel'))}</label><input id="hq" type="search" name="q" placeholder="${esc(t('searchPlaceholder'))}" required><label class="sr" for="hm">${esc(t('marketLabel'))}</label><select id="hm" name="m">${marketOpts.replace('value="de"', 'value="de" selected')}</select><button type="submit">${esc(t('search'))}</button></form></section>
<ul class="stats" aria-label="${esc(t('coverage'))}">${stat(total.products, t('statProducts'))}${stat(total.shops, t('statShops'))}${stat(total.offers, t('statOffers'))}${stat(MARKET_IDS.length, t('statCountries'))}</ul>
${mixo?.hasShop ? `<section class="block mixo-band"><h2>${esc(t('mixoHeadline').replace('{n}', nf(mixo.total)).replace('{x}', nf(mixo.covered)))}</h2><p><a class="chip" href="/de/mixoutlet?lang=${lang}">${esc(t('mixoCta'))}</a></p></section>` : ''}
<section class="block"><h2>${esc(t('chooseMarket'))}</h2><ul class="mcards">${cards}</ul></section>
${brands.length ? `<section class="block"><h2>${esc(t('popularBrands'))}</h2><ul class="chiprow">${brandChips}</ul></section>` : ''}${latestCards}`,
  });
}

/** Mixoutlet karşılaştırma sayfası: kapsama ölçüsü, mağaza başına eşleşme, ürün başına rakip fiyatlar ve fark. */
export function mixoPage(ctx, { summary, cmp, sort, page, perPage, lang }) {
  const t = k => tr(lang, k);
  const market = 'de';
  const money = n => formatMoney(market, n, 'EUR');
  const pct = n => `${n > 0 ? '+' : ''}${new Intl.NumberFormat(MARKETS[market].locale).format(n)} %`;
  const nfl = n => new Intl.NumberFormat(MARKETS[market].locale).format(n);
  const head = t('mixoHeadline').replace('{n}', nfl(summary.total)).replace('{x}', nfl(summary.covered));
  const share = summary.total ? Math.round((summary.covered / summary.total) * 1000) / 10 : 0;
  const stat = (n, label) => `<li><strong>${esc(nfl(n))}</strong><span>${esc(label)}</span></li>`;
  const shops = summary.byShop
    .map(s => `<li><span class="chip">${esc(s.name)} · ${esc(nfl(s.n))}</span></li>`)
    .join('');
  const link = (s, p) => `/de/mixoutlet?lang=${lang}&amp;sort=${s}&amp;page=${p}`;
  const sorts = [
    ['diff', 'mixoSortDiff'],
    ['cheap', 'mixoSortCheap'],
    ['shops', 'mixoSortShops'],
  ]
    .map(
      ([s, k]) =>
        `<a class="chip" href="${link(s, 1)}"${s === sort ? ' aria-current="true"' : ''}>${esc(t(k))}</a>`,
    )
    .join('');
  const rows = cmp.items
    .map(
      p => `<tr><td>${
        p.matchType === 'mpn'
          ? `${p.mixoUrl ? `<a href="${esc(p.mixoUrl)}" rel="nofollow noopener">${esc(p.title)}</a>` : esc(p.title)}<br><small>${esc(p.brand || '')} · <span class="badge" title="${esc(t('mixoMatchMpnHint'))}">${esc(t('mixoMatchMpn'))}</span></small>`
          : `<a href="/de/product/${esc(p.ean)}">${esc(p.title)}</a><br><small>${esc(p.brand || '')} · ${esc(p.ean)}</small>`
      }</td>
<td>${esc(money(p.mixo))}</td>
<td>${p.rivals.map(r => `${esc(r.shop)} ${esc(money(r.total))}`).join('<br>')}</td>
<td>${esc(money(p.best))}</td><td class="${p.diff > 0 ? 'drop' : ''}">${esc(money(p.diff))}<br><small>${esc(pct(p.pct))}</small></td></tr>`,
    )
    .join('');
  const pages = Math.max(1, Math.ceil(cmp.total / perPage));
  const pager = `<nav class="markets" aria-label="Pager">${page > 1 ? `<a href="${link(sort, page - 1)}">${esc(t('prev'))}</a>` : ''} ${page}/${pages} ${page < pages ? `<a href="${link(sort, page + 1)}">${esc(t('next'))}</a>` : ''}</nav>`;
  return layout(ctx, market, {
    lang,
    title: `${t('mixoNav')} · ${t('siteName')}`,
    description: head,
    canonicalPath: '/de/mixoutlet',
    body: `<section class="hero-band"><h1>${esc(head)}</h1><p>${esc(share)} % · ${esc(t('mixoNote'))}</p></section>
<ul class="stats" aria-label="${esc(t('mixoCoverage'))}">${stat(summary.known, t('mixoKnown'))}${stat(summary.withEan, t('mixoWithEan'))}${stat(summary.covered, t('mixoNav'))}${summary.coveredByMpn ? stat(summary.coveredByMpn, t('mixoCoveredMpn')) : ''}${stat(summary.cheaper, t('mixoCheaperCount'))}</ul>
${shops ? `<section class="block"><h2>${esc(t('mixoByShop'))}</h2><ul class="chiprow">${shops}</ul></section>` : ''}
<section class="block"><p>${sorts}</p>${
      cmp.items.length
        ? `<table><thead><tr><th>${esc(t('shop'))}</th><th>${esc(t('mixoPrice'))}</th><th>${esc(t('mixoRivals'))}</th><th>${esc(t('mixoBest'))}</th><th>${esc(t('mixoDiff'))}</th></tr></thead><tbody>${rows}</tbody></table>${pager}`
        : `<p class="empty">${esc(t('mixoEmpty'))}</p>`
    }</section>`,
  });
}

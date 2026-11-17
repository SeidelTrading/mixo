import { createHash, createHmac } from 'node:crypto';

/**
 * Anahtar gerektiren GTIN/EAN sorgu bağlayıcıları. Hepsi ortam değişkeni YOKKEN kapalıdır (enabled: false), hiçbir ağ
 * isteği atmaz. Her bağlayıcı: { id, shop: { market, name, domain }, enabled(env), lookup(ean, { fetchImpl, env }) }.
 * lookup() dönüşü: { price, currency, url, shipping?, title? } (en ucuz yeni ürün teklifi) ya da null.
 * Resmi API'ler kullanılır; kazıma yok. Ayrıntı, maliyet ve kayıt bağlantıları: docs/KAYNAKLAR.md.
 */
const has = (env, ...keys) => keys.every(k => !!env[k]);
const num = v => (v === undefined || v === null || v === '' ? null : Number(String(v).replace(',', '.')));

async function json(fetchImpl, url, init) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(20_000), ...init });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- eBay Browse API
let ebayToken = { value: '', exp: 0 };
export const ebay = {
  id: 'ebay',
  shop: { market: 'de', name: 'eBay', domain: 'ebay.de' },
  enabled: env => has(env, 'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'),
  async lookup(ean, { fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
    if (ebayToken.exp < now()) {
      const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
      const t = await json(fetchImpl, 'https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
        body:
          'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
      });
      ebayToken = { value: t.access_token, exp: now() + (t.expires_in - 60) * 1000 };
    }
    const q = new URLSearchParams({
      gtin: ean,
      limit: '10',
      sort: 'price',
      filter: 'conditions:{NEW},buyingOptions:{FIXED_PRICE}',
    });
    const r = await json(fetchImpl, `https://api.ebay.com/buy/browse/v1/item_summary/search?${q}`, {
      headers: { authorization: `Bearer ${ebayToken.value}`, 'x-ebay-c-marketplace-id': 'EBAY_DE' },
    });
    const best = (r.itemSummaries || [])
      .filter(i => i.price?.currency === 'EUR')
      .map(i => ({
        price: num(i.price.value),
        currency: 'EUR',
        url: i.itemWebUrl,
        title: i.title,
        shipping: num(i.shippingOptions?.[0]?.shippingCost?.value) ?? 0,
      }))
      .filter(o => o.price !== null && o.url)
      .sort((a, b) => a.price + a.shipping - (b.price + b.shipping))[0];
    return best ?? null;
  },
};

// ---------------------------------------------------------------- Amazon PA-API 5 (AWS Signature V4)
const sha = d => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
/** AWS SigV4 imzası (PA-API 5: servis ProductAdvertisingAPI, bölge eu-west-1). */
export function signV4({
  host,
  path,
  region,
  service,
  target,
  body,
  accessKey,
  secretKey,
  date = new Date(),
}) {
  const amz = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amz.slice(0, 8);
  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host,
    'x-amz-date': amz,
    'x-amz-target': target,
  };
  const names = Object.keys(headers).sort();
  const canonical = [
    'POST',
    path,
    '',
    ...names.map(n => `${n}:${headers[n]}\n`),
    names.join(';'),
    sha(body),
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), 'aws4_request');
  const sig = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`,
  };
}
export const amazon = {
  id: 'amazon',
  shop: { market: 'de', name: 'Amazon.de', domain: 'amazon.de' },
  enabled: env => has(env, 'AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'),
  async lookup(ean, { fetchImpl = fetch, env = process.env } = {}) {
    const host = 'webservices.amazon.de';
    const body = JSON.stringify({
      Keywords: ean,
      SearchIndex: 'All',
      ItemCount: 3,
      PartnerTag: env.AMAZON_PARTNER_TAG,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.de',
      Resources: ['ItemInfo.Title', 'Offers.Listings.Price'],
    });
    const headers = signV4({
      host,
      path: '/paapi5/searchitems',
      region: 'eu-west-1',
      service: 'ProductAdvertisingAPI',
      target: 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
      body,
      accessKey: env.AMAZON_ACCESS_KEY,
      secretKey: env.AMAZON_SECRET_KEY,
    });
    const r = await json(fetchImpl, `https://${host}/paapi5/searchitems`, { method: 'POST', headers, body });
    for (const it of r.SearchResult?.Items || []) {
      const p = it.Offers?.Listings?.[0]?.Price;
      if (p?.Amount && it.DetailPageURL)
        return {
          price: p.Amount,
          currency: p.Currency || 'EUR',
          url: it.DetailPageURL,
          title: it.ItemInfo?.Title?.DisplayValue,
          shipping: 0,
        };
    }
    return null;
  },
};

// ---------------------------------------------------------------- bol.com (NL) Marketing Catalog API — şema UNVERIFIED
let bolToken = { value: '', exp: 0 };
export const bol = {
  id: 'bol',
  shop: { market: 'nl', name: 'bol.com', domain: 'bol.com' },
  enabled: env => has(env, 'BOL_CLIENT_ID', 'BOL_CLIENT_SECRET'),
  async lookup(ean, { fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
    if (bolToken.exp < now()) {
      const basic = Buffer.from(`${env.BOL_CLIENT_ID}:${env.BOL_CLIENT_SECRET}`).toString('base64');
      const t = await json(fetchImpl, 'https://login.bol.com/token?grant_type=client_credentials', {
        method: 'POST',
        headers: { authorization: `Basic ${basic}` },
      });
      bolToken = { value: t.access_token, exp: now() + (t.expires_in - 30) * 1000 };
    }
    const r = await json(
      fetchImpl,
      `https://api.bol.com/marketing/catalog/v1/products/search?search-term=${encodeURIComponent(ean)}&country-code=NL&include-offer=true`,
      { headers: { authorization: `Bearer ${bolToken.value}`, accept: 'application/json' } },
    );
    const p = (r.results || r.products || [])[0];
    const price = num(p?.offer?.price ?? p?.bestOffer?.price);
    const url = p?.url || p?.productUrl;
    return price !== null && url ? { price, currency: 'EUR', url, title: p.title, shipping: 0 } : null;
  },
};

// ---------------------------------------------------------------- Google Shopping sonuçları: SerpAPI (ücretli)
export const serpapi = {
  id: 'serpapi',
  shop: { market: 'de', name: 'Google Shopping', domain: 'shopping.google.de' },
  enabled: env => has(env, 'SERPAPI_KEY'),
  async lookup(ean, { fetchImpl = fetch, env = process.env } = {}) {
    const q = new URLSearchParams({
      engine: 'google_shopping',
      q: ean,
      gl: 'de',
      hl: 'de',
      api_key: env.SERPAPI_KEY,
    });
    const r = await json(fetchImpl, `https://serpapi.com/search.json?${q}`);
    const best = (r.shopping_results || [])
      .map(i => ({
        price: num(i.extracted_price),
        currency: 'EUR',
        url: i.link || i.product_link,
        title: `${i.title} (${i.source})`,
        shipping: 0,
      }))
      .filter(o => o.price !== null && o.url)
      .sort((a, b) => a.price - b.price)[0];
    return best ?? null;
  },
};

export const CONNECTORS = [ebay, amazon, bol, serpapi];

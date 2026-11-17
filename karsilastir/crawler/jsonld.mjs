import { parsePrice } from '../lib/price.mjs';

/**
 * Sayfadan YALNIZCA schema.org Product/Offer verisini çıkarır: JSON-LD (öncelikli) ve microdata.
 * Başka hiçbir kaynaktan (CSS seçici, metin, dahili API) fiyat okunmaz.
 * Dönüş: [{ name, ean, brand, image, category, offers: [{ price, currency, inStock, url, shipping }] }]
 */
const GTIN_KEYS = ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8'];
const OUT_RE = /outofstock|soldout|discontinued/i;

const arr = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const hasType = (n, t) => arr(n?.['@type']).some(x => String(x).replace(/^.*[/#]/, '') === t);
/** Bazı mağazalar JSON-LD metnine HTML varlıkları gömer ("S&#x130;YAH"): bunlar çözülür. */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = s =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()];
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
  });
const str = v => (typeof v === 'string' ? decodeEntities(v).trim() : typeof v === 'number' ? String(v) : '');

function offersOf(node) {
  const out = [];
  for (const o of arr(node)) {
    if (!o || typeof o !== 'object') continue;
    if (arr(o.offers).length) out.push(...offersOf(o.offers));
    const spec = arr(o.priceSpecification)[0];
    const price = parsePrice(o.price ?? spec?.price ?? o.lowPrice);
    if (price === null) continue;
    const rate = arr(o.shippingDetails)[0]?.shippingRate?.value;
    out.push({
      price,
      currency: str(o.priceCurrency || spec?.priceCurrency).toUpperCase() || null,
      inStock: !OUT_RE.test(str(o.availability)),
      url: str(o.url) || null,
      shipping: rate ?? null,
    });
  }
  return out;
}

function fromProduct(n) {
  const gtinKey = GTIN_KEYS.find(k => str(n[k]));
  const img = arr(n.image)[0];
  return {
    name: str(n.name),
    ean: gtinKey ? str(n[gtinKey]) : '',
    brand: str(typeof n.brand === 'object' ? n.brand?.name : n.brand),
    image: str(typeof img === 'object' ? img?.url : img),
    category: str(arr(n.category)[0]),
    offers: offersOf(n.offers),
  };
}

function walk(node, found) {
  if (Array.isArray(node)) return node.forEach(x => walk(x, found));
  if (!node || typeof node !== 'object') return;
  if (hasType(node, 'Product')) found.push(fromProduct(node));
  else {
    walk(node['@graph'], found);
    walk(node.mainEntity, found);
  }
}

const stripTags = s =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

function prop(html, name) {
  const m = html.match(new RegExp(`<(\\w+)\\b([^>]*\\bitemprop\\s*=\\s*["']${name}["'][^>]*)>`, 'i'));
  if (!m) return '';
  const attr = a => m[2].match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const direct = attr('content') ?? attr('href');
  if (direct !== undefined) return direct.trim();
  const rest = html.slice(m.index + m[0].length);
  const end = rest.search(new RegExp(`</${m[1]}>`, 'i'));
  return stripTags(end >= 0 ? rest.slice(0, end) : '');
}

function microdata(html) {
  const parts = html
    .split(/(?=<[^>]*\bitemtype\s*=\s*["']https?:\/\/schema\.org\/Product["'])/i)
    .filter(p => /^<[^>]*\bitemtype/i.test(p));
  return parts.map(p => {
    const gtinKey = GTIN_KEYS.find(k => prop(p, k));
    const price = parsePrice(prop(p, 'price') || prop(p, 'lowPrice'));
    return {
      name: prop(p, 'name'),
      ean: gtinKey ? prop(p, gtinKey) : '',
      brand: prop(p, 'brand'),
      image: prop(p, 'image'),
      category: '',
      offers:
        price === null
          ? []
          : [
              {
                price,
                currency: prop(p, 'priceCurrency').toUpperCase() || null,
                inStock: !OUT_RE.test(prop(p, 'availability')),
                url: prop(p, 'url') || null,
                shipping: null,
              },
            ],
    };
  });
}

export function extractProducts(html) {
  const found = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html).matchAll(re)) {
    try {
      walk(JSON.parse(m[1].trim()), found);
    } catch {
      // bozuk JSON-LD bloğu atlanır; diğer bloklar işlenmeye devam eder
    }
  }
  const withOffers = found.filter(p => p.offers.length);
  if (withOffers.length) return withOffers;
  return microdata(String(html)).filter(p => p.offers.length);
}

/** Sayfada birden çok teklif varsa en ucuz stoklu olanı (yoksa en ucuzu) seçer. */
export function bestOffer(product) {
  const inStock = product.offers.filter(o => o.inStock);
  const pool = inStock.length ? inStock : product.offers;
  return pool.reduce((a, b) => (b.price < a.price ? b : a), pool[0]);
}

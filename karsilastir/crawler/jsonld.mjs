import { gtinChecksumOk } from '../lib/ean.mjs';
import { parsePrice } from '../lib/price.mjs';

/**
 * Sayfadan YALNIZCA schema.org Product/Offer verisini çıkarır: JSON-LD (öncelikli) ve microdata.
 * Başka hiçbir kaynaktan (CSS seçici, metin, dahili API) fiyat okunmaz.
 * Dönüş: [{ name, ean, mpn, sku, brand, image, category, offers: [{ price, currency, inStock, url, shipping }] }]
 * GTIN, mikroveride `<meta itemprop="gtin13" content="...">` ya da `<span itemprop="gtin8" content="...">` olarak da gelir
 * (jacob.de, mindfactory.de, reichelt.de); alan adı ne olursa olsun değer ingest'te EAN olarak doğrulanır
 * (gtin8 alanına yazılmış 13 haneli EAN de geçerli sayılır).
 */
const GTIN_KEYS = ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8'];
const OUT_RE = /outofstock|soldout|discontinued/i;

const arr = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const hasType = (n, t) => arr(n?.['@type']).some(x => String(x).replace(/^.*[/#:]/, '') === t);
/** Bazı mağazalar JSON-LD metnine HTML varlıkları gömer ("S&#x130;YAH"): bunlar çözülür. */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = s =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()];
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
  });
const str = v => (typeof v === 'string' ? decodeEntities(v).trim() : typeof v === 'number' ? String(v) : '');

/**
 * Aynı sayfadaki başka JSON-LD bloklarında tanımlı düğümlere `{ "@id": "..." }` ile verilen bağlar (voelkner.de:
 * Product, Offer, Brand ayrı bloklarda). Dizin tüm bloklardan toplanır; yalnız-@id düğümleri gerçek düğüme çözülür.
 */
let ids = new Map();
const deref = v => {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v['@id'] === 'string') {
    const full = ids.get(v['@id']);
    if (full && full !== v && Object.keys(v).length === 1) return full;
  }
  return v;
};

function offersOf(node, depth = 0) {
  const out = [];
  if (depth > 4) return out;
  for (const o0 of arr(node)) {
    const o = deref(o0);
    if (!o || typeof o !== 'object') continue;
    if (arr(o.offers).length) out.push(...offersOf(o.offers, depth + 1));
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

/** GTIN önce Product düğümünden, yoksa (bazı mağazalar böyle yazar) ilk Offer düğümünden okunur. */
function gtinOf(n) {
  for (const node of [n, ...arr(n.offers).filter(o => o && typeof o === 'object')]) {
    const k = GTIN_KEYS.find(key => str(node[key]));
    if (k) return str(node[k]);
  }
  return '';
}

/** `parent`: ProductGroup (parfumdreams.de); varyantta eksik ad/marka/görsel/kategori gruptan tamamlanır. */
function fromProduct(n, parent = null) {
  const pick = k => (n[k] !== undefined && n[k] !== null && n[k] !== '' ? n[k] : parent?.[k]);
  const img = arr(deref(pick('image')))[0];
  const imgNode = deref(img);
  const brand = deref(arr(pick('brand'))[0]);
  return {
    name: str(pick('name')),
    ean: gtinOf(n),
    mpn: str(n.mpn),
    sku: str(n.sku),
    brand: str(typeof brand === 'object' ? brand?.name : brand),
    image: str(typeof imgNode === 'object' ? imgNode?.url : imgNode),
    category: str(arr(pick('category'))[0]),
    offers: offersOf(n.offers),
  };
}

function walk(node, found, parent = null) {
  if (Array.isArray(node)) return node.forEach(x => walk(x, found, parent));
  if (!node || typeof node !== 'object') return;
  if (hasType(node, 'ProductGroup')) {
    const variants = arr(node.hasVariant).map(deref);
    // Varyantsız grup: teklif doğrudan grupta olabilir.
    if (!variants.length) found.push(fromProduct(node));
    for (const v of variants) walk(v, found, node);
  } else if (hasType(node, 'Product')) found.push(fromProduct(node, parent));
  else {
    walk(node['@graph'], found);
    walk(node.mainEntity, found);
  }
}

/** Tüm bloklardaki (iç içe @graph dahil) @id'li düğümleri dizine alır. */
function indexIds(node) {
  if (Array.isArray(node)) return node.forEach(indexIds);
  if (!node || typeof node !== 'object') return;
  if (typeof node['@id'] === 'string' && Object.keys(node).length > 1 && !ids.has(node['@id']))
    ids.set(node['@id'], node);
  indexIds(node['@graph']);
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
      mpn: prop(p, 'mpn'),
      sku: prop(p, 'sku'),
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

/**
 * Metinden EAN (yalnız `eanFromText` açık mağazalar için, JSON-LD / microdata'da gtin yoksa): "EAN: <13 hane>" ya da
 * `productEAN: "<13 hane>"`. Sayfada TEK bir değer (tekrarlar aynı değerse sayılır) ve sağlama toplamı tutarsa döner;
 * iki farklı EAN görünürse (ilgili ürün, aksesuar) hiçbiri alınmaz.
 */
export function eanFromPageText(html) {
  const found = new Set();
  const res = [
    /\bEAN\b\s*:?\s*(?:<[^>]*>\s*)*(\d{13})(?!\d)/gi,
    /productEAN["']?\s*[:=]\s*["']?(\d{13})(?!\d)/gi,
  ];
  for (const re of res) for (const m of String(html).matchAll(re)) found.add(m[1]);
  const [only] = [...found];
  return found.size === 1 && gtinChecksumOk(only) ? only : '';
}

/**
 * JSON-LD'si olmayan mağaza (office-partner.de) için yedek: sayfada schema.org mikroverisi olarak `itemprop="price"` ve
 * metinde tek bir EAN varsa tek ürün kurulur. Fiyat yine yalnız schema.org işaretinden okunur (CSS seçici yok).
 */
function textProduct(html) {
  const ean = eanFromPageText(html);
  const price = parsePrice(prop(html, 'price'));
  const og = html.match(
    /<meta\b[^>]*\bproperty\s*=\s*["']og:title["'][^>]*\bcontent\s*=\s*["']([^"']*)["']/i,
  )?.[1];
  const name = decodeEntities(prop(html, 'name') || og || '').trim();
  if (!ean || price === null || !name) return [];
  return [
    {
      name,
      ean,
      mpn: '',
      sku: '',
      brand: prop(html, 'brand'),
      image: '',
      category: '',
      offers: [
        {
          price,
          currency: prop(html, 'priceCurrency').toUpperCase() || null,
          inStock: !OUT_RE.test(prop(html, 'availability')),
          url: null,
          shipping: null,
        },
      ],
    },
  ];
}

/** @param {string} html @param {{ eanFromText?: boolean }} [opts] */
export function extractProducts(html, { eanFromText = false } = {}) {
  const found = [];
  const blocks = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html).matchAll(re)) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // bozuk JSON-LD bloğu atlanır; diğer bloklar işlenmeye devam eder
    }
  }
  ids = new Map();
  for (const b of blocks) indexIds(b);
  for (const b of blocks) walk(b, found);
  ids = new Map();
  const withOffers = found.filter(p => p.offers.length);
  let out = withOffers.length ? withOffers : microdata(String(html)).filter(p => p.offers.length);
  if (eanFromText) {
    if (!out.length) out = textProduct(String(html));
    else if (out.length === 1 && !out[0].ean) out[0].ean = eanFromPageText(html);
  }
  return out;
}

/** Sayfada birden çok teklif varsa en ucuz stoklu olanı (yoksa en ucuzu) seçer. */
export function bestOffer(product) {
  const inStock = product.offers.filter(o => o.inStock);
  const pool = inStock.length ? inStock : product.offers;
  return pool.reduce((a, b) => (b.price < a.price ? b : a), pool[0]);
}

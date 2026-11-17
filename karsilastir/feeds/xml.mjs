import { DEFAULT_MAPPING, parseInStock } from './csv.mjs';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : '';
    }
    return ENT[e.toLowerCase()];
  });

function childText(block, tag) {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = block.match(new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc}>`, 'i'));
  if (!m) return undefined;
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decode(m[1])).trim();
}

/**
 * XML besleme (RSS/Google Merchant benzeri): her <item> ya da <product> (mapping._itemTag ile değişir) bir satırdır;
 * mapping değerleri alt etiket adlarıdır (örn. "g:gtin"). Tam XML ayrıştırıcı değil, bilinçli olarak küçük tutuldu.
 */
export function parseXmlFeed(xml, mapping = {}) {
  const m = { ...DEFAULT_MAPPING, ...mapping };
  const itemTag =
    mapping._itemTag || (/<item[\s>]/i.test(xml) ? 'item' : /<product[\s>]/i.test(xml) ? 'product' : 'entry');
  const blocks = [...xml.matchAll(new RegExp(`<${itemTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${itemTag}>`, 'gi'))];
  return blocks.map(b => {
    const g = f => childText(b[1], String(m[f]));
    const stock = g('inStock');
    return {
      ean: g('ean'),
      title: g('title'),
      price: g('price'),
      url: g('url'),
      shipping: g('shipping'),
      inStock: stock === undefined ? undefined : parseInStock(stock),
      brand: g('brand'),
      category: g('category'),
      image: g('image'),
      currency: g('currency'),
    };
  });
}

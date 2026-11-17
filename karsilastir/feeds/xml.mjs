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

const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Etiket adı deseni: önekli ad ("g:gtin") aynen, öneksiz ad ("name") her ad alanı önekiyle ("ns2:name") eşleşir. */
const tagPat = tag => (tag.includes(':') ? reEsc(tag) : `(?:[\\w.-]+:)?${reEsc(tag)}`);

/** block içindeki ilk <tag> öğesinin ham iç metni ve açılış etiketi. */
function element(block, tag) {
  const t = tagPat(tag);
  const m = block.match(new RegExp(`<(${t})(\\s[^>]*)?>([\\s\\S]*?)</\\1\\s*>`, 'i'));
  return m ? { attrs: m[2] || '', inner: m[3] } : undefined;
}

const textOf = raw => {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decode(raw)).trim();
};

/**
 * Yol ile değer: "a/b" = a'nın içindeki ilk b; "a/b@attr" = öznitelik. Her adım ilk alt-öğeyi (derinlik fark etmez) bulur.
 * İçinde başka etiket bulunan öğe metin olarak döndürülmez (undefined).
 */
export function xmlValue(block, path) {
  const [p, attr] = String(path).split('@');
  let cur = { attrs: '', inner: block };
  for (const step of p.split('/').filter(Boolean)) {
    cur = element(cur.inner, step);
    if (!cur) return undefined;
  }
  if (attr) {
    const m = cur.attrs.match(new RegExp(`(?:^|\\s)${reEsc(attr)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    return m ? decode(m[2] ?? m[3]).trim() : undefined;
  }
  if (/<(?!!\[CDATA\[)[a-z]/i.test(cur.inner)) return undefined;
  return textOf(cur.inner);
}

const childText = (block, tag) => xmlValue(block, tag);

/**
 * Akışlı öğe ayırıcı: push(metin) tamamlanan <itemTag>…</itemTag> iç metinlerini döner.
 * itemTag boşsa ilk 64 KB'tan anlaşılır (item, product, entry). maxItem: tek öğe üst sınırı.
 */
export function createXmlItemSplitter({ itemTag = '', maxItem = 4 * 1024 * 1024 } = {}) {
  let buf = '';
  let open;
  let close;
  const setTag = tag => {
    open = new RegExp(`<(${tagPat(tag)})(?:\\s[^>]*)?>`, 'gi');
    close = tag;
  };
  if (itemTag) setTag(itemTag);
  const scan = final => {
    if (!open) {
      if (!final && buf.length < 64 * 1024) return [];
      setTag(/<(?:[\w.-]+:)?item[\s>]/i.test(buf) ? 'item' : /<(?:[\w.-]+:)?product[\s>]/i.test(buf) ? 'product' : 'entry');
    }
    const items = [];
    let pos = 0;
    for (;;) {
      open.lastIndex = pos;
      const o = open.exec(buf);
      if (!o) {
        const lt = buf.lastIndexOf('<');
        pos = lt >= pos ? lt : buf.length;
        break;
      }
      const closeRe = new RegExp(`</${reEsc(o[1])}\\s*>`, 'gi');
      closeRe.lastIndex = o.index + o[0].length;
      const c = closeRe.exec(buf);
      if (!c) {
        pos = o.index;
        if (buf.length - pos > maxItem) throw new Error('XML öğesi çok büyük');
        break;
      }
      items.push(buf.slice(o.index + o[0].length, c.index));
      pos = c.index + c[0].length;
    }
    buf = buf.slice(pos);
    return items;
  };
  return {
    push(text) {
      buf += text;
      return scan(false);
    },
    end: () => scan(true),
  };
}

/**
 * XML besleme (RSS/Google Merchant benzeri): her <item> ya da <product> (mapping._itemTag ile değişir) bir satırdır;
 * mapping değerleri alt etiket adlarıdır (örn. "g:gtin"). Tam XML ayrıştırıcı değil, bilinçli olarak küçük tutuldu.
 */
export function parseXmlFeed(xml, mapping = {}) {
  const m = { ...DEFAULT_MAPPING, ...mapping };
  const sp = createXmlItemSplitter({ itemTag: mapping._itemTag || '', maxItem: Infinity });
  const blocks = [...sp.push(xml), ...sp.end()];
  return blocks.map(b => {
    const g = f => childText(b, String(m[f]));
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

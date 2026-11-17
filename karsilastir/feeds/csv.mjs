/** RFC 4180 uyumlu küçük CSV ayrıştırıcı (tırnak, çift tırnak kaçışı, satır içi yeni satır); ayırıcı otomatik bulunur. */
export function detectDelimiter(text) {
  const head = text.split(/\r?\n/, 1)[0] || '';
  const count = d => head.split(d).length - 1;
  return [',', ';', '\t', '|'].reduce((best, d) => (count(d) > count(best) ? d : best));
}

export function parseCsv(text, delimiter) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

export const DEFAULT_MAPPING = {
  ean: 'ean',
  title: 'title',
  price: 'price',
  url: 'link',
  shipping: 'shipping',
  inStock: 'availability',
  brand: 'brand',
  category: 'category',
  image: 'image',
  currency: 'currency',
};

const FALSE_RE = /^(0|false|no|n|hayır|hayir|yok|nein)$|out|yok|nein|niet|sold|stokta de/i;

/** Stok metni -> boolean. Bilinmeyen/boş değer "stokta" sayılır. */
export function parseInStock(v) {
  if (v === undefined || v === null || String(v).trim() === '') return true;
  return !FALSE_RE.test(String(v).trim());
}

/** Alan eşlemesi: mapping {alan: sütun başlığı}; başlıklar büyük/küçük harf duyarsız. Çıktı: ingestOffer satırları. */
export function mapCsvRows(rows, mapping = {}) {
  if (rows.length < 2) return [];
  const m = { ...DEFAULT_MAPPING, ...mapping };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = Object.fromEntries(
    Object.entries(m).map(([field, col]) => [field, header.indexOf(String(col).toLowerCase())]),
  );
  const get = (r, f) => (idx[f] >= 0 ? (r[idx[f]] ?? '').trim() : undefined);
  return rows.slice(1).map(r => ({
    ean: get(r, 'ean'),
    title: get(r, 'title'),
    price: get(r, 'price'),
    url: get(r, 'url'),
    shipping: get(r, 'shipping'),
    inStock: idx.inStock >= 0 ? parseInStock(get(r, 'inStock')) : undefined,
    brand: get(r, 'brand'),
    category: get(r, 'category'),
    image: get(r, 'image'),
    currency: get(r, 'currency'),
  }));
}

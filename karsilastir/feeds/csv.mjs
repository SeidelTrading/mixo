/** RFC 4180 uyumlu küçük CSV ayrıştırıcı (tırnak, çift tırnak kaçışı, satır içi yeni satır); ayırıcı otomatik bulunur. */
export function detectDelimiter(text) {
  const head = text.split(/\r?\n/, 1)[0] || '';
  const count = d => head.split(d).length - 1;
  return [',', ';', '\t', '|'].reduce((best, d) => (count(d) > count(best) ? d : best));
}

/**
 * Artımlı (akışlı) CSV ayrıştırıcı: push(metin) tamamlanan satırları döner, end() kalanı.
 * Parça sınırı tırnak/CRLF ortasına denk gelebilir; durum parçalar arasında korunur.
 * maxField: tek alan üst sınırı (kapanmayan tırnak tüm dosyayı belleğe çekmesin).
 */
export function createCsvParser({ delimiter = '', maxField = 1024 * 1024 } = {}) {
  let d = delimiter;
  let head = '';
  let first = true;
  let field = '';
  let row = [];
  let quoted = false;
  let quoteSeen = false;
  let skipLf = false;
  let out = [];
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some(f => f !== '')) out.push(row);
    row = [];
  };
  const feed = src => {
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (skipLf) {
        skipLf = false;
        if (c === '\n') continue;
      }
      if (quoteSeen) {
        quoteSeen = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }
      if (quoted) {
        if (c === '"') quoteSeen = true;
        else field += c;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === d) {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        skipLf = c === '\r';
        endRow();
      } else field += c;
      if (field.length > maxField) throw new Error('CSV alanı çok uzun (kapanmamış tırnak?)');
    }
  };
  const drain = () => {
    const r = out;
    out = [];
    return r;
  };
  return {
    push(text) {
      if (first) {
        head += text;
        if (!/[\r\n]/.test(head) && head.length < 64 * 1024) return [];
        if (head.charCodeAt(0) === 0xfeff) head = head.slice(1);
        d ||= detectDelimiter(head);
        first = false;
        text = head;
        head = '';
      }
      feed(text);
      return drain();
    },
    end() {
      if (first) {
        first = false;
        if (head.charCodeAt(0) === 0xfeff) head = head.slice(1);
        d ||= detectDelimiter(head);
        feed(head);
      }
      if (field !== '' || row.length) endRow();
      return drain();
    },
  };
}

export function parseCsv(text, delimiter) {
  const p = createCsvParser({ delimiter, maxField: Infinity });
  return [...p.push(text), ...p.end()];
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

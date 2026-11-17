import { parseInStock } from './csv.mjs';

/**
 * Affiliate ağı besleme ön ayarları (preset).
 * columns: alan -> sütun adı (CSV, büyük/küçük harf duyarsız) ya da XML yolu (xmlValue: "a/b", "a@attr");
 * dizi verilirse ilk BOŞ OLMAYAN değer alınır.
 * Alanlar: ean, mpn (üretici parça no; EAN'sız tarayıcı tekliflerinin eşleşmesi için), title, brand, price, shipping, currency, url (mağaza ürün adresi), deepLink (affiliate yönlendirme),
 * image, category, inStock, merchantId, merchantName, country.
 *
 * Belgelenmemiş / doğrulanmamış sütunlar UNVERIFIED diye işaretlidir; gerçek dosya gelince admin
 * sayfasındaki "mapping JSON" ile ezilebilir (örn. {"price":"store_price","_delimiter":";"}).
 */

export const NETWORK_FIELDS = [
  'ean',
  'mpn',
  'title',
  'brand',
  'price',
  'shipping',
  'currency',
  'url',
  'deepLink',
  'image',
  'category',
  'inStock',
  'merchantId',
  'merchantName',
  'country',
];

/** Ön ayar dışı seçenekler (mapping JSON'da da kullanılabilir). */
export const MAPPING_OPTIONS = ['_itemTag', '_delimiter', '_blankOutOfStock', '_currency'];

export const NETWORKS = {
  /**
   * Awin "Create-a-Feed" CSV. Kaynak: https://help.awin.com/developers/docs/hosting-feeds
   * VERIFIED: ean, product_name, brand_name, delivery_cost, currency, merchant_category, in_stock, aw_deep_link
   *   (aw_deep_link: "enhanced feed" SSS). in_stock: boş ya da 0 = stokta yok -> _blankOutOfStock.
   * UNVERIFIED: search_price / store_price, merchant_deep_link, merchant_image_url / aw_image_url,
   *   merchant_id, merchant_name, product_GTIN (EAN alternatifi).
   * Ülke sütunu yok: pazar para biriminden ve beslemenin varsayılan pazarından çıkar.
   */
  awin: {
    label: 'Awin (CSV)',
    format: 'csv',
    blankOutOfStock: true,
    columns: {
      ean: ['ean', 'product_gtin'], // product_GTIN: UNVERIFIED
      mpn: 'mpn', // UNVERIFIED
      title: 'product_name',
      brand: 'brand_name',
      price: ['search_price', 'store_price'], // UNVERIFIED
      shipping: 'delivery_cost',
      currency: 'currency',
      url: 'merchant_deep_link', // UNVERIFIED
      deepLink: 'aw_deep_link',
      image: ['merchant_image_url', 'aw_image_url'], // UNVERIFIED
      category: 'merchant_category',
      inStock: 'in_stock',
      merchantId: 'merchant_id', // UNVERIFIED
      merchantName: 'merchant_name', // UNVERIFIED
    },
  },

  /**
   * Daisycon CSV. TAMAMI UNVERIFIED: resmi SSS 403 döndü; üçüncü taraf kaynak https://nordpar.com/?p=1919
   * program_id / program_name tahmindir.
   */
  daisycon: {
    label: 'Daisycon (CSV, unverified)',
    format: 'csv',
    blankOutOfStock: false,
    columns: {
      ean: 'ean',
      title: 'title',
      brand: 'brand',
      price: 'price',
      shipping: 'price_shipping',
      currency: 'currency',
      deepLink: 'link',
      image: 'image_default',
      category: 'category',
      inStock: 'in_stock',
      merchantId: 'program_id', // tahmin
      merchantName: 'program_name', // tahmin
    },
  },

  /**
   * Tradedoubler Products API XML. Kaynak: https://dev.tradedoubler.com/products/publisher
   * Adres biçimi: https://api.tradedoubler.com/1.0/productsUnlimited.xml;fid={id}?token={key}
   * Öğe: <ns2:product> (ad alanı öneki fark etmez). XML YERLEŞİMİ UNVERIFIED (alan adları belgeden,
   * iç içe yapı varsayım). Ürün başına para birimi alanı yok: price/currency, price@currency ya da
   * programın para birimi (mapping "_currency") kullanılır. merchantId: programId ya da feedId.
   */
  tradedoubler: {
    label: 'Tradedoubler (XML, layout unverified)',
    format: 'xml',
    itemTag: 'product',
    blankOutOfStock: false,
    columns: {
      ean: ['identifiers/ean', 'ean'],
      mpn: ['identifiers/mpn', 'mpn'], // UNVERIFIED
      title: 'name',
      brand: 'brand',
      price: ['price/value', 'price'],
      shipping: 'shippingCost',
      currency: ['price/currency', 'price@currency', 'currency'],
      url: 'sourceProductUrl',
      deepLink: 'productUrl',
      image: ['productImage/url', 'productImage'],
      category: ['categories/category@name', 'categories/category/name', 'categories/category'],
      inStock: ['inStock', 'availability'],
      merchantId: ['programId', 'feedId'],
      merchantName: 'programName',
    },
  },
};

export const isNetwork = n => Object.hasOwn(NETWORKS, n);

/**
 * Ön ayarı mapping JSON (nesne) ile birleştirir. Bilinmeyen anahtar ya da geçersiz değer hata fırlatır.
 * Dönüş: { format, itemTag, delimiter, blankOutOfStock, currency, columns: {alan: string[]} }
 */
export function resolvePreset(network, mapping = {}) {
  const p = NETWORKS[network];
  if (!p) throw new Error(`bilinmeyen ağ: ${network}`);
  const m = mapping || {};
  for (const [k, v] of Object.entries(m)) {
    if (MAPPING_OPTIONS.includes(k)) continue;
    if (!NETWORK_FIELDS.includes(k)) throw new Error(`mapping: bilinmeyen alan "${k}"`);
    const ok = typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string'));
    if (!ok) throw new Error(`mapping: "${k}" metin ya da metin dizisi olmalı`);
  }
  const columns = {};
  for (const f of NETWORK_FIELDS) {
    const c = m[f] ?? p.columns[f];
    if (c !== undefined && c !== '') columns[f] = [c].flat().filter(Boolean);
  }
  return {
    format: p.format,
    itemTag: m._itemTag || p.itemTag || '',
    delimiter: m._delimiter || '',
    blankOutOfStock: m._blankOutOfStock ?? p.blankOutOfStock,
    currency: m._currency ? String(m._currency).toUpperCase() : '',
    columns,
  };
}

/**
 * Ham değer okuyucu get(sütun) ile bir satırı ortak biçime çevirir.
 * get: sütun/yol -> metin | undefined.
 */
export function mapNetworkRow(get, preset) {
  const out = {};
  for (const [f, cols] of Object.entries(preset.columns)) {
    for (const c of cols) {
      const v = get(c);
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        out[f] = String(v).trim();
        break;
      }
    }
  }
  if (out.currency) out.currency = out.currency.toUpperCase();
  else if (preset.currency) out.currency = preset.currency;
  if ('inStock' in preset.columns) {
    const v = out.inStock;
    out.inStock = v === undefined ? !preset.blankOutOfStock : parseInStock(v);
  }
  return out;
}

/** CSV başlık satırından get() üretir. */
export function csvGetter(header) {
  const idx = new Map();
  header.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    if (!idx.has(k)) idx.set(k, i);
  });
  return row => col => {
    const i = idx.get(String(col).toLowerCase());
    return i === undefined ? undefined : row[i];
  };
}

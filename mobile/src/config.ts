/**
 * Tek ayar dosyası. Veri kaynağı değişince (ör. Shopify Storefront API) yalnızca
 * burası ve src/api/shop.ts değişir; ekranlar bu iki dosyayı bilmez.
 *
 * Taban adresi geçersiz kılmak için: EXPO_PUBLIC_API_BASE=https://... npx expo start
 */
export const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE ?? 'https://web-production-a959d0b7.up.railway.app').replace(/\/$/, '');

/** Düz dosya adı olan görseller bu CDN'den gelir (vitrin app.js ile aynı kural). */
export const IMAGE_CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/';

/** Demo sunucusundaki kargo kuralı (server.mjs: SHIP_FEE). Gerçek kuralı mağaza belirler. */
export const SHIP_FEE = 5.5;
export const FREE_SHIPPING_FALLBACK = 39;

/** Ana sayfa şerit başlıklarının sınırları (strings.ts T.budget / T.from120 ile aynı). */
export const BUDGET_MAX = 25;
export const PREMIUM_MIN = 120;

/* ───── liste, arama ve önbellek ayarları ───── */
export const CHUNK_CONCURRENCY = 4; // aynı anda indirilen en çok parça
export const SORT_CHUNK_LIMIT = 25; // fiyat sıralaması için en çok parça; üstünde önce alt kategori seçilir
export const SEARCH_STEP = 4; // aramada aynı anda taranan parça (sonuçlar her grup sonrası ekrana akar)
export const AUTOLOAD_MAX_CHUNKS = 3; // süzgeçli listede tek kaydırma tetiklemesinde en çok yüklenen parça
export const PAGE = 40; // listede her seferinde gösterilen ek ürün
export const RAIL_MAX = 12; // yatay şeritte en çok ürün
export const UNDO_MS = 5000; // "Rückgängig" bildiriminin süresi
export const HOME_TTL_MS = 60_000; // getHome önbellek süresi
export const GRID_WIDE_MIN = 700; // bu genişlikten itibaren 3 sütun

/** Fiyat süzgeci aralıkları; kapsül metni strings.ts priceRangeLabel ile üretilir. */
export const PRICE_RANGES: readonly { id: string; min: number; max: number }[] = [
  { id: '0-25', min: 0, max: 25 },
  { id: '25-100', min: 25, max: 100 },
  { id: '100-500', min: 100, max: 500 },
  { id: '500-', min: 500, max: Infinity },
];

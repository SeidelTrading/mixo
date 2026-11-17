import { round2 } from './price.mjs';

/** Toplam fiyat = ürün + kargo (kargo bilinmiyorsa 0). */
export const totalPrice = o => round2(Number(o.price) + Number(o.shipping || 0));

/**
 * Teklifleri toplam fiyata göre artan sıralar. Stokta olanlar önce gelir; eşitlikte düşük ürün fiyatı,
 * sonra mağaza adı. Girdiyi değiştirmez; her teklife `total` ekler.
 */
export function sortOffers(offers) {
  return offers
    .map(o => ({ ...o, total: totalPrice(o) }))
    .sort(
      (a, b) =>
        Number(!!b.inStock) - Number(!!a.inStock) ||
        a.total - b.total ||
        a.price - b.price ||
        String(a.shopName || '').localeCompare(String(b.shopName || '')),
    );
}

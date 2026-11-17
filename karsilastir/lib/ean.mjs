/** GTIN-8/12/13/14 kontrol hanesi doğrulaması. */
export function gtinChecksumOk(digits) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/**
 * Girdiyi (boşluk/tire/".0" temizlenir) doğrular ve kanonik biçime çevirir:
 * 12 haneli UPC ve 0 ile başlayan GTIN-14 -> 13 hane; 8 hane olduğu gibi kalır. Geçersizse null.
 */
export function normalizeEan(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\.0+$/, '').replace(/[\s-]/g, '');
  if (!gtinChecksumOk(s)) return null;
  if (s.length === 12) s = '0' + s;
  if (s.length === 14 && s[0] === '0') s = s.slice(1);
  return s;
}

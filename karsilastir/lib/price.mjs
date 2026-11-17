/**
 * Fiyat metnini sayıya çevirir: "1.299,90 TL", "1,299.90", "129,90", 12.5, "12.50".
 * Kural: hem '.' hem ',' varsa sondaki ayırıcı ondalıktır; tek ',' ondalıktır (3 haneli ise binliktir);
 * tek '.' ondalıktır (tam 3 haneli ve tamsayı kısmı 1-3 haneliyse binlik sayılır, örn. "1.299").
 * Sıfır, negatif ve çözülemeyen değer null döner.
 */
export function parsePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? round2(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-') || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let norm;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    norm = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    norm = parts.length > 2 || parts[1].length === 3 ? parts.join('') : parts.join('.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    const thousands =
      parts.length > 2 || (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3);
    norm = thousands ? parts.join('') : s;
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

export const round2 = n => Math.round(n * 100) / 100;

/** Gönderi ücreti: 0 geçerlidir (ücretsiz kargo); çözülemezse null. */
export function parseShipping(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && /^(free|ücretsiz|ucretsiz|gratis|kostenlos)$/i.test(v.trim())) return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? round2(v) : null;
  const n = parsePrice(String(v));
  if (n !== null) return n;
  return /^\s*0+([.,]0+)?\D*$/.test(String(v)) ? 0 : null;
}

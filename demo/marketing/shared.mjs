export const DAY = 864e5,
  MIN_EVENTS = 20,
  MAX_ITEMS = 8;
export { EMAIL_RE } from '../lib/validate.mjs';
// Almanya (UWG): sahte aciliyet / baskı kalıpları. Metin kaydedilmeden uyarılır (Instagram) ya da reddedilir (hatırlatma şablonu).
export const DARK =
  /nur noch (\d|heute|wenige|ein paar)|letzte[nr]? chance|nur heute|jetzt oder nie|solange der vorrat|countdown|l[aä]uft ab|zeitlich begrenzt|nur f[uü]r kurze zeit|beeil/i;
export const DISCOUNT = /\d+\s?%\s?(rabatt|reduziert|sparen|g[uü]nstiger)|statt\s+\d|\buvp\b|streichpreis/i;
export const lintText = t => {
  const w = [];
  if (DARK.test(t)) w.push('Sahte aciliyet/stok baskısı kalıbı var (Almanya’da ihtar riski)');
  if (DISCOUNT.test(t))
    w.push('İndirim/eski fiyat iddiası var: yalnız doğrulanabilir (gerçek) eski fiyat varsa kullanın');
  return w;
};

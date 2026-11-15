// Ürün → gönderi içeriği: görsel, bağlantı, etiketler, anlık görüntü.
export function makeContent(c) {
  const { effP, SITE, CDN, norm } = c;
  /* ───────── ürün → gönderi içeriği ───────── */
  const imageUrl = p => {
    const s = effP(p).img || '';
    if (!s) return '';
    if (s.startsWith('https:')) return s;
    if (s.startsWith('fix/')) return `${SITE}/img/${s}`;
    if (s.startsWith('img/')) return `${SITE}/${s}`;
    return `${CDN}${s}?width=1080&format=jpg`;
  };
  const linkOf = (p, src = 'post') =>
    `${SITE}/?p=${encodeURIComponent(p.id)}&utm_source=instagram&utm_medium=${src}`;
  const tag = s => '#' + norm(s).replace(/[^a-z0-9]/g, '');
  const hashtags = p =>
    [
      ...new Set(
        ['#outletshop', '#onlineshop', tag(p.catLabel), tag(p.vendor), tag(p.sub)].filter(
          t => t.length > 3 && t.length < 28,
        ),
      ),
    ].slice(0, 6);
  const snapOf = p => {
    const e = effP(p);
    return { title: e.title, price: e.price, na: !!e.na, img: e.img || '' };
  };
  return { imageUrl, linkOf, tag, hashtags, snapOf };
}

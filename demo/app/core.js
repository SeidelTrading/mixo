/* Outlet vitrini — Sabitler, yardımcılar, yerel depo, düzenleme (OV) uygulaması, sepet/merkliste durumu. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).core = async function (Ctx) {
  const S = Ctx.S;
  const IDX = window.MX_INDEX,
    F = window.MX_FEATURED;
  const $ = s => document.querySelector(s),
    $$ = s => [...document.querySelectorAll(s)];
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => n.toLocaleString('de-DE');
  const esc = s =>
    String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  S.FREE = 39;
  const SHIP = 5.5,
    PAGE = 24;
  const fmtN = n => String(n).replace('.', ',');
  const CDN = 'https://cdn.shopify.com/s/files/1/0799/7639/9006/files/';
  const imgUrl = (s, w = 480) =>
    !s
      ? ''
      : s.startsWith('fix/')
        ? 'img/' + s
        : s.startsWith('img/') || s.startsWith('http')
          ? s
          : CDN + s + '?width=' + w;
  /* yönetici düzenlemeleri (başlık, fiyat, stok, görsel) ve gizli kategoriler: /api/config ile gelir */
  S.OV = {};
  const HIDCAT = new Set();
  /* _b: düzenlemeden önceki özgün değerler (kopyayla birlikte saklanır); düzenleme kalkınca özgün değere dönülür */
  const ov = p => {
    const o = S.OV[p.id];
    if (!o && !p._b) return p;
    const b = (p._b ??= { title: p.title, price: p.price, was: p.was, na: p.na, img: p.img }),
      t = p.title;
    Object.assign(p, b);
    if (o) {
      if (o.title != null) p.title = o.title;
      if (o.price != null) p.price = o.price;
      if (o.was != null) p.was = o.was;
      if (o.na != null) p.na = !!o.na;
      if (o.img) p.img = o.img;
    } else delete p._b;
    if (p.title !== t) delete p._h;
    return p;
  };
  const CAT = Object.fromEntries(IDX.cats.map(c => [c.k, c]));
  const label = k => CAT[k]?.label || '';
  const store = {
    get(k, d) {
      try {
        return JSON.parse(localStorage.getItem(k)) ?? d;
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {}
    },
  };
  F.forEach(p => {
    p.si = CAT[p.cat] ? CAT[p.cat].subs.findIndex(s => s.name === p.sub) : -1;
  });
  const known = new Map(F.map(p => [p.id, p]));
  const cart = store.get('mx-cart2', {}),
    wish = store.get('mx-wish2', {});
  Object.values(cart).forEach(e => e?.p && known.set(e.p.id, e.p));
  Object.values(wish).forEach(p => p?.id && known.set(p.id, p));
  const blank = () => ({
    cat: 'all',
    sub: -1,
    q: '',
    sort: '',
    wishOnly: false,
    shown: PAGE,
    brands: new Set(),
    pmin: null,
    pmax: null,
    avail: false,
  });
  S.state = blank();
  S.token = 0;
  S.facetBrands = null;
  S.bq = '';
  S.qCounts = null;
  S.qCountsFor = '';
  S.applying = false;
  S.pushNext = false;
  S.lastTracked = '';
  const HEART =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M20.5 5.5c-2.3-2.4-6.1-1.7-8.5 1-2.4-2.7-6.2-3.4-8.5-1-5 5 3.4 11.6 8.5 15 5.1-3.4 13.5-10 8.5-15Z"/></svg>';
  const taxTxt = () => 'inkl. MwSt. · zzgl. 5,50 € DHL-Versand · ab ' + fmtN(S.FREE) + ' € kostenlos (DE)';
  Object.assign(Ctx, {
    IDX,
    F,
    $,
    $$,
    eur,
    num,
    esc,
    SHIP,
    PAGE,
    fmtN,
    CDN,
    imgUrl,
    HIDCAT,
    ov,
    CAT,
    label,
    store,
    known,
    cart,
    wish,
    blank,
    HEART,
    taxTxt,
  });
};

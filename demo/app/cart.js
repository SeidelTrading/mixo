/* Outlet vitrini — Sepet, ücretsiz kargo önerileri, bildirim. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).cart = async function (Ctx) {
  const S = Ctx.S;
  const { $, eur, esc, SHIP, fmtN, imgUrl, store, known, cart, wish, track, pref, ensure } = Ctx;
  /* ───────── sepet ───────── */
  const count = () => Object.values(cart).reduce((a, e) => a + e.n, 0);
  const subtotal = () => Object.values(cart).reduce((a, e) => a + e.p.price * e.n, 0);
  S.gapT = 0;
  S.wasFree = subtotal() >= S.FREE;
  function renderCart() {
    Object.keys(cart).forEach(id => {
      if (!cart[id]?.p || cart[id].n < 1) delete cart[id];
    });
    store.set('mx-cart2', cart);
    const c = count(),
      s = subtotal(),
      cb = $('#cartCount'),
      wn = Object.keys(wish).length;
    if (cb.textContent !== String(c)) {
      cb.classList.remove('bump');
      void cb.offsetWidth;
      cb.classList.add('bump');
    }
    cb.textContent = c;
    cb.hidden = !c;
    const wb = $('#wishCount');
    wb.textContent = wn;
    wb.hidden = !wn;
    const left = S.FREE - s,
      free = c && left <= 0;
    $('#ship').className = 'ship' + (free ? ' done' : '');
    $('#ship').innerHTML =
      (c
        ? left > 0
          ? `Noch <b>${eur(left)}</b> bis zum kostenlosen DHL-Versand`
          : 'Geschafft – dein Versand ist <b>kostenlos</b>'
        : 'Kostenloser DHL-Versand ab ' + fmtN(S.FREE) + ' € (DE)') +
      `<div class="bar"><i style="width:${Math.min(100, (s / S.FREE) * 100)}%"></i></div><div id="gap"></div>`;
    if (free && !S.wasFree) toast('Gratis-Versand erreicht');
    S.wasFree = !!free;
    $('#items').innerHTML = c
      ? Object.values(cart)
          .map(
            ({ n, p }) => `<div class="item">
      <img src="${esc(imgUrl(p.img, 160))}" alt=""><div><span class="vendor">${esc(p.vendor)}</span><b>${esc(p.title)}</b>
      <span class="qty"><button data-q="${esc(p.id)}" data-d="-1" aria-label="Weniger">−</button><span>${n}</span><button data-q="${esc(p.id)}" data-d="1" aria-label="Mehr">+</button></span>
      <button class="rm" data-rm="${esc(p.id)}">Entfernen</button></div><strong>${eur(p.price * n)}</strong></div>`,
          )
          .join('')
      : `<div class="cart-empty"><b>Dein Warenkorb ist noch leer.</b>Entdecke deinen Mix und finde dein nächstes Lieblingsprodukt.</div>`;
    const ship = c && s < S.FREE ? SHIP : 0;
    $('#dfoot').innerHTML = c
      ? `<div class="row"><span>Zwischensumme</span><span>${eur(s)}</span></div>
    <div class="row"><span>DHL-Versand (DE)</span><span>${ship ? eur(ship) : 'kostenlos'}</span></div>
    <div class="row total"><span>Gesamt</span><span>${eur(s + ship)}</span></div>
    <button class="btn btn-primary" data-checkout>Zur Kasse <svg class="icon" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>
    <span class="tax" style="text-align:center">inkl. MwSt. · 14 Tage Widerrufsrecht · Demo – es wird nichts bestellt</span>`
      : `<button class="btn btn-ghost" data-close>Weiter einkaufen</button>`;
    if (c && left > 0) fillGap(left);
  }
  /* ücretsiz kargoya kalan tutarı kapatan, sepetle ilgili gerçek öneriler */
  async function fillGap(left) {
    const my = ++S.gapT,
      items = Object.values(cart)
        .map(e => e.p)
        .filter(p => p.si >= 0);
    if (!items.length) return;
    const p0 = items[items.length - 1];
    try {
      const rows = await ensure(p0.cat + '/' + p0.si, 400);
      if (my !== S.gapT || !$('#gap')) return;
      const pick = rows
        .filter(p => !p.na && !p.lq && !cart[p.id] && p.price >= left && p.price <= left + 15)
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
      if (pick.length)
        $('#gap').innerHTML =
          '<small>Passt dazu und bringt dich über ' +
          fmtN(S.FREE) +
          ' €:</small>' +
          pick
            .map(
              p =>
                `<div class="gapi"><img src="${esc(imgUrl(p.img, 96))}" alt=""><button data-open="${esc(p.id)}">${esc(p.title)}</button><b>${eur(p.price)}</b><button class="plus" data-add="${esc(p.id)}" aria-label="In den Warenkorb">+</button></div>`,
            )
            .join('');
    } catch {}
  }
  function add(id, n = 1) {
    const p = known.get(id);
    if (!p || p.na) return;
    (cart[id] ??= { n: 0, p }).n += n;
    track('add', pref(p));
    renderCart();
    toast('In den Warenkorb gelegt');
  }
  S.tt = undefined;
  function toast(m) {
    const t = $('#toast');
    t.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' + esc(m);
    t.classList.add('on');
    clearTimeout(S.tt);
    S.tt = setTimeout(() => t.classList.remove('on'), 2600);
  }
  Object.assign(Ctx, { count, subtotal, renderCart, fillGap, add, toast });
};

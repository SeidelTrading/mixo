/* Outlet vitrini — Kartlar, raflar, filtre paneli, rozetler. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).cards = async function (Ctx) {
  const S = Ctx.S;
  const { F, $, eur, esc, imgUrl, HIDCAT, wish, HEART, HID } = Ctx;
  /* ───────── kartlar ───────── */
  const priceHtml = p =>
    `<div class="price${p.was ? ' sale' : ''}">${eur(p.price)}${p.was ? `<s>${eur(p.was)}</s>` : ''}</div>`;
  const baseTxt = p => (p.base ? esc(p.base.replace(/€([\d.,]+)/, '$1 €')) : '');
  function card(p) {
    return `<article class="card">
    ${p.na ? '<span class="chip" style="background:#e8e9ef;color:#555b6e">Zurzeit nicht verfügbar</span>' : p.was ? `<span class="chip" style="background:var(--coral);color:#fff">−${Math.round((1 - p.price / p.was) * 100)} %</span>` : p.price >= S.FREE ? '<span class="chip">Gratis-Versand</span>' : ''}
    <button class="wish" data-wish="${esc(p.id)}" aria-pressed="${!!wish[p.id]}" aria-label="Merken">${HEART}</button>
    <button class="media" data-open="${esc(p.id)}" aria-label="${esc(p.title)} ansehen"><img src="${esc(imgUrl(p.img))}" alt="${esc(p.title)}" loading="lazy" onerror="this.style.visibility='hidden'"></button>
    <div class="body">
      <span class="vendor">${esc(p.vendor)}</span>
      <h3 data-open="${esc(p.id)}">${esc(p.title)}</h3>
      ${priceHtml(p)}
      <div class="tax">${p.base ? baseTxt(p) + '<br>' : ''}inkl. MwSt.</div>
      <div class="foot">${p.na ? '<button class="add" disabled style="opacity:.45;cursor:not-allowed">Nicht verfügbar</button>' : `<button class="add" data-add="${esc(p.id)}">In den Warenkorb <span aria-hidden="true">+</span></button>`}</div>
    </div></article>`;
  }
  const skeleton = n =>
    Array.from(
      { length: n },
      () =>
        '<div class="card sk"><div class="media"></div><div class="body"><span></span><span></span><span></span></div></div>',
    ).join('');
  function renderRails() {
    $('#watchRail').innerHTML = F.filter(p => p.cat === 'uhren' && !HID.has(p.id) && !HIDCAT.has(p.cat))
      .map(card)
      .join('');
    $('#scentRail').innerHTML = F.filter(p => p.cat === 'parfum' && !HID.has(p.id) && !HIDCAT.has(p.cat))
      .map(card)
      .join('');
  }
  Object.assign(Ctx, { priceHtml, baseTxt, card, skeleton, renderRails });
};

/* Outlet vitrini — Sepet çekmecesi ve ürün penceresi. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).drawer = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    eur,
    esc,
    fmtN,
    imgUrl,
    label,
    store,
    known,
    wish,
    HEART,
    taxTxt,
    B,
    track,
    pref,
    ensure,
    priceHtml,
    baseTxt,
    hideSuggest,
    add,
  } = Ctx;
  const closeModal = (...a) => Ctx.closeModal(...a);
  const closeAll = (...a) => Ctx.closeAll(...a);
  const renderForYou = (...a) => Ctx.renderForYou(...a);
  const renderSeen = (...a) => Ctx.renderSeen(...a);
  /* ───────── pencereler ───────── */
  S.lastFocus = undefined;
  S.openAt = 0;
  S.openP = null;
  function openDrawer() {
    closeModal(true);
    S.lastFocus = document.activeElement;
    $('#insights').classList.remove('on');
    $('#drawer').classList.add('on');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    track('cart_open');
  }
  function openModal(id, from) {
    const p = known.get(id);
    if (!p) return;
    if (S.openP) endView();
    S.lastFocus = document.activeElement;
    let n = 1;
    const ic = d => `<svg class="icon" viewBox="0 0 24 24">${d}</svg>`;
    $('#sheet').innerHTML =
      `<button class="iconbtn x" data-close aria-label="Schließen">${ic('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
    <div class="pm"><img src="${esc(imgUrl(p.img, 900))}" alt="${esc(p.title)}"></div>
    <div class="pi"><span class="vendor">${esc(p.vendor)} · ${esc(label(p.cat))}${p.sub ? ' · ' + esc(p.sub) : ''}</span><h2>${esc(p.title)}</h2>
      ${priceHtml(p)}
      <div class="tax">${p.base ? baseTxt(p) + ' · ' : ''}${taxTxt()}</div>
      <ul class="facts">
        <li>${ic('<path d="m5 12 5 5 9-10"/>')}${p.na ? 'Zurzeit nicht verfügbar' : 'Auf Lager – direkt aus Deutschland'}</li>
        <li>${ic('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17.5" cy="18" r="1.7"/>')}${p.price >= S.FREE ? 'Kostenloser DHL-Versand' : 'DHL-Versand 5,50 € · ab ' + fmtN(S.FREE) + ' € kostenlos'} · ca. 3–5 Werktage</li>
        <li>${ic('<path d="M4 9h13a3 3 0 0 1 0 6H9"/><path d="m7 6-3 3 3 3"/>')}14 Tage Widerrufsrecht</li>
      </ul>
      <div class="buy"><span class="qty"><button id="mMinus" aria-label="Weniger">−</button><span id="mQty">1</span><button id="mPlus" aria-label="Mehr">+</button></span>
        <button class="btn btn-primary" id="mAdd">In den Warenkorb</button>
        <button class="iconbtn wish" style="box-shadow:inset 0 0 0 1.5px var(--line);width:50px;height:50px" data-wish="${esc(p.id)}" aria-pressed="${!!wish[p.id]}" aria-label="Merken">${HEART}</button></div>
    </div><div class="sim" id="sim"></div>`;
    $('#mMinus').onclick = () => {
      n = Math.max(1, n - 1);
      $('#mQty').textContent = n;
    };
    $('#mPlus').onclick = () => {
      n++;
      $('#mQty').textContent = n;
    };
    if (p.na) {
      const b = $('#mAdd');
      b.disabled = true;
      b.textContent = 'Nicht verfügbar';
      b.style.opacity = 0.45;
    }
    $('#mAdd').onclick = () => {
      add(id, n);
      closeAll();
      openDrawer();
    };
    $('#sheet').scrollTop = 0;
    hideSuggest();
    $('#modal').classList.add('on');
    $('#modal').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    $('#sheet .x').focus();
    if (!history.state?.mxModal) {
      try {
        history.pushState({ mxModal: 1 }, '', location.href);
      } catch {}
    }
    S.openP = p;
    S.openAt = Date.now();
    track(from === 'sugg' ? 'sugg' : 'view', pref(p));
    if (from === 'sugg') track('view', pref(p));
    if (B.consent === true) {
      B.seen = [p, ...B.seen.filter(x => x.id !== p.id)].slice(0, 12).map(({ _h, ...x }) => x);
      store.set('mx-seen', B.seen);
    }
    similar(p);
  }
  async function similar(p) {
    if (!(p.si >= 0)) return;
    try {
      const rows = await ensure(p.cat + '/' + p.si, 300);
      if (S.openP !== p || !$('#sim')) return;
      const pick = rows
        .filter(x => x.id !== p.id && !x.na && !x.lq)
        .map(x => [x, (x.vendor === p.vendor ? 0 : 1) + Math.abs(Math.log((x.price || 1) / (p.price || 1)))])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 4)
        .map(x => x[0]);
      if (pick.length)
        $('#sim').innerHTML =
          `<h4>Ähnliche Produkte in ${esc(p.sub)}</h4><div class="simg">${pick.map(x => `<button data-open="${esc(x.id)}"><img src="${esc(imgUrl(x.img, 200))}" alt="" loading="lazy"><span class="vendor">${esc(x.vendor)}</span><span>${esc(x.title)}</span><b>${eur(x.price)}</b></button>`).join('')}</div>`;
    } catch {}
  }
  function endView() {
    if (!S.openP) return;
    track('dwell', { ...pref(S.openP), sec: Math.round((Date.now() - S.openAt) / 1000) });
    S.openP = null;
    clearTimeout(S.fyT);
    S.fyT = setTimeout(() => {
      renderForYou();
      renderSeen();
    }, 400);
  }
  Object.assign(Ctx, { openDrawer, openModal, similar, endView });
};

/* Outlet vitrini — Çekmece, ürün penceresi, demo kasa, pencere kapatma. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).modal = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    eur,
    esc,
    SHIP,
    fmtN,
    imgUrl,
    label,
    store,
    known,
    cart,
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
    subtotal,
    renderCart,
    add,
  } = Ctx;
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
  /* ───────── demo kasa: sipariş sunucuya yazılır, ödeme yoktur ───────── */
  function openCheckout() {
    const items = Object.values(cart).filter(e => e?.p && e.n > 0);
    if (!items.length) return;
    closeModal(true);
    $('#drawer').classList.remove('on');
    $('#drawer').setAttribute('aria-hidden', 'true');
    const s = subtotal(),
      ship = s >= S.FREE ? 0 : SHIP,
      field = (id, l, ph, type = 'text', ac = '') =>
        `<label class="co-f">${l}<input id="co_${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" required></label>`;
    $('#sheet').innerHTML =
      `<button class="iconbtn x" data-close aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <form class="co" id="coForm" novalidate>
      <h2>Zur Kasse</h2>
      <p class="co-demo"><b>Demo:</b> Es wird nichts bezahlt und nichts geliefert. Bitte keine echten Daten eingeben – die Bestellung wird nur im Demo-System angezeigt.</p>
      ${field('name', 'Name', 'Max Mustermann', 'text', 'name')}${field('email', 'E-Mail', 'max@example.com', 'email', 'email')}${field('street', 'Straße und Hausnummer', 'Musterstraße 1', 'text', 'street-address')}
      <div class="co-row">${field('zip', 'PLZ', '10115', 'text', 'postal-code')}${field('city', 'Ort', 'Berlin', 'text', 'address-level2')}</div>
      <div class="co-pay"><b>Zahlung</b><span>Rechnung (Demo) · keine Zahlungsdaten nötig</span></div>
      <label class="co-chk"><input id="co_ok" type="checkbox"> Ich habe verstanden, dass dies eine Demo ist.</label>
      <label class="co-chk"><input id="co_mk" type="checkbox"> Optional: Erinnert mich per E-Mail an meinen Warenkorb und an Nachbestellungen (jederzeit widerrufbar).</label>
      <div class="co-err" id="co_err" role="alert"></div>
    </form>
    <aside class="co-sum"><h3>Deine Bestellung</h3>
      ${items.map(({ n, p }) => `<div class="co-it"><img src="${esc(imgUrl(p.img, 120))}" alt=""><span>${n} × ${esc(p.title)}</span><b>${eur(p.price * n)}</b></div>`).join('')}
      <div class="co-tot"><span>Zwischensumme</span><span>${eur(s)}</span></div><div class="co-tot"><span>DHL-Versand</span><span>${ship ? eur(ship) : 'kostenlos'}</span></div>
      <div class="co-tot t"><span>Gesamt</span><span>${eur(s + ship)}</span></div>
      <button class="btn btn-primary" form="coForm" id="coGo" style="width:100%;margin-top:14px">Demo-Bestellung abschicken</button>
      <span class="tax">inkl. MwSt. · 14 Tage Widerrufsrecht</span></aside>`;
    $('#sheet').classList.add('co-sheet');
    $('#modal').classList.add('on');
    $('#modal').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    $('#sheet').scrollTop = 0;
    $('#co_name').focus();
    const mkSync = () => {
      const em = $('#co_email').value.trim();
      if (!/^\S+@\S+\.\S{2,}$/.test(em)) return;
      fetch('/api/cart-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: em,
          name: $('#co_name').value.trim(),
          optin: $('#co_mk').checked,
          items: items.map(({ n, p }) => ({ id: p.id, qty: n })),
        }),
      }).catch(() => {});
    };
    $('#co_mk').onchange = mkSync;
    $('#co_email').onchange = () => {
      if ($('#co_mk').checked) mkSync();
    };
    $('#coForm').onsubmit = async e => {
      e.preventDefault();
      const err = $('#co_err');
      err.textContent = '';
      if (!$('#co_ok').checked) {
        err.textContent = 'Bitte bestätige den Demo-Hinweis.';
        return;
      }
      const v = k => $('#co_' + k).value.trim();
      if (!v('name') || !/^\S+@\S+\.\S{2,}$/.test(v('email')) || !v('street') || !v('zip') || !v('city')) {
        err.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        return;
      }
      $('#coGo').disabled = true;
      try {
        const r = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              items: items.map(({ n, p }) => ({ id: p.id, qty: n })),
              marketing: $('#co_mk').checked,
              customer: {
                name: v('name'),
                email: v('email'),
                street: v('street'),
                zip: v('zip'),
                city: v('city'),
              },
            }),
          }),
          j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Fehler');
        track('checkout', { v: j.order.total, k: 'order' });
        Object.keys(cart).forEach(k => delete cart[k]);
        renderCart();
        $('#sheet').innerHTML =
          `<button class="iconbtn x" data-close aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button><div class="co-done"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><h2>Danke für deine Demo-Bestellung!</h2><p>Bestellnummer <b>${esc(j.order.id)}</b> · Gesamt ${eur(j.order.total)}</p>${j.order.verify ? '<p>Im echten Shop bestätigst du die Bestellung über den Link in der E-Mail. In dieser Demo wird keine E-Mail verschickt; die Bestätigung erfolgt im Verwaltungsbereich.</p>' : ''}<p class="tax">Es wurde nichts bezahlt und nichts verschickt. Die Bestellung erscheint im Demo-Verwaltungsbereich.</p><button class="btn btn-primary" data-close>Weiter einkaufen</button></div>`;
      } catch (x) {
        err.textContent = x.message || 'Fehler';
        $('#coGo').disabled = false;
      }
    };
  }
  function closeModal(keep) {
    const was = $('#modal').classList.contains('on');
    $('#sheet').classList.remove('co-sheet');
    $('#modal').classList.remove('on');
    $('#modal').setAttribute('aria-hidden', 'true');
    if (!keep) {
      $('#scrim').classList.remove('on');
      document.body.style.overflow = '';
    }
    if (was) {
      endView();
      if (history.state?.mxModal) {
        try {
          history.back();
        } catch {}
      }
    }
  }
  function closeAll() {
    closeModal();
    ['#drawer', '#insights', '#filters'].forEach(s => {
      $(s).classList.remove('on');
    });
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#acct').hidden = true;
    $('#scrim').classList.remove('on');
    document.body.style.overflow = '';
    S.lastFocus?.focus?.();
  }
  Object.assign(Ctx, { openDrawer, openModal, similar, endView, openCheckout, closeModal, closeAll });
};

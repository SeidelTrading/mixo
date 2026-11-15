/* Outlet vitrini — Demo kasa ve pencere kapatma. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).checkout = async function (Ctx) {
  const S = Ctx.S;
  const { $, eur, esc, SHIP, imgUrl, cart, track, subtotal, renderCart, endView } = Ctx;
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
  Object.assign(Ctx, { openCheckout, closeModal, closeAll });
};

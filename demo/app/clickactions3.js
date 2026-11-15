/* Outlet vitrini — Tıklama eylemleri (3/3). (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).clickactions3 = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    CAT,
    store,
    cart,
    B,
    track,
    pref,
    renderGrid,
    setCat,
    subtotal,
    renderCart,
    toast,
    openCheckout,
    closeAll,
    renderForYou,
    renderSeen,
    renderInsights,
    openInsights,
    setConsent,
    renderAcct,
  } = Ctx;
  const CLICK_ACTIONS_3 = [
    [
      (d, t) => d.rm,
      (d, t, e) => {
        const c = cart[d.rm];
        if (c) track('remove', pref(c.p));
        delete cart[d.rm];
        renderCart();
      },
    ],
    [
      (d, t) => 'close' in d,
      (d, t, e) => {
        closeAll();
      },
    ],
    [
      (d, t) => 'checkout' in d,
      (d, t, e) => {
        track('checkout', { v: Math.round(subtotal() * 100) / 100 });
        openCheckout();
      },
    ],
    [
      (d, t) => d.rail,
      (d, t, e) => {
        const r = $('#' + t.dataset.target);
        r.scrollBy({ left: d.rail * r.clientWidth * 0.8, behavior: 'smooth' });
      },
    ],
    [
      (d, t) => 'consent' in d,
      (d, t, e) => {
        setConsent(d.consent === '1');
      },
    ],
    [
      (d, t) => 'insights' in d,
      (d, t, e) => {
        e.preventDefault();
        openInsights();
      },
    ],
    [
      (d, t) => 'wipe' in d,
      (d, t, e) => {
        B.ev = [];
        B.seen = [];
        store.del('mx-ev');
        store.del('mx-seen');
        renderForYou();
        renderSeen();
        renderInsights();
        toast('Deine Verlaufsdaten wurden gelöscht');
      },
    ],
    [
      (d, t) => 'logout' in d,
      (d, t, e) => {
        B.user = null;
        store.del('mx-user');
        renderAcct();
        renderForYou();
      },
    ],
    [
      (d, t) => 'fy' in d,
      (d, t, e) => {
        e.preventDefault();
        const [c, i] = (t.dataset.k || '').split('/');
        if (CAT[c]) {
          setCat(c);
          S.state.sub = Number(i);
          renderGrid();
          $('#katalog').scrollIntoView();
        }
      },
    ],
  ];
  Object.assign(Ctx, { CLICK_ACTIONS_3 });
};

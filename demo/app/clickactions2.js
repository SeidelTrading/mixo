/* Outlet vitrini — Tıklama eylemleri (2/3). (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).clickactions2 = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    cart,
    blank,
    track,
    pref,
    loadAllBrands,
    renderGrid,
    setCat,
    commitSearch,
    hideSuggest,
    renderCart,
  } = Ctx;
  const CLICK_ACTIONS_2 = [
    [
      (d, t) => 'reset' in d,
      (d, t, e) => {
        S.state = blank();
        $('#q').value = '';
        $('#sort').value = '';
        S.bq = '';
        S.pushNext = true;
        renderGrid();
      },
    ],
    [
      (d, t) => 'clearf' in d,
      (d, t, e) => {
        S.state.brands = new Set();
        S.state.pmin = S.state.pmax = null;
        S.state.avail = false;
        renderGrid();
      },
    ],
    [
      (d, t) => 'ballload' in d,
      (d, t, e) => {
        t.textContent = 'Marken werden geladen …';
        loadAllBrands();
      },
    ],
    [
      (d, t) => 'fopen' in d,
      (d, t, e) => {
        $('#filters').classList.add('on');
        $('#scrim').classList.add('on');
        document.body.style.overflow = 'hidden';
      },
    ],
    [
      (d, t) => 'fclose' in d,
      (d, t, e) => {
        $('#filters').classList.remove('on');
        $('#scrim').classList.remove('on');
        document.body.style.overflow = '';
      },
    ],
    [
      (d, t) => 'sq' in d,
      (d, t, e) => {
        commitSearch(d.sq);
      },
    ],
    [
      (d, t) => d.scat,
      (d, t, e) => {
        hideSuggest();
        $('#q').value = '';
        setCat(d.scat);
        if (d.ssub >= 0) {
          S.state.sub = Number(d.ssub);
          renderGrid();
        }
        $('#katalog').scrollIntoView();
      },
    ],
    [
      (d, t) => d.sbrand,
      (d, t, e) => {
        hideSuggest();
        S.state = blank();
        $('#q').value = '';
        S.state.brands.add(d.sbrand);
        S.pushNext = true;
        track('filter', { k: 'brand', b: d.sbrand });
        renderGrid();
        $('#katalog').scrollIntoView();
      },
    ],
    [
      (d, t) => d.q,
      (d, t, e) => {
        const c = cart[d.q];
        if (c) {
          c.n += Number(d.d);
          if (c.n < 1) track('remove', pref(c.p));
          renderCart();
        }
      },
    ],
  ];
  Object.assign(Ctx, { CLICK_ACTIONS_2 });
};

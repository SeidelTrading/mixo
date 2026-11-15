/* Outlet vitrini — Değişim, giriş, klavye ve odak dinleyicileri. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).inputs = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    PAGE,
    store,
    blank,
    B,
    track,
    renderBrandList,
    loadAllBrands,
    renderGrid,
    sg,
    hideSuggest,
    toast,
    openDrawer,
    closeAll,
    renderForYou,
    renderAcct,
  } = Ctx;
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.brand) {
      t.checked ? S.state.brands.add(t.dataset.brand) : S.state.brands.delete(t.dataset.brand);
      S.state.shown = PAGE;
      if (t.checked) track('filter', { k: 'brand', b: t.dataset.brand });
      renderGrid();
    } else if (t.id === 'pmin' || t.id === 'pmax') {
      const v = parseFloat(t.value);
      S.state[t.id] = isFinite(v) && v >= 0 ? v : null;
      S.state.shown = PAGE;
      if (t.id === 'pmax' && S.state.pmax != null) track('filter', { k: 'pmax' });
      renderGrid();
    } else if (t.id === 'favail') {
      S.state.avail = t.checked;
      S.state.shown = PAGE;
      track('filter', { k: 'avail' });
      renderGrid();
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'bq') {
      S.bq = e.target.value;
      if (!S.facetBrands && S.bq.trim().length >= 2) loadAllBrands();
      renderBrandList();
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'loginF') {
      e.preventDefault();
      const n = $('#uname').value.trim();
      if (!n) return;
      B.user = { name: n };
      store.set('mx-user', B.user);
      track('login');
      renderAcct();
      renderForYou();
      toast('Hallo, ' + n);
    }
  });
  $('#scrim').onclick = closeAll;
  $('#cartBtn').onclick = openDrawer;
  $('#acctBtn').onclick = () => {
    const a = $('#acct');
    a.hidden = !a.hidden;
    if (!a.hidden) renderAcct();
  };
  $('#wishBtn').onclick = () => {
    S.state = blank();
    S.state.wishOnly = true;
    S.state.shown = 9999;
    $('#q').value = '';
    S.pushNext = true;
    renderGrid();
    $('#katalog').scrollIntoView();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!sg.hidden) hideSuggest();
      else closeAll();
    }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('#q').focus();
    }
  });
  S.qt = undefined;
  Object.assign(Ctx, {});
};

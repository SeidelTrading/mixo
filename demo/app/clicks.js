/* Outlet vitrini — Tıklama işleyicisi. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).clicks = async function (Ctx) {
  const { $, hideSuggest, closeAll, CLICK_ACTIONS_1, CLICK_ACTIONS_2, CLICK_ACTIONS_3 } = Ctx;
  /* ───────── olaylar ───────── */
  document.addEventListener('click', e => {
    const t = e.target.closest(
      '[data-add],[data-wish],[data-open],[data-cat],[data-fcat],[data-fsub],[data-more],[data-price],[data-pill],[data-reset],[data-clearf],[data-ballload],[data-fopen],[data-fclose],[data-sq],[data-scat],[data-sbrand],[data-q],[data-rm],[data-close],[data-checkout],[data-rail],[data-consent],[data-insights],[data-wipe],[data-logout],[data-fy]',
    );
    if (!t) {
      if (e.target.id === 'modal') closeAll();
      if (!e.target.closest('.search')) hideSuggest();
      if (!e.target.closest('#acct,#acctBtn')) $('#acct').hidden = true;
      return;
    }
    const d = t.dataset;
    const action = [...CLICK_ACTIONS_1, ...CLICK_ACTIONS_2, ...CLICK_ACTIONS_3].find(([test]) => test(d, t));
    if (action) action[1](d, t, e);
  });
  Object.assign(Ctx, {});
};

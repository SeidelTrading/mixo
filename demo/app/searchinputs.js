/* Outlet vitrini — Arama kutusu dinleyicileri, sıralama, geri tuşu. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).searchinputs = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    PAGE,
    track,
    qs,
    applyUrl,
    renderGrid,
    commitSearch,
    sg,
    preloadAll,
    renderSuggest,
    count,
    toast,
    endView,
  } = Ctx;
  $('#q').addEventListener('focus', () => {
    preloadAll();
    renderSuggest();
  });
  $('#q').addEventListener('input', () => {
    preloadAll();
    clearTimeout(S.qt);
    S.qt = setTimeout(renderSuggest, 140);
  });
  $('#q').addEventListener('search', e => {
    if (!e.target.value && S.state.q) {
      S.state.q = '';
      renderGrid();
    }
  });
  $('#q').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSearch($('#q').value);
      $('#q').blur();
    } else if (e.key === 'ArrowDown' && !sg.hidden) {
      e.preventDefault();
      sg.querySelector('button')?.focus();
    }
  });
  sg.addEventListener('keydown', e => {
    const b = [...sg.querySelectorAll('button')],
      i = b.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      b[Math.min(b.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (i <= 0 ? $('#q') : b[i - 1]).focus();
    }
  });
  $('#sort').onchange = e => {
    S.state.sort = e.target.value;
    S.state.shown = PAGE;
    track('sort', { o: S.state.sort });
    renderGrid();
  };
  window.addEventListener('popstate', e => {
    if ($('#modal').classList.contains('on') && !e.state?.mxModal) {
      $('#modal').classList.remove('on');
      $('#modal').setAttribute('aria-hidden', 'true');
      $('#scrim').classList.remove('on');
      document.body.style.overflow = '';
      endView();
      return;
    }
    const h = location.hash;
    if ((h === '#katalog' || h.startsWith('#katalog?')) && h.slice(9) !== qs()) applyUrl();
  });
  S.exitShown = false;
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget && e.clientY <= 0 && !S.exitShown && count() > 0) {
      S.exitShown = true;
      track('exit_intent');
      toast(`Dein Warenkorb (${count()} Artikel) bleibt für dich gespeichert`);
    }
  });
  Object.assign(Ctx, {});
};

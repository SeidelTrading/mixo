/* Outlet vitrini — Olay dinleyicileri (tıklama, değişim, giriş, klavye). (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).events = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    $$,
    PAGE,
    CAT,
    store,
    known,
    cart,
    wish,
    blank,
    B,
    track,
    pref,
    renderBrandList,
    loadAllBrands,
    qs,
    applyUrl,
    renderGrid,
    setCat,
    commitSearch,
    sg,
    preloadAll,
    renderSuggest,
    hideSuggest,
    count,
    subtotal,
    renderCart,
    add,
    toast,
    openDrawer,
    openModal,
    endView,
    openCheckout,
    closeAll,
    renderForYou,
    renderSeen,
    renderInsights,
    openInsights,
    setConsent,
    renderAcct,
  } = Ctx;
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
    if (d.add) add(d.add);
    else if (d.wish) {
      const id = d.wish,
        p = known.get(id);
      if (!p) return;
      if (wish[id]) delete wish[id];
      else {
        const { _h, ...c } = p;
        wish[id] = c;
      }
      store.set('mx-wish2', wish);
      track(wish[id] ? 'wish' : 'unwish', pref(p));
      $$('[data-wish]').forEach(b => {
        if (b.dataset.wish === id) {
          b.setAttribute('aria-pressed', !!wish[id]);
          if (wish[id]) {
            b.classList.remove('pop');
            void b.offsetWidth;
            b.classList.add('pop');
          }
        }
      });
      toast(wish[id] ? 'Auf der Merkliste gespeichert' : 'Von der Merkliste entfernt');
      renderCart();
      if (S.state.wishOnly) renderGrid();
    } else if (d.open) openModal(d.open, d.from);
    else if (d.cat) {
      e.preventDefault();
      setCat(d.cat);
      $('#katalog').scrollIntoView();
    } else if (d.fcat) setCat(d.fcat, true);
    else if ('fsub' in d) {
      const i = Number(d.fsub);
      S.state.sub = S.state.sub === i ? -1 : i;
      S.state.shown = PAGE;
      S.state.brands = new Set();
      S.pushNext = true;
      if (S.state.sub >= 0) track('cat', { c: S.state.cat, si: S.state.sub });
      renderGrid();
    } else if ('more' in d) {
      S.state.shown += PAGE;
      track('more');
      renderGrid();
    } else if ('price' in d) {
      const [a, b] = d.price.split('-').map(x => (x === '' ? null : Number(x)));
      const on = S.state.pmin === a && S.state.pmax === b;
      S.state.pmin = on ? null : a;
      S.state.pmax = on ? null : b;
      S.state.shown = PAGE;
      if (!on && b != null) track('filter', { k: 'pmax' });
      renderGrid();
    } else if (d.pill) {
      const k = d.pill;
      if (k === 'wish') S.state.wishOnly = false;
      else if (k === 'q') {
        S.state.q = '';
        $('#q').value = '';
      } else if (k === 'cat') {
        S.state.cat = 'all';
        S.state.sub = -1;
      } else if (k === 'sub') S.state.sub = -1;
      else if (k === 'price') S.state.pmin = S.state.pmax = null;
      else if (k === 'avail') S.state.avail = false;
      else if (k.startsWith('b:')) S.state.brands.delete(k.slice(2));
      S.state.shown = PAGE;
      renderGrid();
    } else if ('reset' in d) {
      S.state = blank();
      $('#q').value = '';
      $('#sort').value = '';
      S.bq = '';
      S.pushNext = true;
      renderGrid();
    } else if ('clearf' in d) {
      S.state.brands = new Set();
      S.state.pmin = S.state.pmax = null;
      S.state.avail = false;
      renderGrid();
    } else if ('ballload' in d) {
      t.textContent = 'Marken werden geladen …';
      loadAllBrands();
    } else if ('fopen' in d) {
      $('#filters').classList.add('on');
      $('#scrim').classList.add('on');
      document.body.style.overflow = 'hidden';
    } else if ('fclose' in d) {
      $('#filters').classList.remove('on');
      $('#scrim').classList.remove('on');
      document.body.style.overflow = '';
    } else if ('sq' in d) commitSearch(d.sq);
    else if (d.scat) {
      hideSuggest();
      $('#q').value = '';
      setCat(d.scat);
      if (d.ssub >= 0) {
        S.state.sub = Number(d.ssub);
        renderGrid();
      }
      $('#katalog').scrollIntoView();
    } else if (d.sbrand) {
      hideSuggest();
      S.state = blank();
      $('#q').value = '';
      S.state.brands.add(d.sbrand);
      S.pushNext = true;
      track('filter', { k: 'brand', b: d.sbrand });
      renderGrid();
      $('#katalog').scrollIntoView();
    } else if (d.q) {
      const c = cart[d.q];
      if (c) {
        c.n += Number(d.d);
        if (c.n < 1) track('remove', pref(c.p));
        renderCart();
      }
    } else if (d.rm) {
      const c = cart[d.rm];
      if (c) track('remove', pref(c.p));
      delete cart[d.rm];
      renderCart();
    } else if ('close' in d) closeAll();
    else if ('checkout' in d) {
      track('checkout', { v: Math.round(subtotal() * 100) / 100 });
      openCheckout();
    } else if (d.rail) {
      const r = $('#' + t.dataset.target);
      r.scrollBy({ left: d.rail * r.clientWidth * 0.8, behavior: 'smooth' });
    } else if ('consent' in d) setConsent(d.consent === '1');
    else if ('insights' in d) {
      e.preventDefault();
      openInsights();
    } else if ('wipe' in d) {
      B.ev = [];
      B.seen = [];
      store.del('mx-ev');
      store.del('mx-seen');
      renderForYou();
      renderSeen();
      renderInsights();
      toast('Deine Verlaufsdaten wurden gelöscht');
    } else if ('logout' in d) {
      B.user = null;
      store.del('mx-user');
      renderAcct();
      renderForYou();
    } else if ('fy' in d) {
      e.preventDefault();
      const [c, i] = (t.dataset.k || '').split('/');
      if (CAT[c]) {
        setCat(c);
        S.state.sub = Number(i);
        renderGrid();
        $('#katalog').scrollIntoView();
      }
    }
  });
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

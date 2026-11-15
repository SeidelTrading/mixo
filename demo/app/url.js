/* Outlet vitrini — Paylaşılabilir adres ve geri tuşu. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).url = async function (Ctx) {
  const S = Ctx.S;
  const { $, HIDCAT, CAT, blank } = Ctx;
  const renderGrid = (...a) => Ctx.renderGrid(...a);
  /* ───────── paylaşılabilir adres + geri tuşu ───────── */
  function qs() {
    const u = new URLSearchParams();
    if (S.state.wishOnly) {
      u.set('v', 'merkliste');
      return u.toString();
    }
    if (S.state.cat !== 'all') u.set('c', S.state.cat);
    if (S.state.sub >= 0) u.set('s', S.state.sub);
    if (S.state.q.trim()) u.set('q', S.state.q.trim());
    if (S.state.brands.size) u.set('b', [...S.state.brands].join('|'));
    if (S.state.pmin != null) u.set('min', S.state.pmin);
    if (S.state.pmax != null) u.set('max', S.state.pmax);
    if (S.state.sort) u.set('o', S.state.sort);
    if (S.state.avail) u.set('a', 1);
    return u.toString();
  }
  function syncUrl() {
    if (S.applying) return;
    const s = qs(),
      mine = location.hash === '#katalog' || location.hash.startsWith('#katalog?');
    if (!s && !mine) {
      S.pushNext = false;
      return;
    }
    const h = '#katalog' + (s ? '?' + s : '');
    if (h === location.hash) {
      S.pushNext = false;
      return;
    }
    try {
      history[S.pushNext && mine ? 'pushState' : 'replaceState'](
        null,
        '',
        location.pathname + location.search + h,
      );
    } catch {}
    S.pushNext = false;
  }
  function applyUrl(first) {
    const h = location.hash;
    if (h !== '#katalog' && !h.startsWith('#katalog?')) return false;
    const u = new URLSearchParams(h.slice(9)),
      s = blank();
    if (u.get('v') === 'merkliste') {
      s.wishOnly = true;
      s.shown = 9999;
    }
    if (CAT[u.get('c')] && !HIDCAT.has(u.get('c'))) {
      s.cat = u.get('c');
      const i = parseInt(u.get('s'));
      if (i >= 0 && CAT[s.cat].subs[i]) s.sub = i;
    }
    s.q = u.get('q') || '';
    (u.get('b') || '')
      .split('|')
      .filter(Boolean)
      .forEach(b => s.brands.add(b));
    const f = v => {
      const x = parseFloat(v);
      return isFinite(x) && x >= 0 ? x : null;
    };
    s.pmin = f(u.get('min'));
    s.pmax = f(u.get('max'));
    if (['asc', 'desc', 'az'].includes(u.get('o'))) s.sort = u.get('o');
    s.avail = u.get('a') === '1';
    S.state = s;
    $('#q').value = s.q;
    $('#sort').value = s.sort;
    S.applying = true;
    renderGrid().finally(() => {
      S.applying = false;
    });
    if (first && h.length > 9) setTimeout(() => $('#katalog').scrollIntoView(), 60);
    return true;
  }
  Object.assign(Ctx, { qs, syncUrl, applyUrl });
};

/* Outlet vitrini — Ürün ızgarası, kategori seçimi, arama önerileri. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).grid = async function (Ctx) {
  const S = Ctx.S;
  const {
    IDX,
    $,
    num,
    esc,
    HIDCAT,
    CAT,
    wish,
    blank,
    track,
    lists,
    ensure,
    scopeKey,
    scopeTotal,
    hasFilters,
    countBrands,
    matcher,
    card,
    skeleton,
    renderFilters,
    renderPills,
    syncUrl,
  } = Ctx;
  /* ───────── ürün ızgarası ───────── */
  const status = m => {
    $('#more').innerHTML = `<span class="loading">${m}</span>`;
  };
  async function renderGrid() {
    const my = ++S.token,
      q = S.state.q.trim(),
      grid = $('#grid'),
      key = scopeKey();
    S.facetBrands = lists[key]?.done && !q && !hasFilters() ? countBrands(lists[key].rows) : null;
    renderFilters();
    renderPills();
    syncUrl();
    let list, total;
    try {
      if (S.state.wishOnly) {
        list = Object.values(wish);
        total = list.length;
      } else if (q.length >= 2 || S.state.sort || hasFilters()) {
        grid.style.opacity = 0.45;
        const base = scopeTotal();
        if (!grid.children.length) grid.innerHTML = skeleton(8);
        if (q.length >= 2 && S.qCountsFor !== q) {
          const all = await ensure('all', Infinity, f => {
            if (my === S.token) status(`Durchsuche ${num(IDX.total)} Produkte … ${Math.round(f * 100)} %`);
          });
          if (my !== S.token) return;
          const m = matcher(q),
            c = {},
            s = {};
          let t = 0;
          for (const p of all)
            if (m(p)) {
              t++;
              c[p.cat] = (c[p.cat] || 0) + 1;
              const k = p.cat + '/' + p.si;
              s[k] = (s[k] || 0) + 1;
            }
          S.qCounts = { c, s, t };
          S.qCountsFor = q;
        }
        list = await ensure(key, Infinity, f => {
          if (my === S.token) status(`${num(base)} Produkte werden geprüft … ${Math.round(f * 100)} %`);
        });
        if (my !== S.token) return;
        if (q.length >= 2) list = list.filter(matcher(q));
        if (S.state.pmin != null) list = list.filter(p => p.price >= S.state.pmin);
        if (S.state.pmax != null) list = list.filter(p => p.price <= S.state.pmax);
        if (S.state.avail) list = list.filter(p => !p.na);
        S.facetBrands = countBrands(list);
        if (S.state.brands.size) list = list.filter(p => S.state.brands.has(p.vendor));
        total = list.length;
        if (S.state.sort) {
          list = list.slice();
          if (S.state.sort === 'asc') list.sort((a, b) => a.price - b.price);
          if (S.state.sort === 'desc') list.sort((a, b) => b.price - a.price);
          if (S.state.sort === 'az') list.sort((a, b) => a.vendor.localeCompare(b.vendor, 'de'));
        }
        renderFilters();
      } else {
        total = scopeTotal();
        if (!(lists[key]?.rows.length >= Math.min(S.state.shown, total))) {
          status('Produkte werden geladen …');
          if (!grid.children.length) grid.innerHTML = skeleton(8);
        }
        list = await ensure(key, S.state.shown);
        if (my !== S.token) return;
      }
    } catch {
      if (my === S.token) {
        grid.style.opacity = 1;
        grid.innerHTML =
          '<div class="empty">Die Produkte konnten nicht geladen werden. Bitte Seite neu laden.</div>';
        $('#more').innerHTML = '';
      }
      return;
    }
    grid.style.opacity = 1;
    const vis = list.slice(0, S.state.shown);
    $('#count').innerHTML =
      `<b>${num(total)}</b> ${total === 1 ? 'Produkt' : 'Produkte'}${q ? ` für „${esc(q)}“` : ''}`;
    if (vis.length) grid.innerHTML = vis.map(card).join('');
    else if (S.state.wishOnly)
      grid.innerHTML =
        '<div class="empty">Deine Merkliste ist noch leer. Tippe auf das Herz an einem Produkt.</div>';
    else {
      const tips = [];
      if (hasFilters()) tips.push('<button class="btn btn-ghost" data-clearf>Filter entfernen</button>');
      if (q && S.state.cat !== 'all')
        tips.push(`<button class="btn btn-ghost" data-fcat="all">In allen Kategorien suchen</button>`);
      grid.innerHTML = `<div class="empty"><b>Dazu haben wir gerade nichts gefunden.</b><p>${q ? 'Prüfe die Schreibweise oder versuche es mit weniger Wörtern – z. B. nur Marke oder Modellnummer.' : 'Lockere einen Filter, um mehr Auswahl zu sehen.'}</p><div class="cta" style="justify-content:center;margin-top:16px">${tips.join('')}<button class="btn btn-primary" data-reset>Alles anzeigen</button></div></div>`;
    }
    $('#more').innerHTML = total
      ? `<span>${num(vis.length)} von ${num(total)} Produkten</span><div class="bar" style="width:min(240px,60%)"><i style="width:${(vis.length / total) * 100}%"></i></div>` +
        (total > vis.length ? '<button class="btn btn-ghost" data-more>Mehr laden</button>' : '')
      : '';
    const sig = q + '|' + key;
    if (q.length >= 2 && sig !== S.lastTracked && !S.applying) {
      S.lastTracked = sig;
      track('search', { q, n: total, c: S.state.cat === 'all' ? undefined : S.state.cat });
    }
  }
  function setCat(c, keep) {
    const q = keep ? S.state.q : '';
    const o = S.state;
    S.state = blank();
    S.state.cat = CAT[c] && !HIDCAT.has(c) ? c : 'all';
    if (keep) {
      S.state.q = q;
      S.state.brands = o.brands;
      S.state.pmin = o.pmin;
      S.state.pmax = o.pmax;
      S.state.avail = o.avail;
      S.state.sort = o.sort;
    } else {
      $('#q').value = '';
      $('#sort').value = '';
    }
    S.pushNext = true;
    if (S.state.cat !== 'all') track('cat', { c: S.state.cat, si: -1 });
    renderGrid();
  }
  Object.assign(Ctx, { status, renderGrid, setCat });
};

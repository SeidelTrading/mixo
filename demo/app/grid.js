/* Outlet vitrini — Ürün ızgarası, kategori seçimi, arama önerileri. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).grid = async function (Ctx) {
  const S = Ctx.S;
  const {
    IDX,
    $,
    eur,
    num,
    esc,
    PAGE,
    imgUrl,
    HIDCAT,
    CAT,
    wish,
    blank,
    B,
    track,
    lists,
    ensure,
    scopeKey,
    scopeTotal,
    hasFilters,
    countBrands,
    norm,
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
  function commitSearch(q) {
    S.state.q = q.trim();
    S.state.cat = 'all';
    S.state.sub = -1;
    S.state.shown = PAGE;
    S.state.wishOnly = false;
    $('#q').value = S.state.q;
    hideSuggest();
    S.pushNext = true;
    renderGrid();
    $('#katalog').scrollIntoView();
  }
  /* ───────── arama önerileri ───────── */
  const sg = $('#suggest');
  S.allBrands = null;
  S.preloading = false;
  function preloadAll() {
    if (S.preloading) return;
    S.preloading = true;
    ensure('all', Infinity)
      .then(rows => {
        S.allBrands = countBrands(rows);
        if (!sg.hidden) renderSuggest();
      })
      .catch(() => {
        S.preloading = false;
      });
  }
  const recent = () => {
    const a = [];
    for (let i = B.ev.length - 1; i >= 0 && a.length < 4; i--) {
      const x = B.ev[i];
      if (x.e === 'search' && !a.includes(x.q)) a.push(x.q);
    }
    return a;
  };
  function renderSuggest() {
    const raw = $('#q').value.trim(),
      nq = norm(raw);
    let h = '';
    if (nq.length < 2) {
      const r = recent();
      h =
        (r.length
          ? '<div class="sgh">Zuletzt gesucht</div>' +
            r.map(x => `<button data-sq="${esc(x)}"><span>${esc(x)}</span></button>`).join('')
          : '') +
        '<div class="sgh">Beliebte Kategorien</div>' +
        IDX.cats
          .filter(c => !HIDCAT.has(c.k))
          .slice(0, 6)
          .map(c => `<button data-scat="${c.k}"><span>${esc(c.label)}</span><i>${num(c.n)}</i></button>`)
          .join('');
    } else {
      const cats = [];
      IDX.cats
        .filter(c => !HIDCAT.has(c.k))
        .forEach(c => {
          if (norm(c.label).includes(nq)) cats.push([c.k, -1, c.label, c.n]);
          c.subs.forEach((s, i) => {
            if (norm(s.name).includes(nq)) cats.push([c.k, i, c.label + ' › ' + s.name, s.n]);
          });
        });
      const full = lists.all?.done;
      let prods = [],
        n = 0;
      if (full) {
        const hits = lists.all.rows.filter(matcher(raw));
        n = hits.length;
        prods = hits.filter(p => !p.na && !p.lq).slice(0, 5);
      }
      const brands = (S.allBrands || IDX.facets.all.b).filter(([b]) => norm(b).includes(nq)).slice(0, 4);
      if (cats.length)
        h +=
          '<div class="sgh">Kategorien</div>' +
          cats
            .slice(0, 4)
            .map(
              ([k, i, t, c]) =>
                `<button data-scat="${k}" data-ssub="${i}"><span>${esc(t)}</span><i>${num(c)}</i></button>`,
            )
            .join('');
      if (brands.length)
        h +=
          '<div class="sgh">Marken</div>' +
          brands
            .map(
              ([b, c]) => `<button data-sbrand="${esc(b)}"><span>${esc(b)}</span><i>${num(c)}</i></button>`,
            )
            .join('');
      if (prods.length)
        h +=
          '<div class="sgh">Produkte</div>' +
          prods
            .map(
              p =>
                `<button class="sgp" data-open="${esc(p.id)}" data-from="sugg"><img src="${esc(imgUrl(p.img, 96))}" alt=""><span>${esc(p.title)}</span><b>${eur(p.price)}</b></button>`,
            )
            .join('');
      h += full
        ? n
          ? `<button class="sgall" data-sq="${esc(raw)}">Alle ${num(n)} Ergebnisse anzeigen <kbd>↵</kbd></button>`
          : '<div class="sgh">Keine Treffer – versuche ein anderes Wort oder nur die Modellnummer.</div>'
        : `<div class="sgh"><span class="loading">Produkte werden geladen …</span></div><button class="sgall" data-sq="${esc(raw)}">Suchen <kbd>↵</kbd></button>`;
    }
    sg.innerHTML = h;
    sg.hidden = !h;
  }
  function hideSuggest() {
    sg.hidden = true;
  }
  Object.assign(Ctx, {
    status,
    renderGrid,
    setCat,
    commitSearch,
    sg,
    preloadAll,
    recent,
    renderSuggest,
    hideSuggest,
  });
};

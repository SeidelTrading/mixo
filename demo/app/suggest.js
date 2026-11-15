/* Outlet vitrini — Arama önerileri. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).suggest = async function (Ctx) {
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
    B,
    lists,
    ensure,
    countBrands,
    norm,
    matcher,
    renderGrid,
  } = Ctx;
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
  Object.assign(Ctx, { commitSearch, sg, preloadAll, recent, renderSuggest, hideSuggest });
};

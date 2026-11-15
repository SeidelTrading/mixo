/* Outlet vitrini — Filtre paneli, marka listesi, rozetler. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).filters = async function (Ctx) {
  const S = Ctx.S;
  const { IDX, $, num, esc, HIDCAT, CAT, label, ensure, scopeKey, countBrands, norm } = Ctx;
  /* ───────── filtre paneli ───────── */
  const PRICES = [
    [null, 25],
    [25, 50],
    [50, 100],
    [100, 250],
    [250, null],
  ];
  function renderFilters() {
    const q = S.state.q.trim(),
      useQ = q.length >= 2 && S.qCounts && S.qCountsFor === q;
    const cn = c => (useQ ? S.qCounts.c[c.k] || 0 : c.n),
      sn = (c, i) => (useQ ? S.qCounts.s[c.k + '/' + i] || 0 : c.subs[i].n);
    const row = (on, attr, name, n) =>
      `<button class="frow${on ? ' on' : ''}" ${attr}><span>${esc(name)}</span><i>${num(n)}</i></button>`;
    const cats =
      row(
        S.state.cat === 'all' && !S.state.wishOnly,
        'data-fcat="all"',
        'Alle Produkte',
        useQ ? S.qCounts.t : IDX.total,
      ) +
      IDX.cats
        .filter(c => !HIDCAT.has(c.k) && (cn(c) || S.state.cat === c.k))
        .map(
          c =>
            row(S.state.cat === c.k, `data-fcat="${c.k}"`, c.label, cn(c)) +
            (S.state.cat === c.k && c.subs.length > 1
              ? `<div class="fsubs">${c.subs.map((s, i) => (sn(c, i) || S.state.sub === i ? row(S.state.sub === i, `data-fsub="${i}"`, s.name, sn(c, i)) : '')).join('')}</div>`
              : ''),
        )
        .join('');
    $('#fbody').innerHTML = `
    <div class="fg"><h4>Kategorie</h4><div class="fcats">${cats}</div></div>
    <div class="fg"><h4>Preis</h4>
      <div class="fprice"><input id="pmin" type="number" min="0" step="1" inputmode="decimal" placeholder="von" value="${S.state.pmin ?? ''}" aria-label="Preis von"><span>–</span><input id="pmax" type="number" min="0" step="1" inputmode="decimal" placeholder="bis" value="${S.state.pmax ?? ''}" aria-label="Preis bis"><span>€</span></div>
      <div class="fquick">${PRICES.map(([a, b]) => `<button data-price="${a ?? ''}-${b ?? ''}" aria-pressed="${S.state.pmin === a && S.state.pmax === b}">${a == null ? `bis ${b} €` : b == null ? `ab ${a} €` : `${a}–${b} €`}</button>`).join('')}</div></div>
    <div class="fg"><h4>Marke</h4><input id="bq" type="search" placeholder="Marke suchen …" value="${esc(S.bq)}" aria-label="Marke suchen"><div id="blist"></div></div>
    <div class="fg"><h4>Verfügbarkeit</h4><label class="fcheck"><input type="checkbox" id="favail" ${S.state.avail ? 'checked' : ''}><span>Nur sofort verfügbar</span></label></div>`;
    renderBrandList();
    const n =
      S.state.brands.size +
      (S.state.pmin != null || S.state.pmax != null ? 1 : 0) +
      (S.state.avail ? 1 : 0) +
      (S.state.cat !== 'all' ? 1 : 0);
    $('#fcount').textContent = n ? `(${n})` : '';
  }
  function renderBrandList() {
    const el = $('#blist');
    if (!el) return;
    const src = S.facetBrands || IDX.facets?.[scopeKey()]?.b || [],
      nq = norm(S.bq.trim());
    const hit = (nq ? src.filter(([b]) => norm(b).includes(nq)) : src).slice(0, 24);
    const extra = [...S.state.brands]
      .filter(b => !hit.some(r => r[0] === b))
      .map(b => [b, (src.find(r => r[0] === b) || [])[1] ?? null]);
    el.innerHTML =
      [...extra, ...hit]
        .map(
          ([b, n]) =>
            `<label class="fcheck"><input type="checkbox" data-brand="${esc(b)}" ${S.state.brands.has(b) ? 'checked' : ''}><span>${esc(b)}</span>${n == null ? '' : `<i>${num(n)}</i>`}</label>`,
        )
        .join('') +
      (S.facetBrands
        ? src.length > hit.length && !nq
          ? `<p class="fnote">${num(src.length)} Marken – tippe oben, um zu suchen.</p>`
          : hit.length || extra.length
            ? ''
            : '<p class="fnote">Keine Marke gefunden.</p>'
        : `<button class="fnote flink" data-ballload>Alle ${num(IDX.facets?.[scopeKey()]?.nb || 0)} Marken laden</button>`);
  }
  function loadAllBrands() {
    const key = scopeKey();
    return ensure(key, Infinity)
      .then(rows => {
        if (key === scopeKey() && !S.facetBrands) {
          S.facetBrands = countBrands(rows);
          renderBrandList();
        }
      })
      .catch(() => {});
  }
  function renderPills() {
    const a = [];
    if (S.state.wishOnly) a.push(['wish', '♥ Merkliste']);
    if (S.state.q.trim()) a.push(['q', `Suche: „${S.state.q.trim()}“`]);
    if (S.state.cat !== 'all') a.push(['cat', label(S.state.cat)]);
    if (S.state.sub >= 0) a.push(['sub', CAT[S.state.cat].subs[S.state.sub].name]);
    S.state.brands.forEach(b => a.push(['b:' + b, b]));
    if (S.state.pmin != null || S.state.pmax != null)
      a.push([
        'price',
        S.state.pmin == null
          ? `bis ${S.state.pmax} €`
          : S.state.pmax == null
            ? `ab ${S.state.pmin} €`
            : `${S.state.pmin}–${S.state.pmax} €`,
      ]);
    if (S.state.avail) a.push(['avail', 'Sofort verfügbar']);
    $('#pills').innerHTML =
      a
        .map(
          ([k, t]) =>
            `<button data-pill="${esc(k)}" aria-label="${esc(t)} entfernen">${esc(t)} <span aria-hidden="true">×</span></button>`,
        )
        .join('') + (a.length > 1 ? '<button class="reset" data-reset>Alle zurücksetzen</button>' : '');
  }
  Object.assign(Ctx, { PRICES, renderFilters, renderBrandList, loadAllBrands, renderPills });
};

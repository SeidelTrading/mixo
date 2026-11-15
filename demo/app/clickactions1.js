/* Outlet vitrini — Tıklama eylemleri (1/3). (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).clickactions1 = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    $$,
    PAGE,
    store,
    known,
    wish,
    track,
    pref,
    renderGrid,
    setCat,
    renderCart,
    add,
    toast,
    openModal,
  } = Ctx;
  /* ───────── olaylar ───────── */
  const CLICK_ACTIONS_1 = [
    [
      (d, t) => d.add,
      (d, t, e) => {
        add(d.add);
      },
    ],
    [
      (d, t) => d.wish,
      (d, t, e) => {
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
      },
    ],
    [
      (d, t) => d.open,
      (d, t, e) => {
        openModal(d.open, d.from);
      },
    ],
    [
      (d, t) => d.cat,
      (d, t, e) => {
        e.preventDefault();
        setCat(d.cat);
        $('#katalog').scrollIntoView();
      },
    ],
    [
      (d, t) => d.fcat,
      (d, t, e) => {
        setCat(d.fcat, true);
      },
    ],
    [
      (d, t) => 'fsub' in d,
      (d, t, e) => {
        const i = Number(d.fsub);
        S.state.sub = S.state.sub === i ? -1 : i;
        S.state.shown = PAGE;
        S.state.brands = new Set();
        S.pushNext = true;
        if (S.state.sub >= 0) track('cat', { c: S.state.cat, si: S.state.sub });
        renderGrid();
      },
    ],
    [
      (d, t) => 'more' in d,
      (d, t, e) => {
        S.state.shown += PAGE;
        track('more');
        renderGrid();
      },
    ],
    [
      (d, t) => 'price' in d,
      (d, t, e) => {
        const [a, b] = d.price.split('-').map(x => (x === '' ? null : Number(x)));
        const on = S.state.pmin === a && S.state.pmax === b;
        S.state.pmin = on ? null : a;
        S.state.pmax = on ? null : b;
        S.state.shown = PAGE;
        if (!on && b != null) track('filter', { k: 'pmax' });
        renderGrid();
      },
    ],
    [
      (d, t) => d.pill,
      (d, t, e) => {
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
      },
    ],
  ];
  Object.assign(Ctx, { CLICK_ACTIONS_1 });
};

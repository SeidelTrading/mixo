/* Outlet vitrini — Parça parça katalog yükleyici, arama eşleştirici, marka şeridi. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).catalog = async function (Ctx) {
  const S = Ctx.S;
  const { IDX, $, HIDCAT, ov, CAT, known, HID } = Ctx;
  /* ───────── Parça parça katalog yükleyici (script etiketi; file:// ile de çalışır) ───────── */
  const lists = {},
    waiting = {};
  window.MXC = (key, i, rows) => {
    const w = waiting[key + '#' + i];
    if (w) {
      delete waiting[key + '#' + i];
      w(rows);
    }
  };
  const toP = r => {
    const c = IDX.cats[r[6]];
    const p = {
      id: r[0],
      title: r[1],
      vendor: r[2],
      price: r[3],
      was: r[4],
      img: r[5],
      cat: c.k,
      si: r[7],
      sub: c.subs[r[7]].name,
      base: '',
      na: r[8] === 0,
      lq: r[9] === 1,
    };
    ov(p);
    if (!known.has(p.id)) known.set(p.id, p);
    return p;
  };
  function loadChunk(key, i) {
    return new Promise((res, rej) => {
      waiting[key + '#' + i] = res;
      const s = document.createElement('script');
      s.src = `data/${key.replace('/', '_')}-${i}.js`;
      s.onerror = () => rej(new Error('chunk ' + key + i));
      document.head.appendChild(s);
    });
  }
  function ensure(key, count, onProgress) {
    const L = (lists[key] ??= { n: 0, rows: [], q: Promise.resolve(), done: false }),
      total = IDX.lists[key] || 0;
    const run = async () => {
      while (L.rows.length < count && L.n < total) {
        const from = L.n,
          len = L.rows.length,
          to = Math.min(total, from + (count === Infinity ? 6 : 1)),
          ps = [];
        for (let i = from; i < to; i++) ps.push(loadChunk(key, i));
        L.n = to;
        const rs = await Promise.allSettled(ps),
          bad = rs.find(r => r.status === 'rejected');
        if (bad) {
          for (let i = from; i < to; i++) delete waiting[key + '#' + i];
          L.n = from;
          L.rows.length = len;
          throw bad.reason;
        }
        for (const r of rs)
          L.rows.push(...r.value.map(toP).filter(p => !HID.has(p.id) && !HIDCAT.has(p.cat)));
        onProgress?.(L.n / total);
      }
      if (L.n >= total) L.done = true;
      return L.rows;
    };
    const r = L.q.then(run, run);
    L.q = r.catch(() => {});
    return r;
  }
  const scopeKey = () =>
    S.state.cat === 'all' ? 'all' : S.state.sub >= 0 ? S.state.cat + '/' + S.state.sub : S.state.cat;
  const scopeTotal = () =>
    S.state.cat === 'all'
      ? IDX.total
      : S.state.sub >= 0
        ? CAT[S.state.cat].subs[S.state.sub].n
        : CAT[S.state.cat].n;
  const hasFilters = () =>
    !!(S.state.brands.size || S.state.pmin != null || S.state.pmax != null || S.state.avail);
  const countBrands = list => {
    const m = new Map();
    for (const p of list) m.set(p.vendor, (m.get(p.vendor) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  };
  /* arama: büyük/küçük harf, aksan ve tire/boşluk farkına duyarsız */
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const hay = p =>
    (p._h ??= (() => {
      const a = norm(p.title + ' ' + p.vendor + ' ' + p.sub);
      return a + ' ' + a.replace(/[^a-z0-9]/g, '');
    })());
  const matcher = q => {
    const ws = norm(q)
      .split(/\s+/)
      .filter(Boolean)
      .map(w => [w, w.replace(/[^a-z0-9]/g, '')]);
    return p => {
      const h = hay(p);
      return ws.every(([w, c]) => h.includes(w) || (c.length > 1 && h.includes(c)));
    };
  };
  /* marka şeridi */
  const marks = [
    'dior',
    'chanel',
    'prada',
    'armani',
    'lancome',
    'hermes',
    'burberry',
    'chloe',
    'guess',
    'tommy',
    'calvin',
    'festina',
    'orient',
    'adidas',
    'brother',
    'hp',
    'canon',
    'epson',
    'samsung',
    'kyocera',
  ];
  $('#brandTrack').innerHTML = [...marks, ...marks]
    .map(m => `<img src="img/mx-mark-${m}.webp" alt="${m}" loading="lazy">`)
    .join('');
  Object.assign(Ctx, {
    lists,
    waiting,
    toP,
    loadChunk,
    ensure,
    scopeKey,
    scopeTotal,
    hasFilters,
    countBrands,
    norm,
    hay,
    matcher,
    marks,
  });
};

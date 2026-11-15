/* Outlet vitrini — Davranış katmanı: olay kaydı, oturum, profil. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).behavior = async function (Ctx) {
  const S = Ctx.S;
  const { CAT, label, store, known } = Ctx;
  const count = (...a) => Ctx.count(...a);
  const renderInsights = (...a) => Ctx.renderInsights(...a);
  /* ───────── Davranış katmanı: olay kaydı → profil → kişiselleştirme (yalnız onay varsa) ───────── */
  const B = {
    consent: store.get('mx-consent', null),
    ev: store.get('mx-ev', []),
    user: store.get('mx-user', null),
    seen: store.get('mx-seen', []),
    meta: store.get('mx-meta', { sessions: 0, last: 0, first: Date.now() }),
  };
  const newSession = Date.now() - B.meta.last > 30 * 60e3;
  if (newSession) B.meta.sessions++;
  B.meta.last = Date.now();
  store.set('mx-meta', B.meta);
  B.seen.forEach(p => p?.id && !known.has(p.id) && known.set(p.id, p));
  S.saveT = undefined;
  /* sunucuya olay gönderimi (yalnız onay varsa; sunucu yoksa sessizce atlanır) */
  const outbox = [];
  S.vid = store.get('mx-vid', null);
  function flush() {
    if (!outbox.length || B.consent !== true || location.protocol === 'file:') return;
    if (!S.vid) {
      S.vid = crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      store.set('mx-vid', S.vid);
    }
    const body = JSON.stringify({ vid: S.vid, events: outbox.splice(0, 60) });
    try {
      if (!navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'text/plain' })))
        fetch('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
    } catch {}
  }
  setInterval(flush, 5000);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  const HID = new Set();
  function track(e, d = {}) {
    if (B.consent !== true) return;
    outbox.push({ s: B.meta.sessions, e, ...d });
    B.ev.push({ t: Date.now(), s: B.meta.sessions, e, ...d });
    if (B.ev.length > 500) B.ev.splice(0, B.ev.length - 500);
    B.meta.last = Date.now();
    clearTimeout(S.saveT);
    S.saveT = setTimeout(() => {
      store.set('mx-ev', B.ev);
      store.set('mx-meta', B.meta);
    }, 300);
    renderInsights();
  }
  const pref = p => ({ id: p.id, c: p.cat, si: p.si ?? -1, b: p.vendor, pr: p.price });
  function profile() {
    const now = Date.now(),
      W = { view: 1, dwell: 1, wish: 3, add: 5, cat: 0.5, sugg: 2 };
    const cat = {},
      sub = {},
      brand = {},
      prices = [],
      n = {
        view: 0,
        wish: 0,
        add: 0,
        checkout: 0,
        search: 0,
        cat: 0,
        remove: 0,
        exit_intent: 0,
        sort: 0,
        filter: 0,
        cart_open: 0,
      };
    let cheap = 0;
    for (const x of B.ev) {
      n[x.e] = (n[x.e] || 0) + 1;
      if (x.e === 'sort' && x.o === 'asc') cheap++;
      if (x.e === 'filter' && x.k === 'pmax') cheap++;
      if (x.e === 'dwell' && x.sec < 12) continue;
      const w = (W[x.e] || 0) * Math.pow(0.5, (now - x.t) / (7 * 864e5));
      if (!w) continue;
      if (x.c && CAT[x.c]) {
        cat[x.c] = (cat[x.c] || 0) + w;
        if (x.si >= 0) {
          const k = x.c + '/' + x.si;
          sub[k] = (sub[k] || 0) + w;
        }
      }
      if (x.b) brand[x.b] = (brand[x.b] || 0) + w;
      if (x.pr && (x.e === 'view' || x.e === 'add')) prices.push(x.pr);
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const cats = top(cat),
      subs = top(sub),
      brands = top(brand);
    prices.sort((a, b) => a - b);
    const med = prices.length ? prices[prices.length >> 1] : 0;
    const cur = B.ev.filter(x => x.s === B.meta.sessions),
      sv = {};
    cur.forEach(x => {
      if (x.e === 'view' && x.si >= 0) {
        const k = x.c + '/' + x.si;
        sv[k] = (sv[k] || 0) + 1;
      }
    });
    const cartN = count(),
      bsum = brands.reduce((a, b) => a + b[1], 0);
    let stage, action;
    if (cartN && cur.some(x => x.e === 'checkout')) {
      stage = 'Kaufbereit';
      action = 'Checkout frei halten: keine Ablenkung, Vertrauen zeigen (Versand, Rückgabe, Zahlung).';
    } else if (
      cartN &&
      (n.remove || n.exit_intent || (B.meta.sessions > 1 && !cur.some(x => x.e === 'add')))
    ) {
      stage = 'Zögert';
      action = 'Warenkorb freundlich in Erinnerung rufen und offene Fragen klären (Lieferzeit, Rückgabe).';
    } else if (cartN) {
      stage = 'Entscheidet';
      action = 'Lücke bis zum Gratisversand zeigen und passende Ergänzungen vorschlagen.';
    } else if (Object.values(sv).some(v => v >= 3)) {
      stage = 'Vergleicht';
      action = 'Ähnliche Produkte nebeneinander zeigen, Unterschiede sichtbar machen.';
    } else if (n.view) {
      stage = 'Stöbert';
      action = '„Für dich“-Auswahl aus den angesehenen Kategorien zeigen.';
    } else {
      stage = 'Neu';
      action = 'Orientierung geben: Kategorien, Suche, Bestseller-Marken.';
    }
    const traits = [];
    if (cheap) traits.push('preisbewusst');
    if (brands[0] && n.view >= 4 && brands[0][1] / bsum >= 0.5)
      traits.push('markentreu (' + brands[0][0] + ')');
    if (n.search >= 2 && n.search > n.cat) traits.push('zielgerichtet (sucht statt zu stöbern)');
    if (cats.length >= 3) traits.push('entdeckt gern Neues');
    if (n.wish >= 2 && !n.add) traits.push('sammelt auf der Merkliste');
    return { cats, subs, brands, med, band: [med * 0.5, med * 1.6], stage, action, traits, n };
  }
  const subName = k => {
    const [c, i] = k.split('/');
    return CAT[c]?.subs[i]?.name || label(c);
  };
  Object.assign(Ctx, { B, newSession, outbox, flush, HID, track, pref, profile, subName });
};

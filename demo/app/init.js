/* Outlet vitrini — Raflar ve ilk çizim. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).init = async function (Ctx) {
  const {
    $,
    $$,
    HIDCAT,
    ov,
    known,
    B,
    newSession,
    HID,
    track,
    card,
    renderRails,
    applyUrl,
    renderGrid,
    count,
    renderCart,
    toast,
    openModal,
    renderForYou,
    renderSeen,
    renderAcct,
    loadConfig,
  } = Ctx;
  await loadConfig();
  /* vitrin rafları: çok bakılanlar, 25 € altı, premium, (varsa) indirimli */
  async function loadShelves() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('/api/shop/home');
      if (!r.ok) return;
      const h = await r.json();
      const fill = (id, rows) => {
        const sec = $('#' + id),
          rail = $('#' + id + 'Rail');
        if (!sec || !rail) return;
        const ps = (rows || [])
          .map(r => {
            const p = { ...r, base: '' };
            ov(p);
            if (!known.has(p.id)) known.set(p.id, p);
            return known.get(p.id);
          })
          .filter(p => !HID.has(p.id) && !HIDCAT.has(p.cat));
        if (ps.length < 4) {
          sec.hidden = true;
          return;
        }
        rail.innerHTML = ps.map(card).join('');
        sec.hidden = false;
      };
      fill('angebote', h.deals);
      fill('beliebt', h.best);
      fill('budget', h.budget);
      fill('premium', h.premium);
      if (h.bestSource === 'curated') {
        const t = $('#beliebt h2');
        if (t) t.textContent = 'Unsere Auswahl für dich.';
        const e = $('#beliebt .eyebrow');
        if (e) e.textContent = 'Von uns ausgewählt';
      }
    } catch {}
  }
  loadShelves();
  renderRails();
  renderCart();
  renderAcct();
  if (!applyUrl(true)) renderGrid();
  renderForYou();
  renderSeen();
  if (B.consent === null) $('#consent').hidden = false;
  if (newSession) {
    track('session', { n: B.meta.sessions });
    if (B.meta.sessions > 1 && count() > 0)
      setTimeout(
        () =>
          toast(
            `${B.user?.name ? B.user.name + ', d' : 'D'}ein Warenkorb wartet auf dich (${count()} Artikel)`,
          ),
        1200,
      );
  }
  const io = new IntersectionObserver(
    es =>
      es.forEach(x => {
        if (x.isIntersecting) {
          x.target.classList.add('in');
          io.unobserve(x.target);
        }
      }),
    { threshold: 0.12 },
  );
  $$('.reveal').forEach(el => io.observe(el));
  /* Instagram bağlantısı: /?p=<ürün kimliği> ürün penceresini açar */
  (async () => {
    const id = new URLSearchParams(location.search).get('p');
    if (!id) return;
    try {
      const r = await fetch('/api/shop/product?id=' + encodeURIComponent(id));
      if (!r.ok) return;
      const p = { ...(await r.json()), base: '' };
      ov(p);
      if (!known.has(p.id)) known.set(p.id, p);
      openModal(p.id, 'instagram');
    } catch {}
  })();
  Object.assign(Ctx, { loadShelves, io });
};

/* Outlet vitrini — Davranış katmanı: olay kaydı, oturum, profil. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).behavior = async function (Ctx) {
  const S = Ctx.S;
  const { store, known } = Ctx;
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
  Object.assign(Ctx, { B, newSession });
};

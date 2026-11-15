/* Outlet vitrini — Kişiselleştirme, analiz paneli, rıza, hesap. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).personal = async function (Ctx) {
  const S = Ctx.S;
  const { $, eur, cart, B, profile, subName, ensure, card } = Ctx;
  /* ───────── kişiselleştirme: Für dich + Zuletzt angesehen ───────── */
  S.fyT = undefined;
  S.fyN = 0;
  async function renderForYou() {
    const sec = $('#fuerdich'),
      my = ++S.fyN;
    if (B.consent !== true) {
      sec.hidden = true;
      return;
    }
    const pr = profile(),
      key = pr.subs[0]?.[0];
    if (!key || pr.n.view < 2) {
      sec.hidden = true;
      return;
    }
    try {
      const rows = await ensure(key, 300);
      if (my !== S.fyN) return;
      const seen = new Set(B.seen.map(p => p.id)),
        bw = Object.fromEntries(pr.brands.slice(0, 5));
      const pick = rows
        .filter(p => !p.na && !p.lq && !seen.has(p.id) && !cart[p.id])
        .map(p => [p, (bw[p.vendor] ? -1 : 0) + (pr.med ? Math.abs(Math.log(p.price / pr.med)) : 0)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 12)
        .map(x => x[0]);
      if (!pick.length) {
        sec.hidden = true;
        return;
      }
      $('#fyTitle').textContent = (B.user?.name ? `${B.user.name}, das` : 'Das') + ' könnte dir gefallen.';
      $('#fyWhy').textContent =
        `Ausgewählt, weil du dir ${subName(key)} angesehen hast${pr.med ? ` – rund um ${eur(pr.med)}` : ''}.`;
      $('#fyRail').innerHTML = pick.map(card).join('');
      $('#fyMore').dataset.k = key;
      sec.hidden = false;
    } catch {
      sec.hidden = true;
    }
  }
  function renderSeen() {
    const sec = $('#zuletzt');
    if (B.consent !== true || B.seen.length < 2) {
      sec.hidden = true;
      return;
    }
    $('#seenRail').innerHTML = B.seen.map(card).join('');
    sec.hidden = false;
  }
  Object.assign(Ctx, { renderForYou, renderSeen });
};

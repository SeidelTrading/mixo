/* Outlet vitrini — Kişiselleştirme, analiz paneli, rıza, hesap. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).personal = async function (Ctx) {
  const S = Ctx.S;
  const {
    $,
    eur,
    esc,
    label,
    store,
    cart,
    B,
    outbox,
    track,
    profile,
    subName,
    ensure,
    card,
    count,
    closeModal,
  } = Ctx;
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
  /* ───────── müşteri analizi paneli (mağaza sahibi için demo) ───────── */
  const EV = {
    view: 'Produkt angesehen',
    dwell: 'Verweildauer',
    add: 'In den Warenkorb',
    remove: 'Aus Warenkorb entfernt',
    wish: 'Auf Merkliste',
    unwish: 'Von Merkliste entfernt',
    search: 'Suche',
    cat: 'Kategorie geöffnet',
    filter: 'Filter gesetzt',
    sort: 'Sortierung',
    more: 'Mehr geladen',
    cart_open: 'Warenkorb geöffnet',
    checkout: 'Zur Kasse geklickt',
    exit_intent: 'Wollte die Seite verlassen',
    sugg: 'Suchvorschlag gewählt',
    session: 'Neuer Besuch',
    login: 'Angemeldet',
  };
  function renderInsights() {
    const el = $('#ibody');
    if (!el || !$('#insights').classList.contains('on')) return;
    if (B.consent !== true) {
      el.innerHTML =
        '<p class="fnote" style="font-size:14.5px">Die Analyse ist ausgeschaltet, weil keine Einwilligung vorliegt. Ohne Einwilligung speichern wir nur Warenkorb und Merkliste.</p><button class="btn btn-primary" data-consent="1">Analyse einschalten</button>';
      return;
    }
    const p = profile(),
      bars = a => {
        const m = a[0]?.[1] || 1;
        return (
          a
            .slice(0, 5)
            .map(
              ([k, v]) =>
                `<div class="ibar"><span>${esc(k)}</span><i style="width:${Math.max(6, (v / m) * 100)}%"></i></div>`,
            )
            .join('') || '<p class="fnote">Noch keine Daten.</p>'
        );
      };
    const fn = [
        ['Angesehen', p.n.view],
        ['Gemerkt', p.n.wish],
        ['Warenkorb', p.n.add],
        ['Kasse', p.n.checkout],
      ],
      fm = Math.max(1, ...fn.map(x => x[1]));
    el.innerHTML = `<div class="istage"><small>AKTUELLE PHASE</small><b>${p.stage}</b><span>${p.action}</span></div>
    <div class="ikpi"><div><b>${B.meta.sessions}</b>Besuche</div><div><b>${p.n.view}</b>Produkte</div><div><b>${p.n.search}</b>Suchen</div><div><b>${count()}</b>im Korb</div></div>
    <h4>Trichter</h4>${fn.map(([k, v]) => `<div class="ibar f"><span>${k} · ${v}</span><i style="width:${Math.max(4, (v / fm) * 100)}%"></i></div>`).join('')}
    <h4>Interessen</h4>${bars(p.subs.map(([k, v]) => [label(k.split('/')[0]) + ' › ' + subName(k), v]).concat(p.subs.length ? [] : p.cats.map(([k, v]) => [label(k), v])))}
    <h4>Marken</h4>${bars(p.brands)}
    <h4>Preisrahmen</h4><p class="fnote" style="font-size:14px">${p.med ? `meist ${eur(p.band[0])} – ${eur(p.band[1])} (Median ${eur(p.med)})` : 'Noch keine Daten.'}</p>
    <h4>Merkmale</h4><div class="itr">${p.traits.map(t => `<span>${esc(t)}</span>`).join('') || '<p class="fnote">Noch zu wenig Verhalten für eine Einschätzung.</p>'}</div>
    <h4>Letzte Ereignisse</h4><ol class="ilog">${
      B.ev
        .slice(-12)
        .reverse()
        .map(
          x =>
            `<li><time>${new Date(x.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>${esc(EV[x.e] || x.e)}${x.q ? ` „${esc(x.q)}“ (${x.n})` : x.sec != null ? ` ${x.sec}s` : x.b ? ` · ${esc(x.b)}` : x.c ? ` · ${esc(label(x.c))}` : ''}</li>`,
        )
        .join('') || '<li>Noch keine Ereignisse.</li>'
    }</ol>
    <div class="cta"><button class="btn btn-ghost" data-wipe>Meine Daten löschen</button><button class="btn btn-ghost" data-consent="0">Analyse ausschalten</button></div>`;
  }
  function openInsights() {
    closeModal(true);
    $('#drawer').classList.remove('on');
    $('#acct').hidden = true;
    $('#insights').classList.add('on');
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    renderInsights();
  }
  function setConsent(v) {
    B.consent = v;
    store.set('mx-consent', v);
    $('#consent').hidden = true;
    if (!v) {
      B.ev = [];
      B.seen = [];
      outbox.length = 0;
      S.vid = null;
      store.del('mx-ev');
      store.del('mx-seen');
      store.del('mx-vid');
      document.cookie = 'mxv=; Max-Age=0; Path=/';
    } else track('session', { n: B.meta.sessions });
    renderForYou();
    renderSeen();
    renderInsights();
  }
  function renderAcct() {
    $('#acct').innerHTML = B.user?.name
      ? `<b>Hallo, ${esc(B.user.name)}</b><p>Schön, dass du da bist.</p><button class="btn btn-ghost" data-insights>Meine Analyse (Demo)</button><button class="flink" data-logout>Abmelden</button>`
      : `<b>Anmelden (Demo)</b><p>Nur dein Vorname – er bleibt in diesem Browser.</p><form id="loginF"><input id="uname" maxlength="24" placeholder="Vorname" autocomplete="given-name" aria-label="Vorname"><button class="btn btn-primary">Anmelden</button></form><button class="flink" data-insights>Kundenanalyse ansehen (Demo)</button>`;
    $('#acctBtn').classList.toggle('in', !!B.user?.name);
  }
  Object.assign(Ctx, { renderForYou, renderSeen, EV, renderInsights, openInsights, setConsent, renderAcct });
};

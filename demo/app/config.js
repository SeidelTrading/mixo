/* Outlet vitrini — Yönetici yapılandırması ve vitrin bağlantıları. (bkz. app.js: sıralı yükleme) */
(window.MXM ||= {}).config = async function (Ctx) {
  const S = Ctx.S;
  const { IDX, F, $, $$, eur, num, esc, HIDCAT, ov, CAT, known, cart, wish, B, HID, card, subtotal, toast } =
    Ctx;
  /* öne çıkan kutular */
  function pick(sel, p, lab) {
    const el = $(sel);
    if (!p || !el) return;
    el.dataset.open = p.id;
    el.innerHTML = `<img src="${p.img}" alt=""><span><small>${lab}</small><b>${esc(p.title.split(' – ')[0].slice(0, 46))}</b><span>${eur(p.price)}</span></span>`;
  }
  pick(
    '#pickParfum',
    F.find(p => p.vendor === 'Chanel'),
    'UNSER FUND ZUM MOMENT',
  );
  pick(
    '#pickTech',
    F.find(p => p.id === 'apple-a1400'),
    'UNSER FUND ZUM MOMENT',
  );
  const sauv = F.find(p => p.img.includes('sauvage-edp'));
  if (sauv) $('#heroTag').dataset.open = sauv.id;
  $$('[data-total]').forEach(el => (el.textContent = num(IDX.total)));
  $$('[data-ncat]').forEach(el => {
    const c = CAT[el.dataset.ncat];
    if (c) el.textContent = num(c.n) + ' Produkte';
  });
  /* yönetici panelinden gelen ayarlar: duyuru, gizli ürünler, öne çıkanlar */
  async function loadConfig() {
    if (location.protocol === 'file:') return;
    try {
      /* yavaş bağlantı / soğuk başlangıç: 4 sn, olmazsa bir kez daha 6 sn; ayar gelmeden gizli ürünler süzülemez */
      const get = async ms => {
        const c = new AbortController(),
          t = setTimeout(() => c.abort(), ms);
        try {
          const r = await fetch('/api/config', { signal: c.signal });
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        } finally {
          clearTimeout(t);
        }
      };
      const cfg = (await get(4000)) || (await get(6000));
      if (!cfg) {
        setTimeout(() => toast('Daten evtl. nicht aktuell – bitte Seite neu laden'), 800);
        return;
      }
      (cfg.hidden || []).forEach(id => HID.add(id));
      /* gizli / onay bekleyen ürünler kategori, alt kategori ve toplam sayaçlarından düşer */
      const hc = cfg.hiddenCounts;
      if (hc) {
        IDX.total = Math.max(0, IDX.total - (hc.total || 0));
        for (const [k, n] of Object.entries(hc.cats || {})) if (CAT[k]) CAT[k].n = Math.max(0, CAT[k].n - n);
        for (const [k, n] of Object.entries(hc.subs || {})) {
          const [c, i] = k.split('/'),
            sub = CAT[c]?.subs[i];
          if (sub) sub.n = Math.max(0, sub.n - n);
        }
        $$('[data-total]').forEach(el => (el.textContent = num(IDX.total)));
        $$('[data-ncat]').forEach(el => {
          const c = CAT[el.dataset.ncat];
          if (c) el.textContent = num(c.n) + ' Produkte';
        });
      }
      S.OV = cfg.overrides || {};
      /* kategori adları ve gizli kategoriler */
      for (const [k, o] of Object.entries(cfg.categories || {})) {
        const cat = CAT[k];
        if (!cat) continue;
        if (o.label) {
          cat.label = o.label;
          $$('nav.cats a[data-cat="' + k + '"], footer a[data-cat="' + k + '"]').forEach(a => {
            a.textContent = o.label;
          });
        }
        if (o.hidden) {
          HIDCAT.add(k);
          $$('[data-cat="' + k + '"], [data-ncat="' + k + '"]').forEach(a => {
            (a.closest('li') || a.closest('.tile') || a).hidden = true;
          });
        }
      }
      /* metin içeriği (yalnızca textContent) */
      const ct = cfg.content || {},
        an = cfg.announcement || '';
      if (an) $('.announce span:nth-child(1)').textContent = an;
      if (ct.announce2) $('.announce span:nth-child(2)').textContent = ct.announce2;
      if (ct.heroTitle) $('#heroH').textContent = ct.heroTitle;
      if (ct.heroSub) $('#heroSub').textContent = ct.heroSub;
      if (ct.demobar) $('.demobar').textContent = ct.demobar;
      if (Number.isFinite(ct.freeShip) && ct.freeShip >= 0) {
        S.FREE = ct.freeShip;
        S.wasFree = subtotal() >= S.FREE;
      }
      /* düzenlemeleri bilinen tüm ürünlere uygula */
      F.forEach(ov);
      known.forEach(ov);
      Object.values(cart).forEach(e => e?.p && ov(e.p));
      Object.values(wish).forEach(p => p && ov(p));
      B.seen.forEach(p => p && ov(p));
      const feat = (cfg.featured || []).map(p => ({ ...ov(p), base: '' })).filter(p => !HIDCAT.has(p.cat));
      feat.forEach(p => known.set(p.id, p));
      if (feat.length) {
        $('#empRail').innerHTML = feat.map(card).join('');
        $('#empfohlen').hidden = false;
      }
      Object.keys(cart).forEach(id => {
        if (HID.has(id)) delete cart[id];
      });
    } catch {}
  }
  Object.assign(Ctx, { pick, sauv, loadConfig });
};

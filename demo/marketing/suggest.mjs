import { DAY, MIN_EVENTS, MAX_ITEMS } from './shared.mjs';
import { aggregate, makeSuggestHelpers } from './suggest-helpers.mjs';
import { consented } from '../services/analytics.mjs';

// Veriden kampanya önerisi ve uygulama.
export function makeSuggest(c) {
  const { P, getEvents, norm, CATS, settings, searchProducts, eur, actions, effP } = c;
  const { row, usable, fill, top } = makeSuggestHelpers(c);
  function suggestions(daysIn = 7) {
    const days = Math.min(90, Math.max(1, Number(daysIn) || 7)),
      from = Date.now() - days * DAY,
      // Çerez onayı kapısı (services/analytics.mjs): damgasız ve eski olaylar öneriye girmez.
      ev = getEvents().filter(x => x.t >= from && consented(x));
    const views = ev.filter(x => x.e === 'view'),
      vis = new Set(ev.map(x => x.vid));
    const { pv, pa, cats, brands, sq } = aggregate(ev, norm);
    const enough = ev.length >= MIN_EVENTS,
      items = [];
    const data = {
      days,
      events: ev.length,
      visitors: vis.size,
      views: views.length,
      minEvents: MIN_EVENTS,
      enough,
      note:
        ev.length === 0
          ? 'Bu dönemde hiç ziyaretçi olayı yok. Olaylar yalnızca çerez onayı veren ziyaretçilerden toplanır; öneriler davranış verisi geldikçe oluşur.'
          : !enough
            ? `Yalnızca ${ev.length} olay var (en az ${MIN_EVENTS} gerekir). Az veriden kategori/marka önerisi üretilmedi.`
            : null,
    };
    if (enough) {
      const tc = top(cats)[0];
      if (tc && tc[1] >= 3) {
        const [k, n] = tc,
          c = CATS.find(x => x.k === k),
          pct = Math.round((n / views.length) * 100),
          label = settings.categories[k]?.label || c?.label || k;
        const prim = top(pv).filter(([id]) => P.get(id)?.cat === k);
        items.push({
          id: 'cat:' + k,
          type: 'category',
          title: `En çok bakılan kategori: ${label}`,
          shopText: `Beliebt im Outlet: ${label}`,
          why: `Son ${days} günde ${views.length} ürün görüntülemesinin ${n}’i (%${pct}) bu kategoride.`,
          products: fill(prim, () => [...P.values()].filter(p => p.cat === k), 'bakıldı'),
        });
      }
      const tb = top(brands)[0];
      if (tb && tb[1] >= 3) {
        const [b, n] = tb,
          nb = norm(b),
          pct = Math.round((n / views.length) * 100);
        items.push({
          id: 'brand:' + nb,
          type: 'brand',
          title: `En çok bakılan marka: ${b}`,
          shopText: `Beliebt im Outlet: ${b}`,
          why: `Son ${days} günde ${views.length} ürün görüntülemesinin ${n}’i (%${pct}) bu markada.`,
          products: fill(
            top(pv).filter(([id]) => norm(P.get(id)?.vendor || '') === nb),
            () => [...P.values()].filter(p => norm(p.vendor) === nb),
            'bakıldı',
          ),
        });
      }
      const tad = top(pa);
      if (tad.length && tad.reduce((a, x) => a + x[1], 0) >= 3)
        items.push({
          id: 'added:all',
          type: 'added',
          title: 'Sepete en çok eklenen ürünler',
          shopText: 'Oft im Warenkorb: unsere Empfehlungen',
          why: `Son ${days} günde ${tad.reduce((a, x) => a + x[1], 0)} sepete ekleme; en çok eklenen ${tad.length} üründen ilkleri.`,
          products: fill(tad.slice(0, MAX_ITEMS), () => [], 'sepete eklendi'),
        });
      const zero = [...sq.values()]
        .filter(q => q.results === 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      if (zero.length) {
        const seen = new Set(),
          prods = [];
        for (const q of zero) {
          const w = norm(q.q)
            .split(/\s+/)
            .filter(x => x.length >= 3)
            .sort((a, b) => b.length - a.length)[0];
          if (!w) continue;
          for (const p of searchProducts(w, undefined, 3))
            if (usable(p) && !seen.has(p.id) && prods.length < MAX_ITEMS) {
              seen.add(p.id);
              prods.push(row(p, `“${q.q}” aramasına yakın (“${w}” kelimesi)`));
            }
        }
        items.push({
          id: 'zero:all',
          type: 'zero',
          title: 'Sonuç vermeyen aramalar',
          shopText: '',
          why: `Sonuç bulamayan aramalar: ${zero.map(q => `“${q.q}” (${q.count}×)`).join(', ')}. Ürünler yalnız tek kelimeyle yakın eşleşmelerdir; tam karşılığı katalogda olmayabilir.`,
          products: prods,
        });
      }
    }
    // indirim: katalogda eski fiyat yok; yalnız yöneticinin girdiği eski fiyatlar sayılır (uydurma indirim yok)
    const disc = Object.keys(settings.overrides)
      .map(id => P.get(id))
      .filter(p => p && usable(p) && effP(p).was > effP(p).price)
      .sort((a, b) => 1 - effP(b).price / effP(b).was - (1 - effP(a).price / effP(a).was))
      .slice(0, 12);
    items.push({
      id: 'disc:all',
      type: 'discount',
      title: 'En yüksek indirimli ürünler',
      shopText: 'Reduzierte Artikel im Outlet',
      empty: !disc.length,
      why: disc.length
        ? `${disc.length} üründe yönetici eski fiyat girmiş (en yüksek indirim %${Math.round((1 - effP(disc[0]).price / effP(disc[0]).was) * 100)}). Eski fiyatın gerçek olduğundan emin olun (son 30 günün en düşük fiyatı kuralı).`
        : 'Katalogda eski fiyat bilgisi yok; hiçbir üründe eski fiyat > fiyat değil. İndirim önerisi için Ürünler sekmesinden gerçek eski fiyat girilmelidir. Uydurma indirim üretilmedi.',
      products: disc.map(p =>
        row(
          p,
          `%${Math.round((1 - effP(p).price / effP(p).was) * 100)} (${eur(effP(p).was)} → ${eur(effP(p).price)})`,
        ),
      ),
    });
    return { data, items, active: settings.marketing.active || null };
  }
  // frozen: onay kartı oluşturulurken dondurulan içerik; verilirse öneri yeniden hesaplanmaz (kartta yazan ürünler uygulanır).
  function applyCampaign(id, announce, by, days = 7, frozen = null) {
    if (frozen) {
      const c = actions.apply_campaign(frozen, by);
      return c ? { change: c, count: frozen.ids.length } : { err: 'Kampanya uygulanamadı.' };
    }
    const it = suggestions(days).items.find(x => x.id === id);
    if (!it) return { err: 'Öneri bulunamadı (veri değişmiş olabilir). Listeyi yenileyin.' };
    const ids = it.products.map(p => p.id).slice(0, 12);
    if (!ids.length) return { err: 'Bu önerinin vitrine yansıtılacak ürünü yok.' };
    const c = actions.apply_campaign(
      { cid: it.id, title: it.title, ids, text: announce && it.shopText ? it.shopText : null },
      by,
    );
    return { change: c, count: ids.length };
  }
  return { row, usable, fill, top, suggestions, applyCampaign };
}

import { lintText } from './shared.mjs';
// Hatırlatma kuralları: varsayılanlar, doğrulama, kategori eşleştirme.
export function makeRules(c) {
  const { CATS, settings, saveSettings, uid } = c;
  /* ───────── 3. sepet ve yeniden sipariş hatırlatması ───────── */
  const consumableTokens = () => {
    const d = CATS.find(c => c.k === 'drucker');
    return d
      ? d.subs
          .map((s, i) => [s.name, i])
          .filter(([n]) => /^(Toner|Tintenpatronen|Trommeln)$/.test(n))
          .map(([, i]) => 'drucker/' + i)
      : [];
  };
  const DEFAULT_RULES = () => [
    {
      id: 'r-cart',
      name: 'Sepeti bırakanlara hatırlatma',
      type: 'cart',
      days: 2,
      cats: [],
      enabled: true,
      subject: 'Dein Warenkorb bei Outlet Demo',
      body: 'Hallo {name},\n\ndu hast Artikel in deinem Warenkorb gelassen:\n{produkte}\n\nHier kannst du deine Auswahl in Ruhe ansehen und die Bestellung abschließen: {link}\n\nKeine Erinnerungen mehr? {abmelden}\n\nOutlet Demo',
    },
    {
      id: 'r-reorder',
      name: 'Toner / mürekkep yeniden sipariş',
      type: 'reorder',
      days: 60,
      cats: consumableTokens(),
      enabled: true,
      subject: 'Brauchst du Nachschub?',
      body: 'Hallo {name},\n\nam {datum} hast du bei uns bestellt:\n{produkte}\n\nFalls dein Vorrat zur Neige geht, findest du die Artikel hier wieder: {link}\n\nKeine Erinnerungen mehr? {abmelden}\n\nOutlet Demo',
    },
  ];
  if (!settings.marketing.rules) {
    settings.marketing.rules = DEFAULT_RULES();
    saveSettings();
  }
  const catLabel = t => {
    const [c, s] = String(t).split('/'),
      cat = CATS.find(x => x.k === c);
    return cat
      ? s !== undefined
        ? `${cat.label} › ${cat.subs[Number(s)]?.name ?? s}`
        : settings.categories[c]?.label || cat.label
      : t;
  };
  function cleanRule(r) {
    if (!r || typeof r !== 'object') return { err: 'Geçersiz kural.' };
    const type = r.type === 'reorder' ? 'reorder' : r.type === 'cart' ? 'cart' : null;
    if (!type) return { err: 'Tür cart ya da reorder olmalı.' };
    const days = Math.floor(Number(r.days));
    if (!(days >= 0 && days <= 365)) return { err: 'Gün sayısı 0–365 arası olmalı.' };
    const name = String(r.name || '')
        .trim()
        .slice(0, 80),
      subject = String(r.subject || '')
        .trim()
        .slice(0, 120),
      body = String(r.body || '')
        .trim()
        .slice(0, 3000);
    if (!name || !subject || !body) return { err: 'Ad, konu ve ileti metni boş olamaz.' };
    if (!body.includes('{abmelden}'))
      return { err: 'İleti metninde {abmelden} (abonelikten çıkış bağlantısı) bulunmalı.' };
    const lw = lintText(subject + '\n' + body);
    if (lw.length) return { err: 'İleti metni reddedildi: ' + lw.join('; ') };
    const cats = (Array.isArray(r.cats) ? r.cats : []).map(String).filter(t => {
      const [c, s] = t.split('/');
      const cat = CATS.find(x => x.k === c);
      return cat && (s === undefined || (Number.isInteger(Number(s)) && cat.subs[Number(s)]));
    });
    return {
      rule: {
        id: /^[\w-]{1,24}$/.test(String(r.id || '')) ? String(r.id) : 'r-' + uid(),
        name,
        type,
        days,
        cats: [...new Set(cats)],
        enabled: r.enabled !== false,
        subject,
        body,
      },
    };
  }
  const catOk = (rule, p) =>
    !rule.cats.length ||
    rule.cats.some(t => {
      const [c, s] = t.split('/');
      return p.cat === c && (s === undefined || String(p.si) === s);
    });
  return { consumableTokens, DEFAULT_RULES, catLabel, cleanRule, catOk };
}

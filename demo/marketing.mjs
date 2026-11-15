// Pazarlama modülü: (1) veriden kampanya önerisi, (2) Instagram içerik hattı (instagram.mjs'i kullanır), (3) sepet/yeniden sipariş hatırlatması.
// Hatırlatmalar YALNIZ simülasyondur: hiçbir e-posta gönderilmez. Alıcı olabilmek için açık izin (opt-in) şarttır.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DAY = 864e5, MIN_EVENTS = 20, MAX_ITEMS = 8;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
// Almanya (UWG): sahte aciliyet / baskı kalıpları. Metin kaydedilmeden uyarılır (Instagram) ya da reddedilir (hatırlatma şablonu).
const DARK = /nur noch (\d|heute|wenige|ein paar)|letzte[nr]? chance|nur heute|jetzt oder nie|solange der vorrat|countdown|l[aä]uft ab|zeitlich begrenzt|nur f[uü]r kurze zeit|beeil/i;
const DISCOUNT = /\d+\s?%\s?(rabatt|reduziert|sparen|g[uü]nstiger)|statt\s+\d|\buvp\b|streichpreis/i;
export const lintText = t => { const w = []; if (DARK.test(t)) w.push('Sahte aciliyet/stok baskısı kalıbı var (Almanya’da ihtar riski)'); if (DISCOUNT.test(t)) w.push('İndirim/eski fiyat iddiası var: yalnız doğrulanabilir (gerçek) eski fiyat varsa kullanın'); return w; };

export function initMarketing(ctx) {
  const { P, CATS, settings, saveSettings, effP, shopOk, getEvents, getOrders, actions, logChange, searchProducts, norm, ig, doc, saveDoc } = ctx;
  const SITE = (process.env.SITE_URL || 'https://web-production-a959d0b7.up.railway.app').replace(/\/$/, '');
  const db = Object.assign({ optins: {}, carts: {}, sim: [] }, (x => x && typeof x === 'object' && !Array.isArray(x) ? x : {})(doc('marketing', {})));
  const save = () => saveDoc('marketing', db);
  const MAX_OPTINS = 20000, CONSENT_TEXT = 'v1-2026-11';      // izin kaydı tavanı · onay metni sürümü
  const eur = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const uid = () => crypto.randomUUID().slice(0, 8);
  const ok = (obj = {}) => ({ code: 200, obj: { ok: true, ...obj } }), bad = (code, error) => ({ code, obj: { error } });

  /* ───────── 1. kampanya önerileri ───────── */
  const row = (p, note) => { const e = effP(p); return { id: p.id, title: e.title, vendor: p.vendor, price: e.price, was: e.was || 0, img: e.img, cat: p.cat, note }; };
  const usable = p => p && shopOk(p) && effP(p).price > 0 && effP(p).img;
  // kaynak (olay verisinden gelenler) önce; yetmezse katalogdan (marka başına ≤2) tamamlanır ve notla işaretlenir
  function fill(primary, pad, label) {
    const out = [], seen = new Set();
    for (const [id, n] of primary) { const p = P.get(id); if (usable(p) && !seen.has(id)) { seen.add(id); out.push(row(p, `${n} kez ${label}`)); if (out.length >= MAX_ITEMS) return out; } }
    const v = {};
    for (const p of pad()) { if (!usable(p) || seen.has(p.id) || (v[p.vendor] = (v[p.vendor] || 0) + 1) > 2) continue; seen.add(p.id); out.push(row(p, 'katalogdan (davranış verisi değil)')); if (out.length >= MAX_ITEMS) break; }
    return out;
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]);
  function suggestions(daysIn = 7) {
    const days = Math.min(90, Math.max(1, Number(daysIn) || 7)), from = Date.now() - days * DAY, ev = getEvents().filter(x => x.t >= from);
    const views = ev.filter(x => x.e === 'view'), vis = new Set(ev.map(x => x.vid));
    const pv = new Map(), pa = new Map(), cats = new Map(), brands = new Map(), sq = new Map();
    for (const x of ev) {
      if (x.e === 'view') { if (x.id) pv.set(x.id, (pv.get(x.id) || 0) + 1); if (x.c) cats.set(x.c, (cats.get(x.c) || 0) + 1); if (x.b) brands.set(x.b, (brands.get(x.b) || 0) + 1); }
      if (x.e === 'add' && x.id) pa.set(x.id, (pa.get(x.id) || 0) + 1);
      if (x.e === 'search' && x.q) { const k = norm(x.q), q = sq.get(k) || { q: x.q, count: 0, results: x.n ?? null }; q.count++; q.results = x.n ?? q.results; sq.set(k, q); }
    }
    const enough = ev.length >= MIN_EVENTS, items = [];
    const data = { days, events: ev.length, visitors: vis.size, views: views.length, minEvents: MIN_EVENTS, enough,
      note: ev.length === 0 ? 'Bu dönemde hiç ziyaretçi olayı yok. Olaylar yalnızca çerez onayı veren ziyaretçilerden toplanır; öneriler davranış verisi geldikçe oluşur.' : !enough ? `Yalnızca ${ev.length} olay var (en az ${MIN_EVENTS} gerekir). Az veriden kategori/marka önerisi üretilmedi.` : null };
    if (enough) {
      const tc = top(cats)[0]; if (tc && tc[1] >= 3) { const [k, n] = tc, c = CATS.find(x => x.k === k), pct = Math.round(n / views.length * 100), label = settings.categories[k]?.label || c?.label || k;
        const prim = top(pv).filter(([id]) => P.get(id)?.cat === k);
        items.push({ id: 'cat:' + k, type: 'category', title: `En çok bakılan kategori: ${label}`, shopText: `Beliebt im Outlet: ${label}`,
          why: `Son ${days} günde ${views.length} ürün görüntülemesinin ${n}’i (%${pct}) bu kategoride.`, products: fill(prim, () => [...P.values()].filter(p => p.cat === k), 'bakıldı') }); }
      const tb = top(brands)[0]; if (tb && tb[1] >= 3) { const [b, n] = tb, nb = norm(b), pct = Math.round(n / views.length * 100);
        items.push({ id: 'brand:' + nb, type: 'brand', title: `En çok bakılan marka: ${b}`, shopText: `Beliebt im Outlet: ${b}`,
          why: `Son ${days} günde ${views.length} ürün görüntülemesinin ${n}’i (%${pct}) bu markada.`, products: fill(top(pv).filter(([id]) => norm(P.get(id)?.vendor || '') === nb), () => [...P.values()].filter(p => norm(p.vendor) === nb), 'bakıldı') }); }
      const tad = top(pa); if (tad.length && tad.reduce((a, x) => a + x[1], 0) >= 3) items.push({ id: 'added:all', type: 'added', title: 'Sepete en çok eklenen ürünler', shopText: 'Oft im Warenkorb: unsere Empfehlungen',
        why: `Son ${days} günde ${tad.reduce((a, x) => a + x[1], 0)} sepete ekleme; en çok eklenen ${tad.length} üründen ilkleri.`, products: fill(tad.slice(0, MAX_ITEMS), () => [], 'sepete eklendi') });
      const zero = [...sq.values()].filter(q => q.results === 0).sort((a, b) => b.count - a.count).slice(0, 5);
      if (zero.length) { const seen = new Set(), prods = [];
        for (const q of zero) { const w = norm(q.q).split(/\s+/).filter(x => x.length >= 3).sort((a, b) => b.length - a.length)[0]; if (!w) continue;
          for (const p of searchProducts(w, undefined, 3)) if (usable(p) && !seen.has(p.id) && prods.length < MAX_ITEMS) { seen.add(p.id); prods.push(row(p, `“${q.q}” aramasına yakın (“${w}” kelimesi)`)); } }
        items.push({ id: 'zero:all', type: 'zero', title: 'Sonuç vermeyen aramalar', shopText: '',
          why: `Sonuç bulamayan aramalar: ${zero.map(q => `“${q.q}” (${q.count}×)`).join(', ')}. Ürünler yalnız tek kelimeyle yakın eşleşmelerdir; tam karşılığı katalogda olmayabilir.`, products: prods }); }
    }
    // indirim: katalogda eski fiyat yok; yalnız yöneticinin girdiği eski fiyatlar sayılır (uydurma indirim yok)
    const disc = Object.keys(settings.overrides).map(id => P.get(id)).filter(p => p && usable(p) && effP(p).was > effP(p).price).sort((a, b) => (1 - effP(b).price / effP(b).was) - (1 - effP(a).price / effP(a).was)).slice(0, 12);
    items.push({ id: 'disc:all', type: 'discount', title: 'En yüksek indirimli ürünler', shopText: 'Reduzierte Artikel im Outlet', empty: !disc.length,
      why: disc.length ? `${disc.length} üründe yönetici eski fiyat girmiş (en yüksek indirim %${Math.round((1 - effP(disc[0]).price / effP(disc[0]).was) * 100)}). Eski fiyatın gerçek olduğundan emin olun (son 30 günün en düşük fiyatı kuralı).` : 'Katalogda eski fiyat bilgisi yok; hiçbir üründe eski fiyat > fiyat değil. İndirim önerisi için Ürünler sekmesinden gerçek eski fiyat girilmelidir. Uydurma indirim üretilmedi.',
      products: disc.map(p => row(p, `%${Math.round((1 - effP(p).price / effP(p).was) * 100)} (${eur(effP(p).was)} → ${eur(effP(p).price)})`)) });
    return { data, items, active: settings.marketing.active || null };
  }
  function applyCampaign(id, announce, by, days = 7) {
    const it = suggestions(days).items.find(x => x.id === id);
    if (!it) return { err: 'Öneri bulunamadı (veri değişmiş olabilir). Listeyi yenileyin.' };
    const ids = it.products.map(p => p.id).slice(0, 12); if (!ids.length) return { err: 'Bu önerinin vitrine yansıtılacak ürünü yok.' };
    const c = actions.apply_campaign({ cid: it.id, title: it.title, ids, text: announce && it.shopText ? it.shopText : null }, by);
    return { change: c, count: ids.length };
  }

  /* ───────── 2. Instagram içerik hattı (instagram.mjs arayüzü) ───────── */
  async function igPreview(ids) {
    const out = []; for (const id of (Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string').slice(0, 8)) { const r = await ig.previewDraft(id); out.push(r.err ? r : { ...r, warnings: lintText(r.caption) }); }
    return out;
  }
  async function igQueue(items, kind, by) {
    const made = [], errors = [];
    for (const it of (Array.isArray(items) ? items : []).slice(0, 8)) {
      const id = String(it?.id || ''), cap = typeof it?.caption === 'string' ? it.caption.trim().slice(0, 2000) : '';
      const tags = Array.isArray(it?.hashtags) ? it.hashtags.map(String).filter(t => /^#[\p{L}\p{N}_]{2,30}$/u.test(t)).slice(0, 10) : [];
      if (!cap) { errors.push(`${id}: metin boş`); continue; }
      if (DARK.test(cap)) { errors.push(`${id}: metin reddedildi: sahte aciliyet/stok baskısı kalıbı (Almanya’da ihtar riski). Metni düzeltin.`); continue; }
      const r = await ig.createDraft(id, kind === 'story' ? 'story' : 'post', by, { caption: cap, hashtags: tags, ai: !!it.ai });
      r.post ? made.push({ id: r.post.id, title: r.post.snap.title, warnings: lintText(cap) }) : errors.push(`${id}: ${r.err}`);
    }
    return { made, errors };
  }
  async function igDraftsAuto(ids, kind, by) {            // asistan için: metni modül üretir; yine yalnız taslak, yayın yok
    const made = [], errors = [];
    for (const id of (Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string').slice(0, 8)) { const r = await ig.createDraft(id, kind === 'story' ? 'story' : 'post', by); r.post ? made.push({ id: r.post.id, title: r.post.snap.title, caption: r.post.caption, ai: r.post.ai }) : errors.push(`${id}: ${r.err}`); }
    return { made, errors };
  }

  /* ───────── 3. sepet ve yeniden sipariş hatırlatması ───────── */
  const consumableTokens = () => { const d = CATS.find(c => c.k === 'drucker'); return d ? d.subs.map((s, i) => [s.name, i]).filter(([n]) => /^(Toner|Tintenpatronen|Trommeln)$/.test(n)).map(([, i]) => 'drucker/' + i) : []; };
  const DEFAULT_RULES = () => [
    { id: 'r-cart', name: 'Sepeti bırakanlara hatırlatma', type: 'cart', days: 2, cats: [], enabled: true, subject: 'Dein Warenkorb bei Outlet Demo',
      body: 'Hallo {name},\n\ndu hast Artikel in deinem Warenkorb gelassen:\n{produkte}\n\nHier kannst du deine Auswahl in Ruhe ansehen und die Bestellung abschließen: {link}\n\nKeine Erinnerungen mehr? {abmelden}\n\nOutlet Demo' },
    { id: 'r-reorder', name: 'Toner / mürekkep yeniden sipariş', type: 'reorder', days: 60, cats: consumableTokens(), enabled: true, subject: 'Brauchst du Nachschub?',
      body: 'Hallo {name},\n\nam {datum} hast du bei uns bestellt:\n{produkte}\n\nFalls dein Vorrat zur Neige geht, findest du die Artikel hier wieder: {link}\n\nKeine Erinnerungen mehr? {abmelden}\n\nOutlet Demo' }];
  if (!settings.marketing.rules) { settings.marketing.rules = DEFAULT_RULES(); saveSettings(); }
  const catLabel = t => { const [c, s] = String(t).split('/'), cat = CATS.find(x => x.k === c); return cat ? (s !== undefined ? `${cat.label} › ${cat.subs[Number(s)]?.name ?? s}` : (settings.categories[c]?.label || cat.label)) : t; };
  function cleanRule(r) {
    if (!r || typeof r !== 'object') return { err: 'Geçersiz kural.' };
    const type = r.type === 'reorder' ? 'reorder' : r.type === 'cart' ? 'cart' : null; if (!type) return { err: 'Tür cart ya da reorder olmalı.' };
    const days = Math.floor(Number(r.days)); if (!(days >= 0 && days <= 365)) return { err: 'Gün sayısı 0–365 arası olmalı.' };
    const name = String(r.name || '').trim().slice(0, 80), subject = String(r.subject || '').trim().slice(0, 120), body = String(r.body || '').trim().slice(0, 3000);
    if (!name || !subject || !body) return { err: 'Ad, konu ve ileti metni boş olamaz.' };
    if (!body.includes('{abmelden}')) return { err: 'İleti metninde {abmelden} (abonelikten çıkış bağlantısı) bulunmalı.' };
    const lw = lintText(subject + '\n' + body); if (lw.length) return { err: 'İleti metni reddedildi: ' + lw.join('; ') };
    const cats = (Array.isArray(r.cats) ? r.cats : []).map(String).filter(t => { const [c, s] = t.split('/'); const cat = CATS.find(x => x.k === c); return cat && (s === undefined || (Number.isInteger(Number(s)) && cat.subs[Number(s)])); });
    return { rule: { id: /^[\w-]{1,24}$/.test(String(r.id || '')) ? String(r.id) : 'r-' + uid(), name, type, days, cats: [...new Set(cats)], enabled: r.enabled !== false, subject, body } };
  }
  const catOk = (rule, p) => !rule.cats.length || rule.cats.some(t => { const [c, s] = t.split('/'); return p.cat === c && (s === undefined || String(p.si) === s); });
  const mask = e => e.replace(/^(.).*(@.*)$/, '$1***$2');
  function recipients(rule, now = Date.now()) {
    const orders = getOrders().filter(o => o.status !== 'cancelled' && o.status !== 'unverified'), due = [], scheduled = [], done = [];
    const done0 = new Set(db.sim.map(x => x.key)), line = (id, qty) => { const p = P.get(id); return p ? { id, title: effP(p).title, qty, price: effP(p).price } : null; };
    const push = (email, name, ref, items, reason) => { const key = `${rule.id}|${email}|${ref}`, dueAt = ref + rule.days * DAY, r = { key, email, name, ref, dueAt, reason, items };
      (done0.has(key) ? done : dueAt <= now ? due : scheduled).push(r); };
    let noConsent = 0;
    if (rule.type === 'cart') {
      for (const [email, c] of Object.entries(db.carts)) {
        if (!db.optins[email]) { noConsent++; continue; }
        if (orders.some(o => o.customer.email === email && o.t > c.t)) continue;          // sonra sipariş vermiş: hatırlatma yok
        if (now - c.t > 30 * DAY) continue;                                               // 30 günden eski sepet unutulur
        const items = c.items.filter(i => { const p = P.get(i.id); return p && shopOk(p) && catOk(rule, p); }).map(i => line(i.id, i.qty)).filter(Boolean); if (!items.length) continue;
        push(email, c.name || '', c.t, items, 'Sepet bırakıldı, sonrasında sipariş yok');
      }
    } else {
      const last = new Map();
      for (const o of orders) { const its = o.items.filter(i => { const p = P.get(i.id); return p && catOk(rule, p); }); if (its.length && (!last.has(o.customer.email) || last.get(o.customer.email).o.t < o.t)) last.set(o.customer.email, { o, its }); }
      for (const [email, { o, its }] of last) { if (!db.optins[email]) { noConsent++; continue; } push(email, o.customer.name, o.t, its.map(i => ({ id: i.id, title: i.title, qty: i.qty, price: P.get(i.id) ? effP(P.get(i.id)).price : i.price })), `Sarf ürünü almış (${catLabel(rule.cats[0] || '')}…), son sipariş ${o.id}`); }
    }
    const byDue = (a, b) => a.dueAt - b.dueAt;
    return { due: due.sort(byDue), scheduled: scheduled.sort(byDue), done, noConsent };
  }
  function render(rule, r) {
    const first = P.get(r.items[0]?.id), link = first ? `${SITE}/?p=${encodeURIComponent(first.id)}&utm_source=email&utm_medium=reminder` : SITE;
    const fill = s => s.replace(/\{name\}/g, r.name || 'Kunde').replace(/\{produkte\}/g, r.items.map(i => `• ${i.qty} × ${i.title.slice(0, 80)} (${eur(i.price)})`).join('\n')).replace(/\{link\}/g, link)
      .replace(/\{datum\}/g, new Date(r.ref).toLocaleDateString('de-DE')).replace(/\{abmelden\}/g, `${SITE}/abmelden (Echtversand: persönlicher Abmelde-Link)`);
    return { subject: fill(rule.subject), body: fill(rule.body) };
  }
  const rowOut = (rule, r) => ({ key: r.key, email: r.email, emailMasked: mask(r.email), name: r.name, ref: r.ref, dueAt: r.dueAt, reason: r.reason, items: r.items, preview: render(rule, r) });
  function preview(ruleId) {
    return settings.marketing.rules.filter(r => !ruleId || r.id === ruleId).map(rule => { const x = recipients(rule);
      return { rule, enabled: rule.enabled, due: x.due.map(r => rowOut(rule, r)), scheduled: x.scheduled.map(r => rowOut(rule, r)), doneCount: x.done.length, noConsent: x.noConsent }; });
  }
  function simulate(ruleId, by) {
    const rule = settings.marketing.rules.find(r => r.id === ruleId); if (!rule) return { err: 'Kural bulunamadı.' };
    if (!rule.enabled) return { err: 'Kural kapalı; önce etkinleştirin.' };
    const due = recipients(rule).due.slice(0, 200); if (!due.length) return { count: 0 };
    for (const r of due) { const m = render(rule, r); db.sim.push({ id: uid(), t: Date.now(), key: r.key, rule: rule.id, ruleName: rule.name, to: r.email, subject: m.subject, body: m.body, simulated: true }); }
    if (db.sim.length > 1000) db.sim.splice(0, db.sim.length - 1000); save();
    logChange(by, `Hatırlatma simülasyonu “${rule.name}”: ${due.length} alıcı (gerçek e-posta gönderilmedi)`, null);
    return { count: due.length };
  }
  // vitrin: açık izin kaydı + sepet anlık görüntüsü (yalnız izin verenler)
  function optIn(email, name, source) { email = String(email || '').trim().toLowerCase(); if (!EMAIL_RE.test(email)) return false; if (!db.optins[email] && Object.keys(db.optins).length >= MAX_OPTINS) return false;
    // confirmed:false = çift onay (doğrulama e-postası) yapılmadı. Gerçek gönderim açılmadan önce yalnız confirmed:true kayıtlar alıcı olmalı.
    db.optins[email] ??= { t: Date.now(), name: String(name || '').slice(0, 80), source, confirmed: false, text: CONSENT_TEXT }; save(); return true; }
  // own: istek, bu e-postanın iznini veren tarayıcının imzalı çerezini taşıyor mu (sunucu doğrular). Yalnız o tarayıcı izni silebilir.
  function saveCart(body, own = false) {
    const email = String(body?.email || '').trim().toLowerCase(); if (!EMAIL_RE.test(email)) return { err: 'E-Mail ungültig.' };
    if (body.optin !== true) { if (!own) return { ok: true, removed: false }; delete db.optins[email]; delete db.carts[email]; save(); return { ok: true, removed: true }; }
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(i => ({ id: String(i?.id || ''), qty: Math.floor(Number(i?.qty)) })).filter(i => P.has(i.id) && i.qty >= 1 && i.qty <= 20);
    if (!items.length) return { err: 'Warenkorb leer.' };
    if (Object.keys(db.carts).length > 5000) return { err: 'voll' };
    optIn(email, body.name, 'cart'); db.carts[email] = { t: Date.now(), name: String(body.name || '').slice(0, 80), items }; save(); return { ok: true };
  }
  const orderPlaced = email => { email = String(email).toLowerCase(); if (db.carts[email]) { delete db.carts[email]; save(); } };

  // İşlem e-postası (ör. sipariş onayı): e-posta sağlayıcısı bağlı olmadığı için simüle posta kutusuna yazılır, gönderilmez.
  const simMail = ({ kind, name, to, subject, body }) => { db.sim.push({ id: uid(), t: Date.now(), key: kind, rule: kind.split(':')[0], ruleName: name, to, subject, body, simulated: true }); if (db.sim.length > 1000) db.sim.splice(0, db.sim.length - 1000); save(); };
  /* ───────── yönetici API'si ───────── */
  async function admin(p, method, body, url) {
    const sub = p.slice('/api/admin/marketing'.length) || '/';
    if (method === 'GET') {
      if (sub === '/suggestions') return ok(suggestions(url.searchParams.get('days')));
      if (sub === '/state') return ok({ active: settings.marketing.active || null, rules: settings.marketing.rules.map(r => ({ ...r, catLabels: r.cats.map(catLabel) })), consent: { optins: Object.keys(db.optins).length, carts: Object.keys(db.carts).length },
        cats: CATS.map(c => ({ k: c.k, label: c.label, subs: c.subs.map((s, i) => ({ i, name: s.name })) })), sim: db.sim.slice(-40).reverse(), site: SITE });
      if (sub === '/reminders') return ok({ rules: preview(url.searchParams.get('rule') || '') });
      return bad(404, 'yok');
    }
    if (sub === '/campaign-apply') { const r = applyCampaign(String(body.id || ''), !!body.announce, 'yönetici', Number(body.days) || 7); return r.err ? bad(400, r.err) : ok({ change: r.change.summary, change_id: r.change.id, count: r.count }); }
    if (sub === '/rule') { const v = cleanRule(body.rule); if (v.err) return bad(400, v.err); const c = actions.set_mk_rule({ rule: v.rule }, 'yönetici'); return ok({ change: c ? c.summary : 'Değişiklik yok', rule: v.rule }); }
    if (sub === '/rule-delete') { const c = actions.delete_mk_rule({ id: String(body.id || '') }, 'yönetici'); return c ? ok({ change: c.summary }) : bad(404, 'Kural bulunamadı.'); }
    if (sub === '/reminders-simulate') { const r = simulate(String(body.rule || ''), 'yönetici'); return r.err ? bad(400, r.err) : ok(r); }
    if (sub === '/ig-preview') return ok({ items: await igPreview(body.ids) });
    if (sub === '/ig-queue') return ok(await igQueue(body.items, body.kind, 'yönetici'));
    return bad(404, 'yok');
  }
  return { admin, suggestions, applyCampaign, preview, simulate, igDraftsAuto, igQueue, optIn, saveCart, orderPlaced, simMail, rules: () => settings.marketing.rules };
}

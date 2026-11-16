import { DAY } from './shared.mjs';

// Hatırlatma alıcıları, e-posta metni, önizleme ve simülasyon (gerçek gönderim yok).
export function makeReminders(c) {
  const { getOrders, db, P, effP, shopOk, catOk, catLabel, SITE, eur, settings, uid, save, logChange } = c;
  const mask = e => e.replace(/^(.).*(@.*)$/, '$1***$2');
  function recipients(rule, now = Date.now()) {
    const orders = getOrders().filter(o => o.status !== 'cancelled' && o.status !== 'unverified'),
      due = [],
      scheduled = [],
      done = [];
    const done0 = new Set(db.sim.map(x => x.key)),
      line = (id, qty) => {
        const p = P.get(id);
        return p ? { id, title: effP(p).title, qty, price: effP(p).price } : null;
      };
    const push = (email, name, ref, items, reason) => {
      const key = `${rule.id}|${email}|${ref}`,
        dueAt = ref + rule.days * DAY,
        r = { key, email, name, ref, dueAt, reason, items };
      (done0.has(key) ? done : dueAt <= now ? due : scheduled).push(r);
    };
    let noConsent = 0;
    if (rule.type === 'cart') {
      for (const [email, c] of Object.entries(db.carts)) {
        if (!db.optins[email]) {
          noConsent++;
          continue;
        }
        if (orders.some(o => o.customer.email === email && o.t > c.t)) continue; // sonra sipariş vermiş: hatırlatma yok
        if (now - c.t > 30 * DAY) continue; // 30 günden eski sepet unutulur
        const items = c.items
          .filter(i => {
            const p = P.get(i.id);
            return p && shopOk(p) && catOk(rule, p);
          })
          .map(i => line(i.id, i.qty))
          .filter(Boolean);
        if (!items.length) continue;
        push(email, c.name || '', c.t, items, 'Sepet bırakıldı, sonrasında sipariş yok');
      }
    } else {
      const last = new Map();
      for (const o of orders) {
        const its = o.items.filter(i => {
          const p = P.get(i.id);
          return p && catOk(rule, p);
        });
        if (its.length && (!last.has(o.customer.email) || last.get(o.customer.email).o.t < o.t))
          last.set(o.customer.email, { o, its });
      }
      for (const [email, { o, its }] of last) {
        if (!db.optins[email]) {
          noConsent++;
          continue;
        }
        push(
          email,
          o.customer.name,
          o.t,
          its.map(i => ({
            id: i.id,
            title: i.title,
            qty: i.qty,
            price: P.get(i.id) ? effP(P.get(i.id)).price : i.price,
          })),
          `Sarf ürünü almış (${catLabel(rule.cats[0] || '')}…), son sipariş ${o.id}`,
        );
      }
    }
    const byDue = (a, b) => a.dueAt - b.dueAt;
    return { due: due.sort(byDue), scheduled: scheduled.sort(byDue), done, noConsent };
  }
  function render(rule, r) {
    const first = P.get(r.items[0]?.id),
      link = first ? `${SITE}/?p=${encodeURIComponent(first.id)}&utm_source=email&utm_medium=reminder` : SITE;
    const fill = s =>
      s
        .replace(/\{name\}/g, r.name || 'Kunde')
        .replace(
          /\{produkte\}/g,
          r.items.map(i => `• ${i.qty} × ${i.title.slice(0, 80)} (${eur(i.price)})`).join('\n'),
        )
        .replace(/\{link\}/g, link)
        .replace(/\{datum\}/g, new Date(r.ref).toLocaleDateString('de-DE'))
        .replace(/\{abmelden\}/g, `${SITE}/abmelden (Echtversand: persönlicher Abmelde-Link)`);
    return { subject: fill(rule.subject).replace(/[\r\n\0]+/g, ' '), body: fill(rule.body) };
  }
  const rowOut = (rule, r) => ({
    key: r.key,
    email: r.email,
    emailMasked: mask(r.email),
    name: r.name,
    ref: r.ref,
    dueAt: r.dueAt,
    reason: r.reason,
    items: r.items,
    preview: render(rule, r),
  });
  function preview(ruleId) {
    return settings.marketing.rules
      .filter(r => !ruleId || r.id === ruleId)
      .map(rule => {
        const x = recipients(rule);
        return {
          rule,
          enabled: rule.enabled,
          due: x.due.map(r => rowOut(rule, r)),
          scheduled: x.scheduled.map(r => rowOut(rule, r)),
          doneCount: x.done.length,
          noConsent: x.noConsent,
        };
      });
  }
  function simulate(ruleId, by) {
    const rule = settings.marketing.rules.find(r => r.id === ruleId);
    if (!rule) return { err: 'Kural bulunamadı.' };
    if (!rule.enabled) return { err: 'Kural kapalı; önce etkinleştirin.' };
    const due = recipients(rule).due.slice(0, 200);
    if (!due.length) return { count: 0 };
    for (const r of due) {
      const m = render(rule, r);
      db.sim.push({
        id: uid(),
        t: Date.now(),
        key: r.key,
        rule: rule.id,
        ruleName: rule.name,
        to: r.email,
        subject: m.subject,
        body: m.body,
        simulated: true,
      });
    }
    if (db.sim.length > 1000) db.sim.splice(0, db.sim.length - 1000);
    save();
    logChange(
      by,
      `Hatırlatma simülasyonu “${rule.name}”: ${due.length} alıcı (gerçek e-posta gönderilmedi)`,
      null,
    );
    return { count: due.length };
  }
  return { mask, recipients, render, rowOut, preview, simulate };
}

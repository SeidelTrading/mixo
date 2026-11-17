// Yönetici uçları (/api/admin/marketing/*).
export function makeAdmin(c) {
  const {
    ok,
    suggestions,
    settings,
    catLabel,
    db,
    CATS,
    SITE,
    preview,
    bad,
    applyCampaign,
    cleanRule,
    actions,
    simulate,
    igPreview,
    igQueue,
  } = c;
  /* ───────── yönetici API'si ───────── */
  const GET = {
    '/suggestions': async (body, url, p, sub) => {
      return ok(suggestions(url.searchParams.get('days')));
    },
    '/state': async (body, url, p, sub) => {
      return ok({
        active: settings.marketing.active || null,
        rules: settings.marketing.rules.map(r => ({ ...r, catLabels: r.cats.map(catLabel) })),
        consent: {
          optins: Object.keys(db.optins).length,
          confirmed: Object.values(db.optins).filter(o => o?.confirmed).length,
          carts: Object.keys(db.carts).length,
          log: (db.consent || []).length,
        },
        cats: CATS.map(c => ({
          k: c.k,
          label: c.label,
          subs: c.subs.map((s, i) => ({ i, name: s.name })),
        })),
        sim: db.sim.slice(-40).reverse(),
        site: SITE,
      });
    },
    '/reminders': async (body, url, p, sub) => {
      return ok({ rules: preview(url.searchParams.get('rule') || '') });
    },
  };
  const POST = {
    '/campaign-apply': async (body, url, p, sub) => {
      const r = applyCampaign(String(body.id || ''), !!body.announce, 'yönetici', Number(body.days) || 7);
      return r.err
        ? bad(400, r.err)
        : ok({ change: r.change.summary, change_id: r.change.id, count: r.count });
    },
    '/rule': async (body, url, p, sub) => {
      const v = cleanRule(body.rule);
      if (v.err) return bad(400, v.err);
      const c = actions.set_mk_rule({ rule: v.rule }, 'yönetici');
      return ok({ change: c ? c.summary : 'Değişiklik yok', rule: v.rule });
    },
    '/rule-delete': async (body, url, p, sub) => {
      const c = actions.delete_mk_rule({ id: String(body.id || '') }, 'yönetici');
      return c ? ok({ change: c.summary }) : bad(404, 'Kural bulunamadı.');
    },
    '/reminders-simulate': async (body, url, p, sub) => {
      const r = simulate(String(body.rule || ''), 'yönetici');
      return r.err ? bad(400, r.err) : ok(r);
    },
    '/ig-preview': async (body, url, p, sub) => {
      return ok({ items: await igPreview(body.ids) });
    },
    '/ig-queue': async (body, url, p, sub) => {
      return ok(await igQueue(body.items, body.kind, 'yönetici'));
    },
  };
  // GET → okuma uçları; öteki yöntemler → yazma uçları. Eşleşmeyen yol 404.
  async function admin(p, method, body, url) {
    const sub = p.slice('/api/admin/marketing'.length) || '/';
    const handler = (method === 'GET' ? GET : POST)[sub];
    return handler ? handler(body, url, p, sub) : bad(404, 'yok');
  }
  return { admin };
}

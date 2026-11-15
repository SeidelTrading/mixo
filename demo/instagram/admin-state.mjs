// Okuma uçları: durum ve öneriler.
export function makeStateRoutes(c) {
  const {
    refreshFlags,
    db,
    view,
    inboxView,
    ok,
    LIVE,
    TOKEN,
    USER,
    VERIFY,
    APP_SECRET,
    SITE,
    flagsOf,
    suggest,
  } = c;
  return {
    GET: {
      '/state': async (body, url, p, sub) => {
        refreshFlags();
        const posts = db.posts.slice().reverse().slice(0, 120).map(view),
          inbox = db.inbox.slice().reverse().slice(0, 120).map(inboxView);
        return ok({
          config: {
            live: LIVE,
            hasToken: !!TOKEN,
            hasUserId: !!USER,
            webhook: !!(VERIFY && APP_SECRET),
            verifySet: !!VERIFY,
            secretSet: !!APP_SECRET,
            ai: !!process.env.ANTHROPIC_API_KEY,
            site: SITE,
            webhookUrl: SITE + '/api/instagram/webhook',
          },
          counts: {
            draft: db.posts.filter(x => x.status === 'draft').length,
            published: db.posts.filter(x => x.status === 'published').length,
            flagged: db.posts.filter(
              x => (x.status === 'draft' || x.status === 'published') && flagsOf(x).length,
            ).length,
            inboxOpen: db.inbox.filter(x => x.status === 'drafted').length,
          },
          posts,
          inbox,
        });
      },
      '/suggest': async (body, url, p, sub) => {
        return ok({ items: suggest(Math.min(12, Math.max(1, Number(url.searchParams.get('n')) || 6))) });
      },
    },
    POST: {},
  };
}

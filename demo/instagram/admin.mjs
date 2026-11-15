import { DAY } from './shared.mjs';

// Yönetici uçları (/api/admin/instagram/*).
export function makeAdmin(c) {
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
    bad,
    createDraft,
    save,
    logChange,
    snap,
    P,
    shopOk,
    makeCaption,
    snapOf,
    imageUrl,
    hashtags,
    busy,
    livePublish,
    uid,
    addInbox,
    makeReply,
    effP,
    eur,
    graph,
  } = c;
  const GET = {
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
  };
  const POST = {
    '/draft': async (body, url, p, sub) => {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(x => typeof x === 'string').slice(0, 12),
        kind = body.kind === 'story' ? 'story' : 'post',
        made = [],
        errs = [];
      for (const id of ids) {
        const r = await createDraft(id, kind, 'yönetici');
        r.post ? made.push(view(r.post)) : errs.push(`${id}: ${r.err}`);
      }
      return ok({ made, errors: errs });
    },
    '/post-edit': async (body, url, p, sub) => {
      const post = () => db.posts.find(x => x.id === String(body.id));

      const po = post();
      if (!po || po.status !== 'draft') return bad(400, 'Yalnız taslak düzenlenebilir.');
      const c = String(body.caption ?? '')
        .trim()
        .slice(0, 2000);
      if (!c) return bad(400, 'Metin boş olamaz.');
      po.caption = c;
      save();
      logChange('yönetici', `Instagram taslak metni düzenlendi: “${snap(po).slice(0, 40)}”`, null);
      return ok({ post: view(po) });
    },
    '/post-refresh': async (body, url, p, sub) => {
      const post = () => db.posts.find(x => x.id === String(body.id));

      const po = post(),
        p0 = po && P.get(po.pid);
      if (!po || po.status !== 'draft' || !p0) return bad(400, 'Yalnız taslak yenilenebilir.');
      if (!shopOk(p0)) return bad(400, 'Ürün sitede görünmüyor; taslağı reddedin.');
      const cap = await makeCaption(p0);
      Object.assign(po, {
        caption: cap.text,
        ai: cap.ai,
        snap: snapOf(p0),
        image: imageUrl(p0),
        hashtags: hashtags(p0),
        flagSig: '',
      });
      save();
      logChange(
        'yönetici',
        `Instagram taslağı güncel ürün verisiyle yenilendi: “${snap(po).slice(0, 40)}”`,
        null,
      );
      return ok({ post: view(po) });
    },
    '/post-reject': async (body, url, p, sub) => {
      const post = () => db.posts.find(x => x.id === String(body.id));

      const po = post();
      if (!po || po.status !== 'draft') return bad(400, 'Yalnız taslak reddedilebilir.');
      po.status = 'rejected';
      save();
      logChange('yönetici', `Instagram taslağı reddedildi: “${snap(po).slice(0, 40)}”`, null);
      return ok();
    },
    '/post-approve': async (body, url, p, sub) => {
      const post = () => db.posts.find(x => x.id === String(body.id));

      const po = post();
      if (!po || po.status !== 'draft') return bad(400, 'Yalnız onay bekleyen taslak yayınlanabilir.');
      const f = flagsOf(po);
      if (f.length)
        return bad(
          409,
          'Site verisi değişti: ' + f.map(x => x.t).join('; ') + '. Önce “Yenile” ya da reddet.',
        );
      if (busy.has(po.id)) return bad(409, 'Bu taslağın yayını sürüyor.');
      busy.add(po.id);
      try {
        if (LIVE) {
          po.mediaId = await livePublish(po);
          po.mode = 'live';
        } else {
          po.mediaId = 'sim-' + uid();
          po.mode = 'sim';
        }
        po.status = 'published';
        po.publishedAt = Date.now();
        save();
        logChange(
          'yönetici',
          `Instagram ${po.kind === 'story' ? 'hikâye' : 'gönderi'} ${po.mode === 'live' ? 'YAYINLANDI' : 'yayınlandı (simülasyon, Instagram’a gitmedi)'}: “${snap(po).slice(0, 40)}”`,
          null,
        );
        return ok({ post: view(po) });
      } catch (e) {
        po.lastError = String(e.message).slice(0, 200);
        save();
        logChange('yönetici', `Instagram yayın hatası: ${po.lastError}`, null);
        return bad(502, po.lastError);
      } finally {
        busy.delete(po.id);
      }
    },
    '/simulate': async (body, url, p, sub) => {
      // test: gelen mesaj/yorum taklidi
      const type = body.type === 'comment' ? 'comment' : 'dm',
        text = String(body.text || '').trim();
      if (!text) return bad(400, 'Metin boş.');
      const pub = body.postId && db.posts.find(x => x.id === String(body.postId));
      const it = await addInbox({
        type,
        from: 'sim-' + uid(),
        fromName: String(body.from || 'test_kullanici').slice(0, 40),
        text,
        mediaId: pub?.mediaId || null,
        commentId: type === 'comment' ? 'sim-c-' + uid() : null,
        sim: true,
      });
      return ok({ item: inboxView(it) });
    },
    '/reply-regen': async (body, url, p, sub) => {
      const item = () => db.inbox.find(x => x.id === String(body.id));

      const it = item();
      if (!it || it.status === 'sent') return bad(400, 'Yanıt yeniden üretilemez.');
      const r = await makeReply(it);
      it.draft = r.text;
      it.ai = r.ai;
      it.status = 'drafted';
      save();
      return ok({ item: inboxView(it) });
    },
    '/reply-edit': async (body, url, p, sub) => {
      const item = () => db.inbox.find(x => x.id === String(body.id));

      const it = item();
      if (!it || it.status === 'sent') return bad(400, 'Düzenlenemez.');
      const t = String(body.text ?? '')
        .trim()
        .slice(0, 1000);
      if (!t) return bad(400, 'Metin boş.');
      it.draft = t;
      save();
      return ok({ item: inboxView(it) });
    },
    '/reply-ignore': async (body, url, p, sub) => {
      const item = () => db.inbox.find(x => x.id === String(body.id));

      const it = item();
      if (!it || it.status === 'sent') return bad(400, 'İşlem yapılamaz.');
      it.status = 'ignored';
      save();
      logChange('yönetici', `Instagram ${it.type === 'dm' ? 'DM' : 'yorum'} yanıtsız bırakıldı`, null);
      return ok();
    },
    '/reply-send': async (body, url, p, sub) => {
      const item = () => db.inbox.find(x => x.id === String(body.id));

      const it = item();
      if (!it || it.status === 'sent' || !it.draft) return bad(400, 'Gönderilecek taslak yok.');
      if (it.type === 'dm' && Date.now() - it.t > DAY)
        return bad(
          409,
          '24 saatlik mesaj penceresi kapandı; Instagram bu DM’e yanıt göndermeye izin vermez.',
        );
      // yanıt içindeki ürün verisi eskidiyse engelle: taslak üretildikten sonra fiyat/stok değişmiş olabilir
      const p0 = it.productId && P.get(it.productId);
      if (p0) {
        const e = effP(p0);
        const prices = [...it.draft.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}) €/g)].map(m =>
          Number(m[1].replace(/\./g, '').replace(',', '.')),
        );
        if (prices.length && !prices.includes(Math.round(e.price * 100) / 100))
          return bad(
            409,
            'Taslaktaki fiyat güncel site fiyatıyla (' + eur(e.price) + ') uyuşmuyor. “Yeniden üret” deyin.',
          );
        if (!shopOk(p0) && /verfügbar|kostet/.test(it.draft) && !/nicht verfügbar/.test(it.draft))
          return bad(409, 'Ürün artık sitede görünmüyor; yanıtı yeniden üretin.');
      }
      // Müşteri metninden türeyen taslağa yabancı bağlantı sokulmasın: yalnız mağaza adresine izin verilir.
      const siteHost = new URL(SITE).host;
      for (const u of it.draft.match(/https?:\/\/[^\s)>\]]+/gi) || []) {
        let h = '';
        try {
          h = new URL(u).host;
        } catch {}
        if (h !== siteHost)
          return bad(409, 'Taslakta mağaza dışı bir bağlantı var; yanıtı düzenleyin ya da yeniden üretin.');
      }
      if (busy.has(it.id)) return bad(409, 'Bu yanıtın gönderimi sürüyor.');
      busy.add(it.id);
      try {
        if (LIVE && !it.sim) {
          if (it.type === 'dm')
            await graph('POST', `/${USER}/messages`, {
              recipient: { id: it.from },
              message: { text: it.draft },
            });
          else await graph('POST', `/${it.commentId}/replies`, { message: it.draft });
          it.mode = 'live';
        } else it.mode = 'sim';
        it.status = 'sent';
        it.sentAt = Date.now();
        save();
        logChange(
          'yönetici',
          `Instagram ${it.type === 'dm' ? 'DM' : 'yorum'} yanıtı ${it.mode === 'live' ? 'GÖNDERİLDİ' : 'gönderildi (simülasyon, Instagram’a gitmedi)'}`,
          null,
        );
        return ok({ item: inboxView(it) });
      } catch (e) {
        logChange('yönetici', `Instagram yanıt hatası: ${String(e.message).slice(0, 150)}`, null);
        return bad(502, String(e.message).slice(0, 200));
      } finally {
        busy.delete(it.id);
      }
    },
  };
  // GET → okuma uçları; öteki yöntemler → yazma uçları. Eşleşmeyen yol 404.
  async function admin(p, method, body, url) {
    const sub = p.slice('/api/admin/instagram'.length) || '/';
    const handler = (method === 'GET' ? GET : POST)[sub];
    return handler ? handler(body, url, p, sub) : bad(404, 'yok');
  }
  const draftView = po => view(po);
  return { admin, draftView };
}

// Gönderi taslağı uçları: oluştur, düzenle, yenile, reddet, onayla.
export function makePostRoutes(c) {
  const {
    db,
    view,
    ok,
    LIVE,
    flagsOf,
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
  } = c;
  return {
    GET: {},
    POST: {
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
    },
  };
}

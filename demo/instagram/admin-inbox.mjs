import { DAY } from './shared.mjs';

// Gelen kutusu uçları: simülasyon, yanıt üret/düzenle/yoksay/gönder.
export function makeInboxRoutes(c) {
  const {
    db,
    inboxView,
    ok,
    LIVE,
    USER,
    SITE,
    bad,
    save,
    logChange,
    P,
    shopOk,
    busy,
    uid,
    addInbox,
    makeReply,
    effP,
    eur,
    graph,
  } = c;
  return {
    GET: {},
    POST: {
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
              'Taslaktaki fiyat güncel site fiyatıyla (' +
                eur(e.price) +
                ') uyuşmuyor. “Yeniden üret” deyin.',
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
    },
  };
}

import { readBody, send } from '../lib/http.mjs';
import { publicConfig } from '../services/visibility.mjs';
import { shopHome, shopOk, shopRow } from '../services/storefront.mjs';
import { P } from '../services/catalog.mjs';
import { ig, mk } from '../services/channels.mjs';
import { cookie, limited, sigOk, sign } from '../lib/auth.mjs';
import { confirmOrder, createOrder, orders } from '../services/orders.mjs';
import { ingest, visitorOf } from '../services/analytics.mjs';

// Bağlantıya tıklayan kişiye gösterilen basit sonuç sayfası (abmelden, veri silme).
const esc = s => String(s).replace(/[<&>]/g, ch => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[ch]);
function htmlResult(res, st, M) {
  res.writeHead(st === 'ok' || st === 'already' ? 200 : st === 'limit' ? 429 : 400, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
  });
  res.end(
    `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(M[0])}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.4rem">${esc(M[0])}</h1><p>${esc(M[1])}</p><p><a href="/">Zurück zum Shop</a></p></body></html>`,
  );
}

// Veri sahibi hakları ve izin geri çekme uçları (imzalı bağlantı deseni).
// İşlendiyse true döner; publicRoutes zinciri o zaman durur.
async function privacyRoutes({ req, res, url, p, ip }) {
  // Abmelden: imzalı, kişisel, tek tıkla izin geri çekme (e-posta altbilgisindeki bağlantı).
  // Çerez gerekmez: imza adresin kendisine giden bağlantıdan gelir, başkası başkasının iznini çekemez.
  if (p === '/api/consent/unsubscribe' && req.method === 'GET') {
    const st = limited('un' + ip, 30, 60e3)
      ? 'limit'
      : mk.unsubscribe(url.searchParams.get('e') || '', url.searchParams.get('token') || '', ip);
    return htmlResult(
      res,
      st,
      {
        ok: ['Abgemeldet', 'Sie erhalten keine Werbe-E-Mails mehr. Ihre Einwilligung wurde widerrufen.'],
        already: ['Abgemeldet', 'Für diese Adresse liegt keine Einwilligung (mehr) vor.'],
        bad: ['Link ungültig', 'Dieser Abmelde-Link ist ungültig.'],
        limit: ['Zu viele Versuche', 'Bitte versuchen Sie es in einer Minute erneut.'],
      }[st],
    );
  }
  // Veri sahibi talebi (Art. 15 / 17): imzalı erişim ve silme bağlantıları YALNIZ adresin kendisine
  // gönderilir. Yanıt, adresin kayıtlı olup olmadığını sızdırmamak için her durumda aynıdır.
  if (p === '/api/privacy/request' && req.method === 'POST') {
    if (limited('pr' + ip, 5, 600e3) || limited('pr*', 100, 600e3)) {
      send(res, 429, { error: 'Zu viele Versuche.' });
      return true;
    }
    const b = await readBody(req, 5e3);
    mk.requestSubjectLinks(String(b?.email || ''));
    send(res, 200, {
      ok: true,
      message:
        'Wenn diese Adresse bei uns bekannt ist, haben wir Ihnen einen Link zur Auskunft und zur Löschung geschickt.',
    });
    return true;
  }
  // Erişim hakkı: bu adrese dair sakladığımız veri (imza doğrulanmazsa veri verilmez).
  if (p === '/api/privacy/export' && req.method === 'GET') {
    const e = url.searchParams.get('e') || '';
    const ok =
      !limited('px' + ip, 20, 600e3) &&
      mk.subjectOk('export', e, url.searchParams.get('ts') || '', url.searchParams.get('token') || '');
    if (ok) send(res, 200, mk.exportSubject(e), { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    else send(res, 400, { error: 'Link ungültig oder abgelaufen.' });
    return true;
  }
  // Silme hakkı: izin kaydı, sepet ve kişisel alanlar silinir; rıza günlüğünde yalnız silme kanıtı kalır.
  if (p === '/api/privacy/erase' && req.method === 'GET') {
    const e = url.searchParams.get('e') || '';
    const st = limited('pe' + ip, 20, 600e3)
      ? 'limit'
      : mk.subjectOk('erase', e, url.searchParams.get('ts') || '', url.searchParams.get('token') || '') &&
          mk.eraseSubject(e, ip)
        ? 'ok'
        : 'bad';
    return htmlResult(
      res,
      st,
      {
        ok: [
          'Daten gelöscht',
          'Ihre Einwilligung, Ihr gespeicherter Warenkorb und Ihre persönlichen Daten wurden gelöscht. Aus Nachweisgründen bleibt nur die Tatsache der Löschung gespeichert — ohne Ihre E-Mail-Adresse.',
        ],
        bad: ['Link ungültig', 'Dieser Link ist ungültig oder abgelaufen.'],
        limit: ['Zu viele Versuche', 'Bitte versuchen Sie es später erneut.'],
      }[st],
    );
  }
  return false;
}

// Herkese açık uçlar: yapılandırma, vitrin, sepet izni, sipariş, olay toplama, sipariş doğrulama.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function publicRoutes(c) {
  const { req, res, url, p, ip, secure } = c;
  if (p === '/api/config' && req.method === 'GET') return send(res, 200, publicConfig());
  if (p === '/api/shop/home' && req.method === 'GET') return send(res, 200, shopHome());
  if (p === '/api/shop/product' && req.method === 'GET') {
    const x = P.get(url.searchParams.get('id') || '');
    return x && shopOk(x) ? send(res, 200, shopRow(x)) : send(res, 404, { error: 'yok' });
  }
  if (p === '/api/instagram/webhook') return await ig.webhook(req, res, url, ip);
  // Herkese açık yazma uçları: adres başına sınırın yanında adresten bağımsız genel tavan da var (adres değiştirerek aşılamaz).
  if (p === '/api/cart-save' && req.method === 'POST') {
    if (limited('cs' + ip, 20, 60e3) || limited('cs*', 200, 600e3))
      return send(res, 429, { error: 'Zu viele Versuche.' });
    // İzin sahipliği: izni veren tarayıcıya imzalı çerez (mxc) verilir; bir izni yalnız o çerezi taşıyan silebilir (başkasının izni silinemez).
    const b = await readBody(req, 20e3),
      em = String(b.email || '')
        .trim()
        .toLowerCase(),
      own = sigOk(cookie(req, 'mxc') || '', 'c:' + em);
    const r = mk.saveCart(b, own, ip);
    if (r.err) return send(res, 400, { error: r.err });
    return send(
      res,
      200,
      { ok: true },
      r.removed || !r.created || b.optin !== true
        ? {}
        : {
            'set-cookie': `mxc=${sign('c:' + em)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
          },
    );
  }
  if (p === '/api/orders' && req.method === 'POST') {
    if (limited('ord' + ip, 8, 60e3) || limited('ord*', 60, 600e3))
      return send(res, 429, { error: 'Zu viele Versuche. Bitte kurz warten.' });
    const r = createOrder(await readBody(req, 60e3));
    if (r.err) return send(res, 400, { error: r.err });
    return send(
      res,
      200,
      {
        ok: true,
        order: {
          id: r.order.id,
          total: r.order.total,
          shipping: r.order.shipping,
          subtotal: r.order.subtotal,
          email: r.order.customer.email,
          verify: r.order.status === 'unverified',
        },
      },
      r.order.marketing && r.order.status !== 'unverified'
        ? {
            'set-cookie': `mxc=${sign('c:' + r.order.customer.email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
          }
        : {},
    );
  }
  if (p === '/api/events' && req.method === 'POST') {
    if (limited('ev' + ip, 120, 60e3) || limited('ev*', 3000, 60e3))
      return send(res, 429, { error: 'çok fazla istek' });
    const b = await readBody(req, 60e3);
    // Çerez onayı sunucuda uygulanır: onay beyanı yoksa NE izleme çerezi (mxv) yazılır NE de olay saklanır.
    // İstek yine 200 ile yanıtlanır (vitrin kırılmasın), ama hiçbir veri tutulmaz (bkz. analytics.ingest).
    const v = b?.consent === true ? visitorOf(req, ip) : null;
    return send(res, 200, { ok: ingest(b, req, v?.vid) }, v?.setCookie ? { 'set-cookie': v.setCookie } : {});
  }
  if (await privacyRoutes(c)) return;
  // Çift onay (double opt-in): doğrulama bağlantısı. Bu tıklanmadan adres hiçbir gönderime alınmaz.
  if (p === '/api/consent/confirm' && req.method === 'GET') {
    const st = limited('cc' + ip, 30, 60e3)
      ? 'limit'
      : mk.confirmOptIn(url.searchParams.get('e') || '', url.searchParams.get('token') || '', ip);
    const M = {
      ok: ['E-Mail bestätigt', 'Danke! Ab jetzt dürfen wir Ihnen Erinnerungen senden.'],
      already: ['Bereits bestätigt', 'Diese E-Mail-Adresse wurde bereits bestätigt.'],
      expired: [
        'Link abgelaufen',
        'Dieser Bestätigungslink ist abgelaufen. Bitte melden Sie sich erneut an.',
      ],
      bad: ['Link ungültig', 'Dieser Bestätigungslink ist ungültig.'],
      limit: ['Zu viele Versuche', 'Bitte versuchen Sie es in einer Minute erneut.'],
    }[st];
    res.writeHead(st === 'ok' || st === 'already' ? 200 : st === 'limit' ? 429 : 400, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    });
    return res.end(
      `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${M[0]}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.4rem">${M[0]}</h1><p>${M[1]}</p><p><a href="/">Zurück zum Shop</a></p></body></html>`,
    );
  }
  if (p === '/api/orders/confirm' && req.method === 'GET') {
    const st = limited('oc' + ip, 30, 60e3)
      ? 'limit'
      : confirmOrder(url.searchParams.get('id') || '', url.searchParams.get('token') || '');
    const M = {
      ok: ['Bestellung bestätigt', 'Vielen Dank! Ihre Bestellung ist bestätigt und wird jetzt bearbeitet.'],
      already: ['Bereits bestätigt', 'Diese Bestellung wurde bereits bestätigt.'],
      expired: ['Link abgelaufen', 'Dieser Bestätigungslink ist abgelaufen. Bitte bestellen Sie erneut.'],
      bad: ['Link ungültig', 'Dieser Bestätigungslink ist ungültig.'],
      limit: ['Zu viele Versuche', 'Bitte versuchen Sie es in einer Minute erneut.'],
    }[st];
    // İzin sahipliği çerezi yalnız e-posta doğrulandıktan sonra verilir (başkasının adresiyle izin kaydı açılıp çerez alınamasın).
    const oc =
      st === 'ok' || st === 'already' ? orders.find(o => o.id === (url.searchParams.get('id') || '')) : null;
    res.writeHead(st === 'ok' || st === 'already' ? 200 : st === 'limit' ? 429 : 400, {
      ...(oc?.marketing && oc.customer?.email
        ? {
            'set-cookie': `mxc=${sign('c:' + oc.customer.email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
          }
        : {}),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    });
    return res.end(
      `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${M[0]}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.4rem">${M[0]}</h1><p>${M[1]}</p><p><a href="/">Zurück zum Shop</a></p></body></html>`,
    );
  }
}

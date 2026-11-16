import { readBody, send } from '../lib/http.mjs';
import { publicConfig } from '../services/visibility.mjs';
import { shopHome, shopOk, shopRow } from '../services/storefront.mjs';
import { P } from '../services/catalog.mjs';
import { ig, mk } from '../services/channels.mjs';
import { cookie, limited, sigOk, sign } from '../lib/auth.mjs';
import { confirmOrder, createOrder, orders } from '../services/orders.mjs';
import { ingest, visitorOf } from '../services/analytics.mjs';

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
    const r = mk.saveCart(b, own);
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
    const b = await readBody(req, 60e3),
      v = visitorOf(req, ip);
    return send(res, 200, { ok: ingest(b, req, v?.vid) }, v?.setCookie ? { 'set-cookie': v.setCookie } : {});
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

import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { EMAIL_RE } from '../lib/validate.mjs';
import { sha } from '../lib/auth.mjs';
import { P } from './catalog.mjs';
import { settings, hooks } from './settings.mjs';
import { effP } from './overrides.mjs';
import { hiddenIds, isHidden, openProblems } from './visibility.mjs';
import { homeCache } from '../lib/cache.mjs';
import { freeShip, SHIP_FEE, money } from './pricing.mjs';

export const MAX_ORDERS = 5000,
  MAX_UNVERIFIED = 1000;
// E-posta karşılaştırma anahtarı: "+etiket" atılır, Gmail'de noktalar yok sayılır (a+1@x.de ile a+2@x.de aynı kişi sayılsın).
const emailKey = e => {
  const [l = '', d = ''] = String(e).toLowerCase().split('@'),
    base = l.split('+')[0];
  return (d === 'gmail.com' || d === 'googlemail.com' ? base.replace(/\./g, '') : base) + '@' + d;
};
// Sipariş doğrulaması: yeni sipariş "Doğrulanmadı" olarak açılır; müşteri e-postadaki bağlantıyla (ya da yönetici panelden) doğrulayana kadar
// ciroya, çok satanlara ve analize girmez. 48 saatte doğrulanmayan sipariş iptal edilir. ORDER_VERIFY=off eski davranışa döner.
export const ORDER_VERIFY = !/^(off|0|false)$/i.test(process.env.ORDER_VERIFY || ''),
  VERIFY_HOURS = 48,
  VERIFY_MAX_OPEN = 3;
export const orders = store.allOrders();
export const saveOrder = o => store.putOrder(o);
// Durum geçişi kuralı: hiçbir sipariş "Doğrulanmadı"ya geri alınmaz; süresi dolup sistemce iptal edilen sipariş yeniden açılamaz
// (yeni sipariş gerekir). Doğrulanmamış siparişi elle doğrulamak (unverified→new) yalnız panelden mümkündür; asistan bunu yapamaz.
export const canMoveOrder = (o, status, viaAssistant = false) => {
  if (!o || status === 'unverified' || o.status === status) return false;
  const h = o.history?.[o.history.length - 1];
  if (o.status === 'cancelled' && String(h?.by || '').startsWith('sistem')) return false;
  if (viaAssistant && o.status === 'unverified' && status !== 'cancelled') return false;
  return true;
};
export const ORDER_STATUS = {
  unverified: 'Doğrulanmadı',
  new: 'Yeni',
  processing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  done: 'Teslim edildi',
  cancelled: 'İptal',
};
/* ───────── siparişler, müşteriler, gösterge paneli, vitrin ───────── */
export function createOrder(body) {
  const items = [];
  for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 50)) {
    const id = typeof it?.id === 'string' ? it.id : '',
      qty = Math.floor(Number(it?.qty)),
      p = P.get(id);
    if (!p || isHidden(id) || settings.categories[p.cat]?.hidden)
      return { err: 'Ein Artikel ist nicht mehr verfügbar. Bitte Warenkorb prüfen.' };
    const e = effP(p);
    if (e.na) return { err: `„${e.title.slice(0, 40)}“ ist zurzeit nicht verfügbar.` };
    if (!(qty >= 1 && qty <= 20)) return { err: 'Ungültige Menge.' };
    items.push({ id, title: e.title, vendor: p.vendor, price: e.price, qty, img: e.img });
  }
  if (!items.length) return { err: 'Der Warenkorb ist leer.' };
  // Tavan yalnız gerçek (doğrulanmış) siparişleri sayar; doğrulanmamışların ayrı tavanı aşağıdadır (sahte siparişle mağaza kapatılamasın).
  if (orders.filter(x => x.status !== 'cancelled' && x.status !== 'unverified').length >= MAX_ORDERS)
    return { err: 'Die Demo nimmt zurzeit keine weiteren Bestellungen an.' };
  const c = body.customer || {},
    str = (v, n) =>
      String(v ?? '')
        .trim()
        .slice(0, n),
    cu = {
      name: str(c.name, 80),
      email: str(c.email, 120).toLowerCase(),
      street: str(c.street, 120),
      zip: str(c.zip, 12),
      city: str(c.city, 60),
    };
  if (
    cu.name.length < 2 ||
    !EMAIL_RE.test(cu.email) ||
    cu.street.length < 3 ||
    cu.zip.length < 3 ||
    cu.city.length < 2
  )
    return { err: 'Bitte alle Felder korrekt ausfüllen.' };
  if (
    ORDER_VERIFY &&
    orders.filter(x => x.status === 'unverified' && emailKey(x.customer.email) === emailKey(cu.email))
      .length >= VERIFY_MAX_OPEN
  )
    return {
      err: 'Für diese E-Mail-Adresse warten bereits Bestellungen auf Bestätigung. Bitte bestätigen Sie diese zuerst über den Link in der E-Mail.',
    };
  // Doğrulanmamış siparişlerin genel tavanı: dolunca en eskisi sistemce iptal edilir (iptal kaydı 7 gün sonra silinir).
  if (ORDER_VERIFY) {
    const open = orders.filter(x => x.status === 'unverified');
    if (open.length >= MAX_UNVERIFIED) {
      const old = open.reduce((a, b) => (b.t < a.t ? b : a));
      old.status = 'cancelled';
      (old.history ||= []).push({ t: Date.now(), status: 'cancelled', by: 'sistem (doğrulanmadı)' });
      saveOrder(old);
    }
  }
  const subtotal = money(items.reduce((a, i) => a + i.price * i.qty, 0)),
    shipping = subtotal >= freeShip() ? 0 : SHIP_FEE;
  let oid;
  do {
    oid = 'MX-' + String(Date.now()).slice(-6) + crypto.randomBytes(1).toString('hex').toUpperCase();
  } while (orders.some(x => x.id === oid)); // kimlik çakışırsa yeniden üret (eski sipariş ezilmesin)
  const st0 = ORDER_VERIFY ? 'unverified' : 'new',
    o = {
      id: oid,
      t: Date.now(),
      status: st0,
      items,
      subtotal,
      shipping,
      total: money(subtotal + shipping),
      customer: cu,
      demo: true,
      history: [{ t: Date.now(), status: st0, by: 'müşteri' }],
    };
  o.marketing = body.marketing === true;
  let token = null;
  if (ORDER_VERIFY) {
    token = crypto.randomBytes(24).toString('base64url');
    o.verify = { h: sha('ov:' + token).toString('hex'), exp: Date.now() + VERIFY_HOURS * 3600e3 };
  }
  orders.push(o);
  saveOrder(o);
  if (token) {
    store.jobs.enqueue('order_confirm_mail', { id: o.id, token });
    setImmediate(() => hooks.runJobs?.());
  }
  hooks.orderPlaced?.(cu.email);
  // Pazarlama izni doğrulama açıkken yalnız e-posta onayından sonra (confirmOrder) kaydedilir; sahte siparişle başkası adına izin açılamasın.
  if (o.marketing && !ORDER_VERIFY) hooks.optIn?.(cu.email, cu.name, 'checkout');
  return { order: o };
}
export const orderRow = o => ({
  id: o.id,
  t: o.t,
  status: o.status,
  statusLabel: ORDER_STATUS[o.status],
  total: o.total,
  count: o.items.reduce((a, i) => a + i.qty, 0),
  customer: o.customer.name,
  email: o.customer.email,
});
export const liveOrders = () => orders.filter(o => o.status !== 'cancelled' && o.status !== 'unverified');
// E-postadaki bağlantıyla doğrulama. Belirteç yalnız özet olarak saklanır ve sabit sürede karşılaştırılır. Dönüş: 'ok' | 'already' | 'expired' | 'bad'
export function confirmOrder(id, token) {
  const o = orders.find(x => x.id === id);
  if (!o || !o.verify?.h || typeof token !== 'string' || !token) return 'bad';
  const a = Buffer.from(o.verify.h, 'hex'),
    b = sha('ov:' + token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'bad';
  if (o.status !== 'unverified') return o.status === 'cancelled' ? 'expired' : 'already';
  if (!(o.verify.exp > Date.now())) return 'expired';
  o.status = 'new';
  (o.history ||= []).push({ t: Date.now(), status: 'new', by: 'müşteri (e-posta onayı)' });
  saveOrder(o);
  if (o.marketing) hooks.optIn?.(o.customer.email, o.customer.name, 'checkout');
  homeCache.t = 0;
  return 'ok';
}
export function expireUnverified() {
  const now = Date.now();
  let n = 0;
  for (const o of orders)
    if (o.status === 'unverified' && !((o.verify?.exp ?? o.t + VERIFY_HOURS * 3600e3) > now)) {
      o.status = 'cancelled';
      (o.history ||= []).push({ t: now, status: 'cancelled', by: 'sistem (doğrulanmadı)' });
      saveOrder(o);
      n++;
    }
  // Hiç doğrulanmadan sistemce iptal edilen siparişler 7 gün sonra silinir (sahte siparişler kaydı ve belleği doldurmasın).
  let d = 0;
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i],
      h = o.history?.[o.history.length - 1];
    if (o.status === 'cancelled' && h?.by === 'sistem (doğrulanmadı)' && now - h.t > 7 * 864e5) {
      store.delOrder(o.id);
      orders.splice(i, 1);
      d++;
    }
  }
  if (n || d) console.log(`doğrulanmayan ${n} sipariş iptal edildi, ${d} eski iptal kaydı silindi`);
  return n;
}
export function customers() {
  const m = new Map();
  for (const o of orders) {
    const k = o.customer.email,
      c = m.get(k) || {
        email: k,
        name: o.customer.name,
        city: o.customer.city,
        orders: 0,
        spent: 0,
        first: o.t,
        last: o.t,
      };
    c.orders++;
    if (o.status !== 'cancelled' && o.status !== 'unverified') c.spent = money(c.spent + o.total);
    c.last = Math.max(c.last, o.t);
    c.first = Math.min(c.first, o.t);
    c.name = o.customer.name;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.spent - a.spent);
}
export function dashboard() {
  const lo = liveOrders(),
    revenue = money(lo.reduce((a, o) => a + o.total, 0)),
    day = t => new Date(t).toISOString().slice(0, 10),
    byDay = {},
    sold = new Map(),
    st = {};
  for (const o of orders) st[o.status] = (st[o.status] || 0) + 1;
  for (const o of lo) {
    const d = (byDay[day(o.t)] ??= { orders: 0, revenue: 0 });
    d.orders++;
    d.revenue = money(d.revenue + o.total);
    for (const i of o.items) {
      const x = sold.get(i.id) || { id: i.id, title: i.title, qty: 0, revenue: 0 };
      x.qty += i.qty;
      x.revenue = money(x.revenue + i.price * i.qty);
      sold.set(i.id, x);
    }
  }
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = day(Date.now() - i * 864e5);
    daily.push({ day: d, ...(byDay[d] || { orders: 0, revenue: 0 }) });
  }
  const cs = customers(),
    cutoff = Date.now() - 7 * 864e5;
  return {
    revenue,
    orders: orders.length,
    liveOrders: lo.length,
    aov: lo.length ? money(revenue / lo.length) : 0,
    customers: cs.length,
    repeatCustomers: cs.filter(c => c.orders > 1).length,
    week: {
      orders: lo.filter(o => o.t >= cutoff).length,
      revenue: money(lo.filter(o => o.t >= cutoff).reduce((a, o) => a + o.total, 0)),
    },
    statuses: Object.entries(ORDER_STATUS).map(([k, label]) => ({ key: k, label, count: st[k] || 0 })),
    daily,
    topProducts: [...sold.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
    recent: orders.slice(-6).reverse().map(orderRow),
    catalog: {
      products: P.size,
      hidden: hiddenIds().length,
      pendingApproval: openProblems().filter(p => !settings.approved[p.id]).length,
      edited: Object.keys(settings.overrides).length,
      unavailable: [...P.values()].filter(p => effP(p).na).length,
    },
  };
}

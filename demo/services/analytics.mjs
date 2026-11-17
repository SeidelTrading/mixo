import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { cookie, limited, sigOk, sign } from '../lib/auth.mjs';
import { CATS, P, TUR, norm } from './catalog.mjs';
import { settings } from './settings.mjs';
import { openProblems } from './visibility.mjs';

/* ───────── olaylar ve analiz ───────── */
const EVENT_TYPES = new Set([
  'session',
  'view',
  'dwell',
  'add',
  'remove',
  'wish',
  'unwish',
  'search',
  'cat',
  'filter',
  'sort',
  'more',
  'cart_open',
  'checkout',
  'exit_intent',
  'sugg',
  'login',
]);
export let events = store.allEvents();
// Saklama tavanı: analiz en çok 90 güne bakar; daha eskisi ve EVENT_MAX üstü silinir (dosya ve bellek sınırsız büyümez).
const EVENT_DAYS = 90;
export const EVENT_MAX = 200000;
export function pruneEvents() {
  const from = Date.now() - EVENT_DAYS * 864e5;
  let keep = events.filter(x => x.t >= from);
  if (keep.length > EVENT_MAX) keep = keep.slice(-EVENT_MAX);
  if (keep.length !== events.length) {
    console.log(`olay temizliği: ${events.length - keep.length} eski kayıt silindi`);
    events = keep;
    store.pruneEvents(from, EVENT_MAX);
  }
}
pruneEvents(); // yinelenen temizlik iş kuyruğundadır (prune_events)
// Ziyaretçi kimliğini sunucu verir ve imzalar (mxv çerezi); istemcinin gövdede gönderdiği kimlik yok sayılır.
// Yeni kimlik adres başına saatte 30 ile sınırlıdır: uydurma kimliklerle ağırlık tavanı aşılamaz.
export function visitorOf(req, ip) {
  const c = cookie(req, 'mxv');
  if (c) {
    const [v, sig] = c.split('.');
    if (v && sig && /^[a-z0-9-]{8,40}$/i.test(v) && sigOk(sig, 'v:' + v)) return { vid: v };
  }
  if (limited('vid' + ip, 30, 3600e3)) return null;
  const v = crypto.randomUUID();
  return {
    vid: v,
    setCookie: `mxv=${v}.${sign('v:' + v)}; Path=/; SameSite=Lax; Max-Age=31536000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
  };
}
export function ingest(body, req, vid) {
  if (!vid || !Array.isArray(body.events)) return 0;
  if (events.length > EVENT_MAX + 5000) pruneEvents();
  const dev = /Mobi|Android|iPhone/i.test(req.headers['user-agent'] || '') ? 'm' : 'd',
    lines = [];
  for (const x of body.events.slice(0, 60)) {
    if (!x || !EVENT_TYPES.has(x.e)) continue;
    const ev = { t: Date.now(), vid, s: Number(x.s) || 1, e: x.e, d: dev };
    // Çerez onayı damgası: vitrin yalnız onay varken gönderir (app/tracking.js). İşaret taşımayan olay
    // davranış modeline alınmaz (services/insights.mjs). Varsayılan "onay yok" tarafındadır.
    if (body.consent === true) ev.consent = true;
    if (typeof x.id === 'string' && P.has(x.id)) ev.id = x.id;
    if (typeof x.c === 'string' && CATS.some(c => c.k === x.c)) ev.c = x.c;
    if (Number.isInteger(x.si) && x.si >= 0) ev.si = x.si;
    if (typeof x.b === 'string') ev.b = x.b.slice(0, 40);
    if (typeof x.q === 'string') ev.q = x.q.slice(0, 80);
    for (const k of ['pr', 'n', 'sec', 'v']) if (Number.isFinite(x[k])) ev[k] = x[k];
    if (typeof x.o === 'string') ev.o = x.o.slice(0, 8);
    if (typeof x.k === 'string') ev.k = x.k.slice(0, 12);
    events.push(ev);
    lines.push(ev);
  }
  store.addEvents(lines);
  return lines.length;
}
export function analytics(days = 7) {
  days = Math.min(90, Math.max(1, Number(days) || 7));
  const from = Date.now() - days * 864e5,
    ev = events.filter(x => x.t >= from);
  const nul = () => Object.create(null),
    cnt = nul(),
    vis = new Set(),
    ses = new Map(),
    byDay = nul(),
    sq = new Map(),
    pv = new Map(),
    pa = new Map(),
    cats = nul(),
    brands = nul(),
    dev = { m: new Set(), d: new Set() };
  let dwell = 0,
    dwellN = 0;
  const day = t => new Date(t).toISOString().slice(0, 10);
  for (const x of ev) {
    cnt[x.e] = (cnt[x.e] || 0) + 1;
    vis.add(x.vid);
    const sk = x.vid + '#' + x.s,
      S = ses.get(sk) || { v: 0, a: 0, c: 0, subs: Object.create(null) };
    ses.set(sk, S);
    dev[x.d === 'm' ? 'm' : 'd'].add(x.vid);
    const D = (byDay[day(x.t)] ??= { visitors: new Set(), views: 0, adds: 0, searches: 0 });
    D.visitors.add(x.vid);
    if (x.e === 'view') {
      S.v++;
      D.views++;
      if (x.id) pv.set(x.id, (pv.get(x.id) || 0) + 1);
      if (x.c) {
        cats[x.c] = (cats[x.c] || 0) + 1;
        if (x.si >= 0) S.subs[x.c + '/' + x.si] = (S.subs[x.c + '/' + x.si] || 0) + 1;
      }
      if (x.b) brands[x.b] = (brands[x.b] || 0) + 1;
    }
    if (x.e === 'add') {
      S.a++;
      D.adds++;
      if (x.id) pa.set(x.id, (pa.get(x.id) || 0) + 1);
    }
    if (x.e === 'checkout') S.c++;
    if (x.e === 'search' && x.q) {
      D.searches++;
      const k = norm(x.q),
        q = sq.get(k) || { q: x.q, count: 0, results: x.n ?? null };
      q.count++;
      q.results = x.n ?? q.results;
      sq.set(k, q);
    }
    if (x.e === 'dwell' && x.sec > 0 && x.sec < 1800) {
      dwell += x.sec;
      dwellN++;
    }
  }
  const S = [...ses.values()],
    stage = { 'Geziyor (ürün açmadı)': 0, Bakıyor: 0, Karşılaştırıyor: 0, Sepette: 0, 'Ödemeye tıkladı': 0 };
  for (const s of S)
    stage[
      s.c
        ? 'Ödemeye tıkladı'
        : s.a
          ? 'Sepette'
          : Object.values(s.subs).some(v => v >= 3)
            ? 'Karşılaştırıyor'
            : s.v
              ? 'Bakıyor'
              : 'Geziyor (ürün açmadı)'
    ]++;
  const top = (m, n = 8) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, count]) => ({ id, title: P.get(id)?.title || id, vendor: P.get(id)?.vendor || '', count }));
  const sorted = o =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  const searches = [...sq.values()].sort((a, b) => b.count - a.count),
    daysList = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = day(Date.now() - i * 864e5),
      D = byDay[d];
    daysList.push({
      day: d,
      visitors: D ? D.visitors.size : 0,
      views: D?.views || 0,
      adds: D?.adds || 0,
      searches: D?.searches || 0,
    });
  }
  const sv = S.filter(s => s.v).length,
    sa = S.filter(s => s.a).length,
    sc = S.filter(s => s.c).length;
  return {
    days,
    totalEvents: ev.length,
    visitors: vis.size,
    sessions: S.length,
    counts: cnt,
    funnel: {
      sessions: S.length,
      viewedProduct: sv,
      addedToCart: sa,
      clickedCheckout: sc,
      viewToCartPct: sv ? Math.round((sa / sv) * 1000) / 10 : null,
      cartToCheckoutPct: sa ? Math.round((sc / sa) * 1000) / 10 : null,
    },
    stages: stage,
    avgDwellSec: dwellN ? Math.round(dwell / dwellN) : null,
    devices: { mobile: dev.m.size, desktop: dev.d.size },
    topSearches: searches.slice(0, 10),
    zeroResultSearches: searches.filter(q => q.results === 0).slice(0, 10),
    topViewed: top(pv),
    topAdded: top(pa),
    topCategories: sorted(cats).map(x => ({ ...x, name: CATS.find(c => c.k === x.name)?.label || x.name })),
    topBrands: sorted(brands),
    cartRemovals: cnt.remove || 0,
    exitIntents: cnt.exit_intent || 0,
    daily: daysList,
    note: ev.length
      ? undefined
      : 'Bu dönemde kayıtlı ziyaretçi olayı yok. Olaylar yalnızca çerez onayı veren ziyaretçilerden toplanır.',
  };
}
export function problemSummary() {
  const open = openProblems(),
    by = k => {
      const m = Object.create(null);
      for (const p of open) m[p[k]] = (m[p[k]] || 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
  return {
    total: open.length,
    pending: open.filter(p => !settings.approved[p.id]).length,
    approved: open.filter(p => settings.approved[p.id]).length,
    hidden: open.filter(p => settings.hidden[p.id]).length,
    cleared: Object.keys(settings.cleared).length,
    byType: by('tur').map(([k, n]) => ({ type: k, label: TUR[k] || k, count: n })),
    byBrand: by('vendor')
      .slice(0, 15)
      .map(([brand, count]) => ({ brand, count })),
    byCategory: by('catLabel').map(([category, count]) => ({ category, count })),
  };
}

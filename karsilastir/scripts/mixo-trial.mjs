#!/usr/bin/env node
/*
 * Yerel deneme betiği: yayından önce, GEÇİCİ bir veritabanında gerçek sitelere karşı Mixoutlet kapsama oranlarını ölçer.
 * Canlı veritabanına dokunmaz, hesap açmaz. Tüm istekler crawler.guardedGet üzerinden gider (robots.txt, host aralığı,
 * 403/429 sonrası bekleme); bot engeli aşılmaz. idealo, geizhals ve Google'a istek atılmaz.
 *
 *   node scripts/mixo-trial.mjs --demo <demo/data> --n 40 --seed 42 --shops a.de,b.de --db <dizin> --out <sonuc.json> [--dry-run]
 *
 * --dry-run: ağ isteği atmadan örneklemi ve istek planını yazdırır.
 * Adımlar: (1) demo verisinden tohumlu katmanlı örneklem; (2) Mixoutlet .json zenginleştirme (barkod, MPN);
 * (3) arama yolu olan rakiplerde EAN/MPN araması; (4) diğer rakiplerde hedefli site haritası + en çok 10 sayfa;
 * (5) promoteUnmatched, mixoSummary, mixoComparison; (6) JSON sonuç ve konsol özeti.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCrawler, mixoTargets, siteOf } from '../crawler/crawler.mjs';
import { createMixoEnricher, enrichPriority, handlePriority } from '../crawler/mixoEnrich.mjs';
import { openDb } from '../db.mjs';
import { mixoComparison, mixoSummary } from '../db/mixo.mjs';
import { promoteUnmatched } from '../lib/ingest.mjs';
import { STORES, provisionStores } from '../lib/stores.mjs';

const flat = v =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Tohumlu sözde rastgele sayı üreteci (mulberry32): aynı tohum, aynı örneklem. */
export function rng(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** demo/data/all-*.js dosyaları: MXC("all",0,[[handle, başlık, marka, fiyat, ...], ...]) sarmalayıcısı soyulur. */
export function readDemo(dir) {
  const rows = [];
  for (const f of readdirSync(dir).filter(x => /^all-\d+\.js$/.test(x))) {
    const txt = readFileSync(join(dir, f), 'utf8').trim();
    const i = txt.indexOf('[');
    const j = txt.lastIndexOf(']');
    if (i < 0 || j < i) continue;
    try {
      for (const r of JSON.parse(txt.slice(i, j + 1)))
        if (Array.isArray(r) && typeof r[0] === 'string')
          rows.push({
            handle: r[0],
            title: String(r[1] ?? ''),
            brand: String(r[2] ?? ''),
            price: Number(r[3]) || 0,
          });
    } catch {
      // bozuk dosya atlanır
    }
  }
  return rows;
}

const GROUPS = {
  bt: {
    n: 22,
    test: r => /^(delock|efb|logilink|roline|digitus|startech|equip|asus|lenovo|tplink)/.test(flat(r.brand)),
  },
  printer: {
    n: 8,
    test: r =>
      /^(hp|epson|brother|canon)/.test(flat(r.brand)) &&
      /toner|tinte|patrone|druckkopf|trommel|drucker|cartridge/i.test(r.title),
  },
  watch: { n: 6, test: r => /^(festina|casio|guess|seiko)/.test(flat(r.brand)) },
  perfume: {
    n: 4,
    test: r =>
      /^(afnan|lattafa|armaf|rasasi)/.test(flat(r.brand)) || /eau de (parfum|toilette)/i.test(r.title),
  },
};

/** Katmanlı örneklem: BT 22, yazıcı/toner 8, saat 6, parfüm 4 (n=40'ta); havuz yetmezse kalan rastgele doldurulur. */
export function sampleDemo(rows, { n = 40, seed = 42 } = {}) {
  const rand = rng(seed);
  const shuffle = a => {
    const x = [...a];
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  const used = new Set();
  const out = [];
  const scale = n / 40;
  for (const [name, g] of Object.entries(GROUPS)) {
    const want = Math.round(g.n * scale);
    const pool = shuffle(rows.filter(r => !used.has(r.handle) && g.test(r)));
    for (const r of pool.slice(0, want)) {
      used.add(r.handle);
      out.push({ ...r, group: name });
    }
  }
  for (const r of shuffle(rows.filter(r => !used.has(r.handle))))
    if (out.length < n) {
      used.add(r.handle);
      out.push({ ...r, group: 'diger' });
    }
  return out.slice(0, n);
}

/** Ağsız istek planı (üst sınırlar): zenginleştirme, arama, hedefli harita ve tarama. */
export function planRequests({ sample, shops }) {
  const searchShops = shops.filter(s => s.search);
  const mapShops = shops.filter(s => !s.search);
  const plan = {
    mixoEnrich: { host: 'mixoutlet.de', requests: sample.length + 1 },
    search: searchShops.map(s => ({ host: s.domain, requests: 40 + 1 })),
    targetedMaps: mapShops.map(s => ({ host: s.domain, requests: 4 + 1 })),
    crawl: mapShops.map(s => ({ host: s.domain, requests: 10 })),
  };
  plan.total =
    plan.mixoEnrich.requests +
    [plan.search, plan.targetedMaps, plan.crawl].flat().reduce((a, x) => a + x.requests, 0);
  return plan;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * Denemeyi çalıştırır. fetchImpl sınama için değiştirilebilir (sahte fetch); varsayılan gerçek fetch.
 * Dönüş: sonuç nesnesi (dryRun: yalnız örneklem ve plan).
 */
export async function runTrial({
  demo,
  n = 40,
  seed = 42,
  shops: shopDomains = [],
  dbDir,
  out,
  dryRun = false,
  fetchImpl = fetch,
  siteUrl = 'http://localhost:3100',
  ownIntervalMs = 2000,
  now = Date.now,
  log = m => console.log(m),
}) {
  const sample = sampleDemo(readDemo(demo), { n, seed });
  const wanted = new Set(shopDomains.map(d => siteOf(d)));
  const shops = STORES.filter(s => s.crawl && wanted.has(siteOf(s.domain)));
  const plan = planRequests({ sample, shops });
  if (dryRun) {
    const res = { dryRun: true, n: sample.length, groups: count(sample, r => r.group), sample, plan };
    if (out) writeFileSync(out, JSON.stringify(res, null, 2));
    return res;
  }
  mkdirSync(dbDir, { recursive: true });
  const db = openDb(dbDir);
  const hostCount = {};
  const statusCount = {};
  const reasons = {};
  const requestLog = []; // [sıra, zaman, durum, adres]: robots ve 403 sonrası istek denetimi için
  // İstek günlüğü diske de yazılır: süreç öldürülür ve aynı --db ile yeniden başlatılırsa sayımlar kaybolmaz.
  const logFile = join(dbDir, 'requests.jsonl');
  const tally = (h, status, url, t) => {
    hostCount[h] = (hostCount[h] ?? 0) + 1;
    requestLog.push([requestLog.length + 1, t, status, url]);
    statusCount[`${h} ${status}`] = (statusCount[`${h} ${status}`] ?? 0) + 1;
  };
  if (existsSync(logFile))
    for (const line of readFileSync(logFile, 'utf8').split('\n').filter(Boolean)) {
      const [t, status, url] = JSON.parse(line);
      tally(new URL(url).host, status, url, t);
    }
  const counting = async (url, init) => {
    const h = new URL(url).host;
    const t = now(); // isteğin BAŞLANGIÇ zamanı: host aralığı başlangıçtan başlangıca ölçülür
    const r = await fetchImpl(url, init);
    tally(h, r.status, url, t);
    appendFileSync(logFile, JSON.stringify([t, r.status, url]) + '\n');
    return r;
  };
  const crawlLog = m => {
    const x = /^crawl \S+: (.+)$/.exec(m);
    if (x && x[1] !== 'ok') reasons[x[1]] = (reasons[x[1]] ?? 0) + 1;
    log(m);
  };
  try {
    const mixoEntry = STORES.find(s => siteOf(s.domain) === 'mixoutlet.de');
    const searchShops = shops.filter(s => s.search);
    provisionStores(db, [mixoEntry, ...searchShops]);
    const crawler = createCrawler({
      db,
      siteUrl,
      fetchImpl: counting,
      now,
      ownDomains: ['mixoutlet.de'],
      ownIntervalMs,
      log: crawlLog,
    });
    const shopRow = d =>
      db.prepare("SELECT * FROM shops WHERE replace(lower(domain), 'www.', '') = ?").get(siteOf(d));
    const mixo = shopRow('mixoutlet.de');

    // (2) Mixoutlet zenginleştirme: yalnız örneklemin handle'ları kuyruğa yazılır.
    const enricher = createMixoEnricher({ db, get: crawler.guardedGet, now, log, ownFast: true });
    const ins = db.prepare(
      'INSERT OR IGNORE INTO mixo_enrich (handle, shopId, priority, price) VALUES (?, ?, ?, ?)',
    );
    for (const r of sample)
      ins.run(r.handle, mixo.id, Math.max(handlePriority(r.handle), enrichPriority(r.brand, '')), r.price);
    const enrich = await enricher.enrichBatch(mixo, { limit: sample.length });
    const byHandle = new Map();
    for (const r of sample) {
      const row = db.prepare('SELECT status, ean FROM mixo_enrich WHERE handle = ?').get(r.handle);
      const url = new URL(`https://mixoutlet.de/products/${r.handle}`).href; // veritabanında normalize adres
      const u = db
        .prepare('SELECT mpn FROM unmatched WHERE shopId = ? AND (url = ? OR url LIKE ?)')
        .get(mixo.id, url, url + '?variant=%');
      const o = db
        .prepare(
          `SELECT p.mpn FROM offers o JOIN products p ON p.ean = o.ean WHERE o.shopId = ? AND (o.url = ? OR o.url LIKE ?)`,
        )
        .get(mixo.id, url, url + '?variant=%');
      byHandle.set(r.handle, {
        status: row?.status ?? null,
        withEan: !!row?.ean,
        mpn: u?.mpn ?? o?.mpn ?? null,
      });
    }
    const withEan = [...byHandle.values()].filter(x => x.withEan).length;
    const withMpn = [...byHandle.values()].filter(x => x.mpn).length;
    const btRows = sample.filter(r => r.group === 'bt');
    const btEan = btRows.filter(r => byHandle.get(r.handle).withEan).length;

    // (3) arama yolu olan rakiplerde EAN/MPN araması (host başına 10 sn; robots arama yolunu yasaklarsa atlanır)
    let search = null;
    if (typeof crawler.searchTargeted === 'function' && searchShops.length)
      search = await crawler.searchTargeted({ perShop: 40, dailyCap: 1000 });

    // (4) hedefli site haritası + en çok 10 sayfa / mağaza
    const mapShops = shops.filter(s => !s.search);
    provisionStores(db, mapShops);
    const targets = mixoTargets(db);
    const seedsAdded = {};
    for (const s of mapShops) {
      const sh = shopRow(s.domain);
      const stats = {};
      try {
        seedsAdded[s.domain] = {
          added: await crawler.discoverSeeds(sh, undefined, { targets, stats }),
          maps: stats.maps ?? [],
        };
      } catch (e) {
        seedsAdded[s.domain] = { error: String(e.message).slice(0, 80) };
      }
    }
    const cycle = await crawler.runCycle({ limit: mapShops.length * 10 });

    // (5) bağlama ve sayımlar
    const promoted = promoteUnmatched(db, now());
    const summary = mixoSummary(db, now(), 30, sample.length);
    const cmp = mixoComparison(db, now(), 30, { limit: 500 });
    const suspicious = cmp.items.filter(p => Math.abs(p.pct) > 60).map(slim);
    const res = {
      n: sample.length,
      seed,
      groups: count(sample, r => r.group),
      enrich,
      withEan,
      withEanPct: pct(withEan, sample.length),
      btWithEan: btEan,
      btWithEanPct: pct(btEan, btRows.length),
      mpn: withMpn,
      mpnPct: pct(withMpn, sample.length),
      mpnExamples: sample
        .filter(r => byHandle.get(r.handle).mpn)
        .slice(0, 15)
        .map(r => ({ title: r.title.slice(0, 70), brand: r.brand, mpn: byHandle.get(r.handle).mpn })),
      search,
      seedsAdded,
      cycle,
      promoted,
      coveredEan: summary.coveredEan,
      coveredMpn: summary.coveredByMpn,
      covered: summary.covered,
      coveredPct: pct(summary.covered, sample.length),
      byShop: summary.byShop,
      requestsByHost: hostCount,
      requestLog,
      statusByHost: statusCount,
      reasons,
      seedStatus: count(db.prepare('SELECT lastStatus s FROM seeds').all(), r => r.s ?? 'pending'),
      examples: cmp.items.slice(0, 20).map(slim),
      suspicious,
    };
    if (out) writeFileSync(out, JSON.stringify(res, null, 2));
    return res;
  } finally {
    db.close();
  }
}

const slim = p => ({
  matchType: p.matchType,
  title: String(p.title).slice(0, 70),
  mixo: p.mixo,
  best: p.best,
  pct: p.pct,
  rivals: p.rivals.map(r => `${r.shop} ${r.total}`),
});
const count = (list, f) => {
  const o = {};
  for (const x of list) o[f(x)] = (o[f(x)] ?? 0) + 1;
  return o;
};

/** Komut satırı: --anahtar değer; değersiz bayraklar true. */
export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.demo || (!a.dry && !a['dry-run'] && (!a.db || !a.out))) {
    console.error(
      'kullanım: node scripts/mixo-trial.mjs --demo <demo/data> [--n 40] [--seed 42] [--shops a.de,b.de] --db <dizin> --out <json> [--dry-run]',
    );
    process.exit(2);
  }
  const res = await runTrial({
    demo: a.demo,
    n: Number(a.n || 40),
    seed: Number(a.seed || 42),
    shops: String(a.shops || '')
      .split(',')
      .filter(Boolean),
    dbDir: a.db,
    out: typeof a.out === 'string' ? a.out : undefined,
    dryRun: !!(a['dry-run'] || a.dry),
    siteUrl: process.env.SITE_URL || 'http://localhost:3100',
  });
  if (res.dryRun) {
    console.log(`örneklem: ${res.n} ürün`, res.groups);
    for (const r of res.sample)
      console.log(`  [${r.group}] ${r.brand} | ${r.title.slice(0, 70)} | ${r.handle}`);
    console.log('istek planı (üst sınır):', JSON.stringify(res.plan));
  } else {
    const { examples: _e, suspicious: _s, mpnExamples: _m, requestLog: _l, ...short } = res;
    console.log(JSON.stringify(short, null, 2));
    console.log(`şüpheli eşleşme (|fark| > %60): ${res.suspicious.length}; ayrıntı: ${a.out}`);
  }
}

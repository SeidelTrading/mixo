import crypto from 'node:crypto';
import { store } from '../lib/store.mjs';
import { audit, newChangeId } from './audit.mjs';
import { norm } from './catalog.mjs';

// Ürün havuzu iş kuralları (HTTP bilmez). Her gerçek ürün havuzda bir kez durur; farklı kaynaklardan gelen kopyalar
// tek kanonik kayda bağlanır (pool_src). Birleştirme geri alınabilir: merge() geri alma verisi döndürür, unmerge() onu uygular.
export const MAX_EANS = 8;
const MARKET_RE = /^[a-z0-9._-]{1,40}$/i;

// Hata türleri: invalid (girdi), notfound, conflict (EAN çakışması / çakışan kayıt), limit (EAN sınırı). Yönlendirme katmanı HTTP koduna çevirir.
export class PoolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new PoolError(code, msg);
};

const db = () => store.pool;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Eşleştirme anahtarları: harf/rakam dışı her şey atılır, aksanlar ve büyük/küçük harf yok sayılır.
const key = s =>
  norm(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const keyMpn = s => key(s).replace(/ /g, '');

export const isEan = v => typeof v === 'string' && /^\d+$/.test(v) && [8, 12, 13, 14].includes(v.length);
const cleanEan = v => {
  const e = String(v ?? '').trim();
  if (!isEan(e)) fail('invalid', `Geçersiz EAN: ${e.slice(0, 20)} (8, 12, 13 ya da 14 haneli rakam olmalı)`);
  return e;
};
const cleanMarket = m => {
  if (m === undefined || m === null || m === '') return '*';
  if (typeof m !== 'string' || (m !== '*' && !MARKET_RE.test(m))) fail('invalid', 'Geçersiz pazar yeri');
  return m.toLowerCase();
};

// EAN listesi: "4006381333931" ya da { ean, market } öğeleri; (ean, market) tekrarı tek sayılır.
function parseEans(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) fail('invalid', 'eans dizi olmalı');
  const seen = new Map();
  for (const x of list) {
    const o = typeof x === 'object' && x ? x : { ean: x };
    const ean = cleanEan(o.ean),
      market = cleanMarket(o.market);
    seen.set(ean + '|' + market, { ean, market });
  }
  return [...seen.values()];
}

// EAN'ı ekler. Aynı (ean, market) başka ürüne bağlıysa ya da EAN başka ürünün herhangi bir pazar yerinde duruyorsa hata:
// sessizce üzerine yazılmaz. Aynı ürüne zaten bağlıysa işlem yapılmaz.
function attachEan(poolId, { ean, market }) {
  const owner = db().poolByEan(ean);
  if (owner && owner !== poolId) fail('conflict', `EAN ${ean} başka bir ürüne bağlı (${owner})`);
  if (db().poolByEan(ean, market) === poolId) return false;
  if (db().eansOf(poolId).length >= MAX_EANS)
    fail('limit', `Bir ürüne en fazla ${MAX_EANS} EAN bağlanabilir`);
  db().addEan(poolId, ean, market);
  return true;
}

function findMatch({ src, ref, eans, vendor, mpn, title }) {
  // (0) aynı kaynak kaydı daha önce bağlanmışsa kopya üretilmez
  const prev = db().srcByRef(src, ref);
  if (prev && db().getPool(prev.pool_id)) return prev.pool_id;
  // (a) EAN: farklı ürünlere işaret eden EAN'lar çakışmadır
  const owners = new Set(eans.map(e => db().poolByEan(e.ean)).filter(Boolean));
  if (owners.size > 1) fail('conflict', "Verilen EAN'lar farklı ürünlere bağlı; önce ürünleri birleştirin");
  if (owners.size === 1) return [...owners][0];
  // Eşleştirme sırası ve gerekçesi:
  //   (b) vendor + MPN — üreticinin kendi parça numarası en güvenilir kimliktir.
  //   (c) vendor + başlık — YALNIZ SON ÇARE: başlık pazarlama metnidir, aynı serinin farklı
  //       modelleri çoğu kez aynı başlıkla gelir. Bu yüzden başlık eşleşmesi ancak MPN bilgisi
  //       YOKSA kullanılır: iki kaydın da MPN'i doluysa ve farklıysa bunlar ayrı üründür ve
  //       başlıkları aynı olsa bile birleştirilmez (aksi halde ikinci ürünün MPN'i, fiyatı ve
  //       görseli kanonik kayda düşmeden kaybolur ve hiçbir pazar yerinde yayınlanmaz).
  const v = key(vendor),
    m = keyMpn(mpn),
    t = key(title);
  if (!v) return null;
  const sameVendor = db()
    .poolKeys()
    .filter(p => key(p.vendor) === v);
  if (m) {
    const hit = sameVendor.find(p => keyMpn(p.mpn) === m);
    if (hit) return hit.id;
  }
  if (!t) return null;
  const byTitle = sameVendor.filter(p => key(p.title) === t);
  // Gelen kaydın MPN'i varsa, MPN'i dolu (ve yukarıda eşleşmediği için farklı) adaylar elenir.
  return (m ? byTitle.filter(p => !keyMpn(p.mpn)) : byTitle)[0]?.id ?? null;
}

// ingest({ src, ref, title, vendor?, mpn?, eans?, ...ek alanlar }) → { id, created, pool }
export function ingest(input) {
  const o = input && typeof input === 'object' ? input : {};
  const { src: s0, ref: r0, title: t0, vendor: v0, mpn: m0, eans: e0, ...extra } = o;
  const src = str(s0, 60),
    ref = str(typeof r0 === 'number' ? String(r0) : r0, 120),
    title = str(t0, 300),
    vendor = str(v0, 120),
    mpn = str(m0, 120);
  if (!src || !ref) fail('invalid', 'src ve ref gerekli');
  if (!title) fail('invalid', 'title gerekli');
  const eans = parseEans(e0);
  return store.tx(() => {
    const now = Date.now();
    let id = findMatch({ src, ref, eans, vendor, mpn, title }),
      created = false;
    if (id) {
      const p = db().getPool(id);
      // eksik alanlar doldurulur; dolu olanın üzerine yazılmaz
      db().putPool({ ...p, vendor: p.vendor || vendor, mpn: p.mpn || mpn, updated: now });
    } else {
      id = 'p_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
      db().putPool({ id, title, vendor, mpn, created: now, updated: now, data: {} });
      created = true;
    }
    for (const e of eans) attachEan(id, e);
    db().putSrc({ src, ref, pool_id: id, t: now, data: { title, vendor, mpn, ...extra } });
    return { id, created, pool: getPool(id) };
  });
}

export function getPool(id) {
  const p = db().getPool(id);
  if (!p) return null;
  return { ...p, eans: db().eansOf(id), sources: db().srcOf(id) };
}

export function listPools({ limit = 50, offset = 0 } = {}) {
  const l = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 50)),
    off = Math.max(0, Math.floor(Number(offset)) || 0);
  return {
    total: db().poolCounts().pools,
    items: db()
      .listPools({ limit: l, offset: off })
      .map(p => ({ ...p, eans: db().eansOf(p.id) })),
  };
}

// Pazar yeri için geçerli EAN: önce o pazar yerine özel, yoksa '*', yoksa null.
export function eanFor(poolId, market) {
  const rows = db().eansOf(poolId),
    m = market ? String(market).toLowerCase() : '';
  return (m && rows.find(r => r.market === m)?.ean) || rows.find(r => r.market === '*')?.ean || null;
}

export function addEan(poolId, ean, market) {
  if (!db().getPool(poolId)) fail('notfound', 'Ürün yok');
  const e = { ean: cleanEan(ean), market: cleanMarket(market) };
  return store.tx(() => attachEan(poolId, e));
}

export function removeEan(poolId, ean, market) {
  const e = cleanEan(ean),
    m = cleanMarket(market);
  if (db().poolByEan(e, m) !== poolId) fail('notfound', 'Bu ürüne bağlı böyle bir EAN yok');
  db().delEan(e, m);
  return true;
}

// merge(keepId, dropId): drop'un kaynak kayıtları ve EAN'ları keep'e taşınır, drop silinir. Geri alma verisi döner.
export function merge(keepId, dropId) {
  if (!keepId || !dropId || keepId === dropId) fail('invalid', 'İki farklı ürün kimliği gerekli');
  return store.tx(() => {
    const keep = db().getPool(keepId),
      drop = db().getPool(dropId);
    if (!keep || !drop) fail('notfound', 'Ürün yok');
    const eans = db().eansOf(dropId),
      srcs = db().srcOf(dropId);
    if (db().eansOf(keepId).length + eans.length > MAX_EANS)
      fail('limit', `Birleşik ürün ${MAX_EANS} EAN sınırını aşar`);
    db().moveSrc(dropId, keepId);
    db().moveEans(dropId, keepId);
    db().delPool(dropId);
    db().putPool({ ...keep, updated: Date.now() });
    const undo = {
      kind: 'pool-merge',
      keepId,
      drop: {
        id: drop.id,
        title: drop.title,
        vendor: drop.vendor,
        mpn: drop.mpn,
        created: drop.created,
        data: drop.data,
      },
      eans: eans.map(e => ({ ean: e.ean, market: e.market })),
      srcs: srcs.map(s => ({ src: s.src, ref: s.ref })),
    };
    // Geri alma verisi değişiklik günlüğüne yazılır: birleştirme istemci veriyi saklamasa da geri alınabilir.
    // `undo.type` paneldeki genel geri alma düğmesinin aradığı addır ve karşılığı actions.pool_unmerge'dür;
    // `kind` ise unmergeById'nin kaydı tanıması için durur (ikisi de gerekli, biri panel biri uç içindir).
    const changeId = newChangeId();
    undo.type = 'pool_unmerge'; // paneldeki genel geri alma düğmesi bu adı actions içinde arar
    undo.changeId = changeId; // actions.pool_unmerge yalnız undo gövdesini alır, kaydın kimliğini oradan okur
    audit('Havuz', `Havuz birleştirme: "${drop.title}" → "${keep.title}"`, undo, changeId);
    return { ...undo, changeId };
  });
}

// Günlükteki birleştirmeyi kimliğiyle geri alır; aynı kayıt iki kez geri alınamaz.
export function unmergeById(changeId) {
  if (typeof changeId !== 'string' || !changeId) fail('invalid', 'changeId gerekli');
  const ch = store.allChanges().find(x => x.id === changeId);
  if (!ch || ch.undo?.kind !== 'pool-merge') fail('notfound', 'Birleştirme kaydı yok');
  if (ch.undone) fail('conflict', 'Bu birleştirme zaten geri alındı');
  const r = unmerge(ch.undo);
  store.setUndone(changeId);
  return { ...r, changeId };
}

// unmerge(undoData): merge()'ün döndürdüğü veriyle birleştirmeyi geri alır.
export function unmerge(undo) {
  const u = undo && typeof undo === 'object' ? undo : {};
  const d = u.drop && typeof u.drop === 'object' ? u.drop : {};
  if (!u.keepId || typeof u.keepId !== 'string' || typeof d.id !== 'string' || !d.id)
    fail('invalid', 'Geri alma verisi geçersiz');
  if (!Array.isArray(u.eans) || !Array.isArray(u.srcs)) fail('invalid', 'Geri alma verisi geçersiz');
  return store.tx(() => {
    if (!db().getPool(u.keepId)) fail('notfound', 'Birleştirilen ürün artık yok');
    if (db().getPool(d.id)) fail('conflict', 'Geri alınacak ürün kimliği zaten kullanımda');
    const eans = u.eans.map(e => ({ ean: cleanEan(e?.ean), market: cleanMarket(e?.market) }));
    for (const e of eans)
      if (db().poolByEan(e.ean, e.market) !== u.keepId)
        fail('conflict', `EAN ${e.ean} artık birleşik üründe değil`);
    for (const s of u.srcs)
      if (db().srcByRef(String(s?.src), String(s?.ref))?.pool_id !== u.keepId)
        fail('conflict', 'Kaynak kaydı artık birleşik üründe değil');
    const now = Date.now();
    db().putPool({
      id: d.id,
      title: str(d.title, 300) || d.id,
      vendor: str(d.vendor, 120),
      mpn: str(d.mpn, 120),
      created: Number(d.created) || now,
      updated: now,
      data: d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data : {},
    });
    for (const e of eans) db().setEanPool(e.ean, e.market, d.id);
    for (const s of u.srcs) db().setSrcPool(s.src, s.ref, d.id);
    return { restoredId: d.id, keepId: u.keepId };
  });
}

export const poolCounts = () => db().poolCounts();

import { store } from '../lib/store.mjs';
import { recordSet, moveDocRows } from './records.mjs';
import { eanFor, getPool, isEan, listPools } from './pool.mjs';
// Kural motoru STATİK içe aktarılır (döngü yok): yüklenemezse sistem sessizce izin vermek yerine
// açıkça patlar. Dinamik `import(...).catch(() => null)` deseni satış yasaklarını fail-open yapıyordu.
import { evaluate } from './rules.mjs';

// Feed kalite denetimi (K-03) ve toplu yükleme (K-04). HTTP bilmez; gerçek ağ çağrısı yapmaz (yükleme simülasyondur).
export class FeedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, msg) => {
  throw new FeedError(code, msg);
};

const BASE = ['title', 'description', 'image', 'price', 'ean'];
// Pazar yeri → zorunlu alanlar. Idealo ve Günstiger ayrıca yasal bilgi ister.
export const MARKETS = Object.freeze({
  idealo: Object.freeze([...BASE, 'legal']),
  billiga: Object.freeze([...BASE]),
  guenstiger: Object.freeze([...BASE, 'legal']),
  pricerunner: Object.freeze([...BASE]),
});
export const LEGAL_FIELDS = Object.freeze(['representative', 'address', 'taxId']);
const MAX_SCAN = 5000;

const cleanMarket = m => {
  const k = typeof m === 'string' ? m.trim().toLowerCase() : '';
  if (!Object.hasOwn(MARKETS, k)) fail('invalid', `Geçersiz pazar yeri (${Object.keys(MARKETS).join(', ')})`);
  return k;
};
const txt = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

// Alan önce havuz kaydının data'sından, yoksa kaynak kayıtlarından okunur.
export function field(pool, name) {
  const own = pool?.data?.[name];
  if (own !== undefined && own !== null && own !== '') return own;
  for (const s of pool?.sources ?? []) {
    const v = s?.data?.[name];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
export const legalOf = pool => {
  const l = field(pool, 'legal');
  return l && typeof l === 'object' && !Array.isArray(l) ? l : {};
};
// Ürün kategorisi: kural motorunun kategori bazlı yasakları için gerekli ('category', yoksa 'cat').
export const categoryOf = pool => txt(field(pool, 'category')) || txt(field(pool, 'cat'));
export const priceOf = pool => {
  const n = Number(field(pool, 'price'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Havuz ürününü pazar yeri kurallarına göre denetler.
export function checkProduct(pool, market) {
  const mk = cleanMarket(market);
  const missing = [],
    warnings = [];
  const p = pool && typeof pool === 'object' ? pool : {};
  for (const f of MARKETS[mk]) {
    if (f === 'title') {
      if (!txt(p.title)) missing.push(f);
    } else if (f === 'description') {
      const d = txt(field(p, 'description'));
      if (!d) missing.push(f);
      else if (d.length < 20) warnings.push('Açıklama çok kısa');
    } else if (f === 'image') {
      const i = txt(field(p, 'image'));
      if (!i) missing.push(f);
      else if (!/^https?:\/\//i.test(i)) warnings.push('Görsel adresi http(s) değil');
    } else if (f === 'price') {
      if (priceOf(p) === null) missing.push(f);
    } else if (f === 'ean') {
      const ean = p.id ? eanFor(p.id, mk) : fromList(p, mk);
      if (!ean) missing.push(f);
      else if (!isEan(ean)) warnings.push(`EAN biçimi geçersiz: ${ean}`);
    } else if (f === 'legal') {
      const l = legalOf(p);
      if (!LEGAL_FIELDS.some(k => txt(l[k]))) missing.push(f);
    }
  }
  // Havuzda bulunan ama bu pazar yeri için biçimi bozuk EAN'lar (ör. elle yazılmış kayıt)
  for (const e of p.eans ?? [])
    if (e && (e.market === mk || e.market === '*') && !isEan(String(e.ean)))
      warnings.push(`EAN biçimi geçersiz: ${String(e.ean).slice(0, 20)}`);
  return { ok: missing.length === 0 && warnings.every(w => !w.startsWith('EAN biçimi')), missing, warnings };
}
// Havuz kimliği yoksa (elle verilmiş nesne) EAN listesinden bulur.
function fromList(p, mk) {
  const rows = p.eans ?? [];
  return rows.find(r => r.market === mk)?.ean ?? rows.find(r => r.market === '*')?.ean ?? null;
}

const clampLimit = n => Math.min(MAX_SCAN, Math.max(1, Math.floor(Number(n)) || MAX_SCAN));
// Havuzu sayfa sayfa tarar; her ürün getPool ile tam şekline getirilir.
function* scan(limit) {
  let off = 0,
    n = 0;
  for (;;) {
    const { items } = listPools({ limit: 200, offset: off });
    if (!items.length) return;
    for (const it of items) {
      if (n++ >= limit) return;
      const full = getPool(it.id);
      if (full) yield full;
    }
    off += items.length;
  }
}

function readDoc() {
  const d = store.doc('feed', {});
  return d && typeof d === 'object' ? d : {};
}

// Depolama: belgede (`store.doc('feed')`) yalnız küçük ÖZETLER durur (pazar yeri başına son denetimin özeti, son toplu
// yüklemenin özeti). Binlerce ürün satırı (sorunlar, yükleme sonuçları) satır tablosundadır; belgede tutulsaydı her
// yazma 35 MB'lık belgeyi yeniden yazardı (konsey ölçümü: ≈ 640 ms olay döngüsü bloke).
// Sorun satırları pazar yeri başına ayrı kümededir: yeni denetim o pazarın kümesini tek `clear` ile boşaltır, böylece
// düzelen ürün raporda kalmaz ve ikinci çalıştırma kopya üretmez.
const problemSet = mk => recordSet('feed_problems_' + mk);
const bulkSet = recordSet('feed_bulk');
// Toplu yükleme satırı tavanı: 5.000 ürün × 100 mağaza teorik olarak yarım milyon satır eder; yalnız son çalıştırmanın
// ilk 20.000 satırı saklanır (toplam sayılar özette durur). Her çalıştırma öncekini zaten değiştirir.
const BULK_MAX_ROWS = 20000;
// lastAudit varsayılan sorun sınırı: çok büyük denetimde de bellek ve yanıt boyutu sınırlı kalsın diye ilk N sorun döner;
// toplam `problemCount` alanında.
export const LAST_AUDIT_LIMIT = 500;

// Eski kurulumlarda sorunlar ve yükleme sonuçları belgenin içindeydi: modül yüklenirken bir kez satıra taşınır
// (store.tx dışında: putMany kendi işlemini açar). Yapılandırma ve özetler belgede kalır.
for (const mk of Object.keys(MARKETS))
  moveDocRows(problemSet(mk).kind, 'feed', {
    rows: d => {
      const a = d.audits?.[mk];
      return Array.isArray(a?.problems)
        ? a.problems.map(x => ({ ...x, id: mk + ':' + x?.poolId, market: mk, t: a.t }))
        : [];
    },
    strip: d => {
      const a = d.audits?.[mk];
      if (a && Array.isArray(a.problems)) {
        a.problemCount = a.problems.length;
        delete a.problems;
      }
    },
  });
moveDocRows(bulkSet.kind, 'feed', {
  rows: d => {
    const b = d.bulk;
    if (!b) return [];
    const u = (Array.isArray(b.uploaded) ? b.uploaded : []).map(x => ({
      ...x,
      id: `u:${x?.poolId}:${x?.shopId}`,
      status: 'uploaded',
      t: b.t,
    }));
    const k = (Array.isArray(b.blocked) ? b.blocked : []).map(x => ({
      ...x,
      id: `b:${x?.poolId}:${x?.shopId ?? ''}`,
      status: 'blocked',
      t: b.t,
    }));
    return [...u, ...k].slice(0, BULK_MAX_ROWS);
  },
  strip: d => {
    const b = d.bulk;
    if (!b) return;
    b.uploadedCount = Array.isArray(b.uploaded) ? b.uploaded.length : 0;
    b.blockedCount = Array.isArray(b.blocked) ? b.blocked.length : 0;
    delete b.uploaded;
    delete b.blocked;
  },
});

export function auditFeed(market, opts) {
  const mk = cleanMarket(market);
  let checked = 0,
    okCount = 0;
  const problems = [];
  for (const p of scan(clampLimit(opts?.limit))) {
    checked++;
    const r = checkProduct(p, mk);
    if (r.ok && !r.warnings.length) okCount++;
    else if (r.ok)
      (okCount++, problems.push({ poolId: p.id, title: p.title, missing: [], warnings: r.warnings }));
    else problems.push({ poolId: p.id, title: p.title, missing: r.missing, warnings: r.warnings });
  }
  const t = Date.now();
  const report = { market: mk, checked, okCount, problems, problemCount: problems.length, t };
  const rs = problemSet(mk);
  // Tek işlemde: eski satırlar silinir, yenileri yazılır, özet belgeye konur. İşlem yarıda kesilse eski rapor korunur.
  // Satır kimliği `pazar:poolId` olduğundan aynı ürün aynı pazarda iki satır olamaz.
  store.tx(() => {
    rs.clear();
    for (const x of problems) rs.put({ ...x, id: mk + ':' + x.poolId, market: mk, t });
    const d = readDoc();
    const { problems: _p, ...summary } = report;
    store.saveDoc('feed', { ...d, audits: { ...(d.audits ?? {}), [mk]: summary } });
  });
  return report;
}

// Özet belgeden, sorun satırları satır tablosundan (ilk `limit` sorun, varsayılan LAST_AUDIT_LIMIT) birleştirilir.
export function lastAudit(market, opts) {
  const mk = cleanMarket(market);
  const a = readDoc().audits?.[mk];
  if (!a) return null;
  const lim = Number.isFinite(opts?.limit) ? Math.max(0, Math.floor(opts.limit)) : LAST_AUDIT_LIMIT;
  const rs = problemSet(mk);
  const problems = rs.all({ limit: lim }).map(({ poolId, title, missing, warnings }) => ({
    poolId,
    title,
    missing,
    warnings,
  }));
  return { ...a, problems, problemCount: a.problemCount ?? rs.count() };
}

// XML kaçışı: & < > " ' ve XML 1.0'da geçersiz denetim karakterleri atılır.
export function escXml(v) {
  return (
    String(v ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

// Yayınlanabilir ürünler: pazar yeri denetiminden geçen VE satış yasağı olmayan havuz kayıtları.
// Genel XML (buildFeed) ve kanal feed'leri (channel-feed.mjs) aynı kapıdan geçer; yasaklı ürün hiçbir feed'e girmez.
export function* eligible(market, opts) {
  const mk = cleanMarket(market);
  const company = txt(opts?.company);
  for (const p of scan(clampLimit(opts?.limit))) {
    if (!checkProduct(p, mk).ok) continue;
    if (
      evaluate({ vendor: p.vendor, market: mk, poolId: p.id, company, category: categoryOf(p) }).allowed ===
      false
    )
      continue;
    yield p;
  }
}

// buildFeed(market, { limit?, company? }): yalnız denetimden geçen VE satış yasağı olmayan ürünleri yayınlar.
export function buildFeed(market, opts) {
  const mk = cleanMarket(market);
  const items = [];
  for (const p of eligible(mk, opts)) {
    const l = legalOf(p);
    const tags = [
      ['id', p.id],
      ['title', p.title],
      ['brand', p.vendor],
      ['mpn', p.mpn],
      ['description', txt(field(p, 'description'))],
      ['image_link', txt(field(p, 'image'))],
      ['price', priceOf(p)],
      ['ean', eanFor(p.id, mk)],
    ];
    if (MARKETS[mk].includes('legal'))
      for (const k of LEGAL_FIELDS) if (txt(l[k])) tags.push(['legal_' + k, txt(l[k])]);
    const body = tags
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `    <${k}>${escXml(v)}</${k}>`)
      .join('\n');
    items.push(`  <item>\n${body}\n  </item>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed market="${mk}">\n${items.join('\n')}${items.length ? '\n' : ''}</feed>\n`;
}

const list = v => (Array.isArray(v) ? v : fail('invalid', 'Dizi bekleniyor'));
const idList = (v, name) => {
  const a = list(v)
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  if (!a.length) fail('invalid', `${name} boş olamaz`);
  if (a.length > 100) fail('invalid', `${name} en fazla 100 öğe`);
  return a;
};

// K-04: markaya göre toplu yükleme (simülasyon). Eksik alan / kural motoru yasağı olan ürün yüklenmez.
export async function bulkUpload(input) {
  const { brands, shops, market, company } = input ?? {};
  const mk = cleanMarket(market);
  const bs = idList(brands, 'brands'),
    ss = idList(shops, 'shops');
  const co = txt(company);
  const want = new Set(bs.map(b => b.toLowerCase()));
  const uploaded = [],
    blocked = [];
  for (const p of scan(MAX_SCAN)) {
    if (
      !want.has(
        String(p.vendor ?? '')
          .trim()
          .toLowerCase(),
      )
    )
      continue;
    const r = checkProduct(p, mk);
    const l = legalOf(p);
    const noLegal = LEGAL_FIELDS.filter(k => !txt(l[k]));
    if (!r.ok) {
      blocked.push({ poolId: p.id, reason: `Eksik alan: ${r.missing.join(', ') || r.warnings.join('; ')}` });
      continue;
    }
    if (noLegal.length) {
      blocked.push({ poolId: p.id, reason: `Eksik yasal alan: ${noLegal.join(', ')}` });
      continue;
    }
    const category = categoryOf(p);
    for (const shopId of ss) {
      // company ve category geçirilmezse şirket/kategori bazlı mevzuat yasakları sessizce devre dışı kalır.
      const verdict = evaluate({
        vendor: p.vendor,
        market: mk,
        poolId: p.id,
        shopId,
        company: co,
        category,
      });
      if (verdict.allowed === false)
        blocked.push({ poolId: p.id, shopId, reason: verdict.reason || 'Satış yasağı kuralı' });
      else uploaded.push({ poolId: p.id, shopId, title: p.title });
    }
  }
  const out = { uploaded, blocked, t: Date.now() };
  store.tx(() => {
    bulkSet.clear();
    const rows = [
      ...uploaded.map(x => ({ ...x, id: `u:${x.poolId}:${x.shopId}`, status: 'uploaded' })),
      ...blocked.map(x => ({ ...x, id: `b:${x.poolId}:${x.shopId ?? ''}`, status: 'blocked' })),
    ].slice(0, BULK_MAX_ROWS);
    for (const r of rows) bulkSet.put({ ...r, t: out.t });
    const d = readDoc();
    store.saveDoc('feed', {
      ...d,
      bulk: {
        market: mk,
        brands: bs,
        shops: ss,
        company: co,
        t: out.t,
        uploadedCount: uploaded.length,
        blockedCount: blocked.length,
        stored: rows.length,
      },
    });
  });
  return out;
}

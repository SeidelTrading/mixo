import { parse, isObj } from './util.mjs';

// Büyüyen iş kayıtları için ortak satır tablosu (şema sürümü 3). Saf veri erişimi, iş kuralı yok.
//
// Neden var: bu kayıtlar modül başına tek bir JSON belgesinde duruyordu ve her yazma TÜM belgeyi
// yeniden yazıyordu. Ölçüm (konsey, 17.11.2026): 4-5 MB belgede ≈ 150 ms, 35 MB'de ≈ 640 ms —
// her yazmada olay döngüsü o kadar süre blokeydi. Burada yazma yalnız değişen satıra dokunur.
//
// `kind` kaydın hangi modüle ait olduğunu söyler ('refunds', 'support', 'staff', ...). Kayıt gövdesi
// `data` sütununda JSON olarak durur; `id` ve `t` ayrı sütundur ki sıralama ve tekillik SQLite'ta olsun.
export function makeRecs({ q, tx }) {
  const row = r => {
    if (!r) return null;
    const d = parse(r.data, null);
    return isObj(d) ? { ...d, id: r.id, t: r.t } : null;
  };

  const get = (kind, id) =>
    row(q('SELECT id,t,data FROM recs WHERE kind=? AND id=?').get(String(kind), String(id)));

  // Kayıt gövdesinden id ve t çıkarılır (sütunda duruyorlar), kalanı data'ya yazılır.
  const put = (kind, rec) => {
    const id = String(rec?.id ?? '');
    if (!id) throw new Error('recs.put: id gerekli');
    const t = Number.isFinite(rec?.t) ? Number(rec.t) : Date.now();
    const { id: _i, t: _t, ...body } = rec;
    q(
      'INSERT INTO recs(kind,id,t,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET t=excluded.t, data=excluded.data',
    ).run(String(kind), id, t, JSON.stringify(body));
    return { ...body, id, t };
  };

  const del = (kind, id) =>
    Number(q('DELETE FROM recs WHERE kind=? AND id=?').run(String(kind), String(id)).changes);

  // Varsayılan sıra: eskiden yeniye (ekleme sırası). desc=true ile tersi.
  /** @param {string} kind @param {{limit?: number, offset?: number, desc?: boolean}} [opt] */
  const all = (kind, { limit, offset = 0, desc = false } = {}) => {
    const lim = Number.isFinite(limit) ? Math.max(0, Math.floor(Number(limit))) : -1;
    return q(
      `SELECT id,t,data FROM recs WHERE kind=? ORDER BY t ${desc ? 'DESC' : 'ASC'}, rowid ${desc ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`,
    )
      .all(String(kind), lim, Math.max(0, Math.floor(Number(offset) || 0)))
      .map(row)
      .filter(Boolean);
  };

  const count = kind => Number(q('SELECT COUNT(*) c FROM recs WHERE kind=?').get(String(kind)).c);

  // Tavan: en eski kayıtlar silinir, silinen sayı döner. Tavansız büyüme bu katmanda da istenmez.
  const prune = (kind, max) => {
    const m = Math.max(0, Math.floor(Number(max) || 0)),
      c = count(kind);
    if (c <= m) return 0;
    return Number(
      q(
        'DELETE FROM recs WHERE kind=? AND id IN (SELECT id FROM recs WHERE kind=? ORDER BY t ASC, rowid ASC LIMIT ?)',
      ).run(String(kind), String(kind), c - m).changes,
    );
  };

  // Çok sayıda kaydı tek işlemde yazar (belgeden taşıma ve toplu içe aktarma için).
  const putMany = (kind, list) =>
    tx(() => {
      let n = 0;
      for (const r of Array.isArray(list) ? list : []) {
        if (!isObj(r) || !r.id) continue;
        put(kind, r);
        n++;
      }
      return n;
    });

  const clear = kind => Number(q('DELETE FROM recs WHERE kind=?').run(String(kind)).changes);

  // Satır sayıları: hangi modülün kaç kaydı var (sağlık ucu).
  const counts = () =>
    q('SELECT kind, COUNT(*) AS c FROM recs GROUP BY kind ORDER BY c DESC')
      .all()
      .map(r => ({ kind: r.kind, n: Number(r.c) || 0 }));

  return { get, put, del, all, count, prune, putMany, clear, counts };
}

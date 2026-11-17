import { parse } from './util.mjs';

// Belgeler: ayarlar, pazarlama ve Instagram durumu (kv tablosu).
export function makeDocuments({ q, log }) {
  /* belgeler: ayarlar, pazarlama ve Instagram durumu tek JSON belgesi olarak saklanır */
  const doc = (key, fallback) => {
    const r = q('SELECT value FROM kv WHERE key=?').get(key);
    if (!r) return fallback;
    const v = parse(r.value, undefined);
    if (v === undefined) {
      log(`UYARI: kv/${key} okunamadı; varsayılanla devam ediliyor.`);
      return fallback;
    }
    return v;
  };
  const saveDoc = (key, obj) => {
    q(
      'INSERT INTO kv(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated',
    ).run(key, JSON.stringify(obj), Date.now());
  };
  // Belge boyutları: hangi belgenin şiştiğini görmek için (sağlık ucu). Her yazma TÜM belgeyi yeniden yazdığı
  // için büyük belge doğrudan olay döngüsü gecikmesidir; büyüyen kayıtlar recs tablosuna taşınmalıdır.
  const docSizes = () =>
    q('SELECT key, LENGTH(value) AS bytes, updated FROM kv ORDER BY LENGTH(value) DESC')
      .all()
      .map(r => ({ key: r.key, bytes: Number(r.bytes) || 0, updated: r.updated }));
  return { doc, saveDoc, docSizes };
}

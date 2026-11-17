import { parse, isObj } from './util.mjs';

// Ürün havuzu: kanonik ürün kartı, EAN'lar ve kaynak kayıtları. Saf veri erişimi; iş kuralı services/pool.mjs içindedir.
// Çok adımlı işlemlerin tx sarmalaması çağırana aittir (BEGIN iç içe açılamaz); burada tek deyimlik işlemler vardır.
export function makePool({ q }) {
  const toPool = r => (r ? { ...r, data: parse(r.data, {}) } : null);
  const getPool = id => toPool(q('SELECT * FROM pool WHERE id=?').get(id));
  const putPool = p => {
    q(
      `INSERT INTO pool(id,title,vendor,mpn,created,updated,data) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, vendor=excluded.vendor, mpn=excluded.mpn, updated=excluded.updated, data=excluded.data`,
    ).run(
      p.id,
      p.title,
      p.vendor || '',
      p.mpn || '',
      p.created,
      p.updated,
      JSON.stringify(isObj(p.data) ? p.data : {}),
    );
  };
  const delPool = id => {
    q('DELETE FROM pool WHERE id=?').run(id);
  };
  const listPools = ({ limit = 50, offset = 0 } = {}) =>
    q('SELECT * FROM pool ORDER BY created, id LIMIT ? OFFSET ?').all(limit, offset).map(toPool);
  // Eşleştirme için hafif tarama (normalize eşleşmesi SQL'de yapılamaz); büyük havuzda O(n).
  const poolKeys = () => q('SELECT id,title,vendor,mpn FROM pool ORDER BY created, id').all();
  /* EAN'lar */
  // market verilirse tam (ean, market) eşleşmesi, verilmezse herhangi bir pazar yeri. Ürün kimliği ya da null döner.
  const poolByEan = (ean, market) =>
    (market
      ? q('SELECT pool_id FROM pool_ean WHERE ean=? AND market=?').get(ean, market)
      : q('SELECT pool_id FROM pool_ean WHERE ean=? ORDER BY market LIMIT 1').get(ean)
    )?.pool_id ?? null;
  const eansOf = poolId =>
    q('SELECT ean,market,added FROM pool_ean WHERE pool_id=? ORDER BY added, ean, market').all(poolId);
  const addEan = (poolId, ean, market = '*') => {
    q('INSERT INTO pool_ean(ean,pool_id,market,added) VALUES(?,?,?,?)').run(ean, poolId, market, Date.now());
  };
  const delEan = (ean, market = '*') => {
    q('DELETE FROM pool_ean WHERE ean=? AND market=?').run(ean, market);
  };
  const setEanPool = (ean, market, poolId) => {
    q('UPDATE pool_ean SET pool_id=? WHERE ean=? AND market=?').run(poolId, ean, market);
  };
  const moveEans = (fromId, toId) =>
    Number(q('UPDATE pool_ean SET pool_id=? WHERE pool_id=?').run(toId, fromId).changes);
  /* kaynak kayıtları */
  const toSrc = r => (r ? { ...r, data: parse(r.data, {}) } : null);
  const putSrc = rec => {
    q(
      `INSERT INTO pool_src(src,ref,pool_id,t,data) VALUES(?,?,?,?,?)
       ON CONFLICT(src,ref) DO UPDATE SET pool_id=excluded.pool_id, t=excluded.t, data=excluded.data`,
    ).run(
      rec.src,
      rec.ref,
      rec.pool_id,
      rec.t ?? Date.now(),
      JSON.stringify(isObj(rec.data) ? rec.data : {}),
    );
  };
  const srcOf = poolId =>
    q('SELECT * FROM pool_src WHERE pool_id=? ORDER BY src, ref').all(poolId).map(toSrc);
  const srcByRef = (src, ref) => toSrc(q('SELECT * FROM pool_src WHERE src=? AND ref=?').get(src, ref));
  const setSrcPool = (src, ref, poolId) => {
    q('UPDATE pool_src SET pool_id=? WHERE src=? AND ref=?').run(poolId, src, ref);
  };
  const moveSrc = (fromId, toId) =>
    Number(q('UPDATE pool_src SET pool_id=? WHERE pool_id=?').run(toId, fromId).changes);
  const poolCounts = () => ({
    pools: q('SELECT COUNT(*) c FROM pool').get().c,
    eans: q('SELECT COUNT(*) c FROM pool_ean').get().c,
    srcs: q('SELECT COUNT(*) c FROM pool_src').get().c,
  });
  return {
    getPool,
    putPool,
    delPool,
    listPools,
    poolKeys,
    poolByEan,
    eansOf,
    addEan,
    delEan,
    setEanPool,
    moveEans,
    putSrc,
    srcOf,
    srcByRef,
    setSrcPool,
    moveSrc,
    poolCounts,
  };
}

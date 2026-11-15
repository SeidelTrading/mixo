// Mağaza değişince taslak ve gönderi bayraklarını yeniler.
export function makeFlags(c) {
  const { P, effP, isPending, settings, eur, db, logChange, BY, snap, save } = c;
  /* ───────── siteyle senkron: canlı bayraklar ───────── */
  // block: yayın/gönderim engeli (ürün sitede yok); info: içerik güncel değil (fiyat/başlık/görsel değişti)
  function flagsOf(po) {
    const p = P.get(po.pid),
      f = [];
    if (!p) return [{ k: 'gone', block: true, t: 'Ürün katalogda yok' }];
    const e = effP(p);
    if (isPending(p.id))
      f.push({ k: 'pending', block: true, t: 'Ürün onay kuyruğuna döndü (sitede görünmüyor)' });
    else if (settings.hidden[p.id]) f.push({ k: 'hidden', block: true, t: 'Ürün mağazadan gizlendi' });
    if (settings.categories[p.cat]?.hidden)
      f.push({ k: 'cat', block: true, t: 'Ürünün kategorisi mağazada gizli' });
    if (e.na) f.push({ k: 'na', block: true, t: 'Ürün stokta yok' });
    if (e.price !== po.snap.price)
      f.push({ k: 'price', t: `Fiyat değişti: ${eur(po.snap.price)} → ${eur(e.price)}` });
    if (e.title !== po.snap.title) f.push({ k: 'title', t: 'Ürün başlığı değişti' });
    if ((e.img || '') !== po.snap.img) f.push({ k: 'img', t: 'Ürün görseli değişti' });
    return f;
  }
  function refreshFlags() {
    // değişiklik günlüğüne yalnız bayrak durumu değişince yazar
    let dirty = false;
    for (const po of db.posts) {
      if (po.status !== 'draft' && po.status !== 'published') continue;
      const sig = flagsOf(po)
        .map(x => x.k)
        .join(',');
      if (sig === po.flagSig) continue;
      po.flagSig = sig;
      dirty = true;
      if (sig)
        logChange(
          BY,
          `Instagram ${po.status === 'published' ? 'yayınlanmış gönderi' : 'taslak'} işaretlendi — “${snap(po).slice(0, 40)}”: ${flagsOf(
            po,
          )
            .map(x => x.t)
            .join('; ')}`,
          null,
        );
    }
    if (dirty) save();
  }
  return { flagsOf, refreshFlags };
}

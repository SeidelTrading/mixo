import { DARK, lintText } from './shared.mjs';

// Instagram modülüne köprü: önizleme, kuyruğa alma, otomatik taslak.
export function makeIgBridge(c) {
  const { ig } = c;
  /* ───────── 2. Instagram içerik hattı (instagram.mjs arayüzü) ───────── */
  async function igPreview(ids) {
    const out = [];
    for (const id of (Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string').slice(0, 8)) {
      const r = await ig.previewDraft(id);
      out.push(r.err ? r : { ...r, warnings: lintText(r.caption) });
    }
    return out;
  }
  async function igQueue(items, kind, by) {
    const made = [],
      errors = [];
    for (const it of (Array.isArray(items) ? items : []).slice(0, 8)) {
      const id = String(it?.id || ''),
        cap = typeof it?.caption === 'string' ? it.caption.trim().slice(0, 2000) : '';
      const tags = Array.isArray(it?.hashtags)
        ? it.hashtags
            .map(String)
            .filter(t => /^#[\p{L}\p{N}_]{2,30}$/u.test(t))
            .slice(0, 10)
        : [];
      if (!cap) {
        errors.push(`${id}: metin boş`);
        continue;
      }
      if (DARK.test(cap)) {
        errors.push(
          `${id}: metin reddedildi: sahte aciliyet/stok baskısı kalıbı (Almanya’da ihtar riski). Metni düzeltin.`,
        );
        continue;
      }
      const r = await ig.createDraft(id, kind === 'story' ? 'story' : 'post', by, {
        caption: cap,
        hashtags: tags,
        ai: !!it.ai,
      });
      r.post
        ? made.push({ id: r.post.id, title: r.post.snap.title, warnings: lintText(cap) })
        : errors.push(`${id}: ${r.err}`);
    }
    return { made, errors };
  }
  async function igDraftsAuto(ids, kind, by) {
    // asistan için: metni modül üretir; yine yalnız taslak, yayın yok
    const made = [],
      errors = [];
    for (const id of (Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string').slice(0, 8)) {
      const r = await ig.createDraft(id, kind === 'story' ? 'story' : 'post', by);
      r.post
        ? made.push({ id: r.post.id, title: r.post.snap.title, caption: r.post.caption, ai: r.post.ai })
        : errors.push(`${id}: ${r.err}`);
    }
    return { made, errors };
  }
  return { igPreview, igQueue, igDraftsAuto };
}

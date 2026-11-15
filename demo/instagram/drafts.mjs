// Taslaklar: başlık üretimi (Claude), önizleme, oluşturma.
export function makeDrafts(c) {
  const {
    effP,
    eur,
    getClient,
    model,
    P,
    shopOk,
    imageUrl,
    linkOf,
    hashtags,
    db,
    uid,
    snapOf,
    save,
    logChange,
  } = c;
  const CAPTION_SYSTEM = `Du schreibst Instagram-Beschriftungen für einen deutschen Online-Outlet-Shop. Schreibe auf Deutsch, höchstens 450 Zeichen, freundlich und sachlich, mit 1–2 passenden Emojis.
Regeln: Nutze NUR die gelieferten Produktdaten (Titel, Marke, Preis). Erfinde keine Eigenschaften, keine Rabatte, keine Streichpreise, keine Knappheit ("nur noch X", "letzte Chance") und keine Dringlichkeit. Nenne den Preis exakt wie geliefert. Schließe mit "Link in der Bio 🔗". Gib nur den Beschriftungstext aus, ohne Hashtags und ohne Anführungszeichen.`;
  async function makeCaption(p) {
    const e = effP(p),
      tpl = `${e.title}\n\n${p.vendor} · ${p.sub}\nAktueller Shop-Preis: ${eur(e.price)}\n\nLink in der Bio 🔗`;
    if (!process.env.ANTHROPIC_API_KEY) return { text: tpl, ai: false };
    try {
      const r = await getClient().messages.create({
        model,
        max_tokens: 400,
        system: CAPTION_SYSTEM,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              title: e.title,
              marke: p.vendor,
              kategorie: p.sub,
              preis_eur: e.price,
            }),
          },
        ],
      });
      const t = r.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return t ? { text: t.slice(0, 900), ai: true } : { text: tpl, ai: false };
    } catch {
      return { text: tpl, ai: false };
    }
  }
  // Pazarlama sekmesi: kuyruğa vermeden önce metin önizlemesi (taslak OLUŞTURMAZ, Instagram'a hiçbir şey gitmez)
  async function previewDraft(pid) {
    const p = P.get(pid);
    if (!p) return { id: pid, err: 'Ürün bulunamadı.' };
    if (!shopOk(p))
      return { id: pid, err: 'Ürün sitede görünmüyor (gizli, onay bekliyor ya da stokta yok).' };
    if (!imageUrl(p)) return { id: pid, err: 'Ürünün görseli yok.' };
    const e = effP(p),
      cap = await makeCaption(p);
    return {
      id: pid,
      title: e.title,
      vendor: p.vendor,
      price: e.price,
      image: imageUrl(p),
      link: linkOf(p),
      caption: cap.text,
      ai: cap.ai,
      hashtags: hashtags(p),
    };
  }
  async function createDraft(pid, kind, by, override) {
    const p = P.get(pid);
    if (!p) return { err: 'Ürün bulunamadı.' };
    if (!shopOk(p))
      return {
        err: 'Ürün sitede görünmüyor (gizli, onay bekliyor ya da stokta yok); Instagram’a hazırlanamaz.',
      };
    if (!imageUrl(p)) return { err: 'Ürünün görseli yok.' };
    if (db.posts.some(x => x.pid === pid && x.kind === kind && x.status === 'draft'))
      return { err: 'Bu ürün için zaten onay bekleyen bir taslak var.' };
    const cap = override?.caption ? { text: override.caption, ai: !!override.ai } : await makeCaption(p);
    const post = {
      id: uid(),
      pid,
      kind,
      caption: cap.text,
      hashtags: override?.hashtags?.length ? override.hashtags : hashtags(p),
      image: imageUrl(p),
      link: linkOf(p, kind === 'story' ? 'story' : 'post'),
      ai: cap.ai,
      status: 'draft',
      snap: snapOf(p),
      created: Date.now(),
      flagSig: '',
    };
    db.posts.push(post);
    if (db.posts.length > 500) db.posts.splice(0, db.posts.length - 500);
    save();
    logChange(
      by,
      `Instagram ${kind === 'story' ? 'hikâye' : 'gönderi'} taslağı hazırlandı: “${snap(post).slice(0, 50)}”`,
      null,
    );
    return { post };
  }
  const snap = po => po.snap?.title || po.pid;
  return { CAPTION_SYSTEM, makeCaption, previewDraft, createDraft, snap };
}

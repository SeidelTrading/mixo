import crypto from 'node:crypto';

// Gelen kutusu ve Meta webhook'u (imza zorunlu).
export function makeInbox(c) {
  const { db, uid, makeReply, save, logChange, BY, P, effP, VERIFY, APP_SECRET, limited, USER } = c;
  const inFlight = new Set(),
    busy = new Set();
  // işlenmekte olan webhook kimlikleri · süren yayın/yanıt gönderimleri
  // Kalıcı tekrar listesi: gelen kutusu 500 kayda kırpılsa ve süreç yeniden başlasa da aynı webhook kimliği 14 gün işlenmez.
  const SEEN_MS = 14 * 864e5,
    SEEN_MAX = 5000,
    STALE_MS = 7 * 864e5;
  db.seenExt ||= {};
  function markSeen(ext) {
    const now = Date.now(),
      keys = Object.keys(db.seenExt);
    for (const k of keys) if (now - db.seenExt[k] > SEEN_MS) delete db.seenExt[k];
    while (Object.keys(db.seenExt).length >= SEEN_MAX) delete db.seenExt[Object.keys(db.seenExt)[0]];
    db.seenExt[ext] = now;
  }
  async function addInbox(it) {
    // 7 günden eski zaman damgalı yük (ör. yeniden gönderilmiş eski imzalı istek) yok sayılır.
    if (Number.isFinite(it.t) && Date.now() - it.t > STALE_MS) return null;
    if (it.ext && (inFlight.has(it.ext) || db.seenExt[it.ext] || db.inbox.some(x => x.ext === it.ext)))
      return null; // webhook tekrarını yoksay (işlenmekte olan dahil)
    if (it.ext) {
      inFlight.add(it.ext);
      markSeen(it.ext);
      save();
    }
    try {
      const item = {
        id: uid(),
        t: it.t || Date.now(),
        type: it.type,
        from: String(it.from || '').slice(0, 80),
        fromName: String(it.fromName || '').slice(0, 60),
        text: String(it.text || '').slice(0, 2000),
        mediaId: it.mediaId || null,
        commentId: it.commentId || null,
        ext: it.ext || null,
        status: 'new',
        draft: '',
        ai: false,
        productId: null,
        sim: !!it.sim,
      };
      const r = await makeReply(item);
      item.draft = r.text;
      item.ai = r.ai;
      item.status = 'drafted';
      db.inbox.push(item);
      if (db.inbox.length > 500) db.inbox.splice(0, db.inbox.length - 500);
      save();
      logChange(
        BY,
        `Instagram ${item.type === 'dm' ? 'DM' : 'yorum'} geldi${item.sim ? ' (simülasyon)' : ''}, yanıt taslağı hazır${item.productId && P.get(item.productId) ? ' — ürün: ' + effP(P.get(item.productId)).title.slice(0, 40) : ''}`,
        null,
      );
      return item;
    } finally {
      if (it.ext) inFlight.delete(it.ext);
    }
  }
  /* ───────── webhook (Meta → bize). İmza zorunlu: IG_APP_SECRET yoksa kapalı ───────── */
  function rawBody(req, max = 300e3) {
    return new Promise((ok, no) => {
      let n = 0;
      const ch = [];
      req.on('data', c => {
        n += c.length;
        if (n > max) {
          ch.length = 0;
          no(new Error('too large'));
        } else ch.push(c);
      });
      req.on('end', () => ok(Buffer.concat(ch)));
      req.on('error', no);
    });
  }
  async function webhook(req, res, url, ip) {
    const out = (code, txt) => {
      res.writeHead(code, { 'content-type': 'text/plain' });
      res.end(txt);
    };
    if (req.method === 'GET') {
      // Meta abonelik doğrulaması
      if (!VERIFY) return out(503, 'webhook kapalı');
      const q = url.searchParams,
        a = Buffer.from(q.get('hub.verify_token') || ''),
        b = Buffer.from(VERIFY);
      if (q.get('hub.mode') === 'subscribe' && a.length === b.length && crypto.timingSafeEqual(a, b))
        return out(200, q.get('hub.challenge') || '');
      return out(403, 'forbidden');
    }
    if (req.method !== 'POST') return out(405, '');
    if (!APP_SECRET) return out(503, 'webhook kapalı (IG_APP_SECRET yok)');
    if (limited('igwh' + ip, 300, 60e3)) return out(429, 'çok fazla istek');
    let raw;
    try {
      raw = await rawBody(req);
    } catch {
      res.on('finish', () => req.destroy());
      res.setHeader('connection', 'close');
      return out(413, 'gövde çok büyük');
    }
    const sig = String(req.headers['x-hub-signature-256'] || ''),
      want = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)))
      return out(401, 'imza geçersiz');
    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return out(400, 'json');
    }
    for (const en of body.entry || []) {
      for (const m of en.messaging || [])
        if (m.message?.text && !m.message.is_echo && String(m.sender?.id) !== String(USER))
          await addInbox({
            type: 'dm',
            from: m.sender?.id,
            text: m.message.text,
            ext: 'dm:' + (m.message.mid || m.timestamp),
            t: m.timestamp,
          });
      for (const c of en.changes || [])
        if (c.field === 'comments' && c.value?.text && String(c.value.from?.id) !== String(USER))
          await addInbox({
            type: 'comment',
            from: c.value.from?.id,
            fromName: c.value.from?.username,
            text: c.value.text,
            mediaId: c.value.media?.id,
            commentId: c.value.id,
            ext: 'c:' + c.value.id,
          });
    }
    return out(200, 'ok');
  }
  return { inFlight, busy, addInbox, rawBody, webhook };
}

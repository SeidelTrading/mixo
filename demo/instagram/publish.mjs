// Graph API çağrıları ve canlı yayın (token yoksa kullanılmaz).
export function makePublish(c) {
  const { BASE, TOKEN, USER } = c;
  /* ───────── Graph API (yalnız token varsa, yalnız admin onayıyla çağrılır) ───────── */
  async function graph(method, p, params) {
    const url = BASE + p + (method === 'GET' && params ? '?' + new URLSearchParams(params) : '');
    const r = await fetch(url, {
      method,
      headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(params || {}) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || 'Instagram API hatası (' + r.status + ')');
    return j;
  }
  async function livePublish(po) {
    const c = await graph(
      'POST',
      `/${USER}/media`,
      po.kind === 'story'
        ? { image_url: po.image, media_type: 'STORIES' }
        : { image_url: po.image, caption: fullCaption(po) },
    );
    for (let i = 0; i < 10; i++) {
      const s = await graph('GET', `/${c.id}`, { fields: 'status_code' });
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('Medya işlenemedi');
      await new Promise(r => setTimeout(r, 2000));
    }
    return (await graph('POST', `/${USER}/media_publish`, { creation_id: c.id })).id;
  }
  const fullCaption = po => `${po.caption}\n\n${po.hashtags.join(' ')}`;
  return { graph, livePublish, fullCaption };
}

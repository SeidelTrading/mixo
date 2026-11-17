/** robots.txt ayrıştırma ve eşleştirme (RFC 9309: en uzun eşleşen kural kazanır, eşitlikte Allow). */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r\n|\r|\n/)) {
    // Yalnız CR satır sonu (eski Mac biçimi) da satır sayılır; yoksa kurallar tek satıra yapışır.
    const line = raw.replace(/#.*/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [], crawlDelay: null };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(val);
    else if (cur && (key === 'allow' || key === 'disallow'))
      cur.rules.push({ allow: key === 'allow', path: val });
    else if (cur && key === 'crawl-delay') cur.crawlDelay = Number(val) || null;
  }
  return { groups, sitemaps };
}

function patternToRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** Ürün belirteci (örn. "KarsilastirBot") için geçerli kural grubunu seçer; yoksa '*'. */
function rulesFor(robots, token) {
  const t = token.toLowerCase();
  const specific = robots.groups.filter(g => g.agents.some(a => a !== '*' && t.startsWith(a)));
  const groups = specific.length ? specific : robots.groups.filter(g => g.agents.includes('*'));
  return groups.flatMap(g => g.rules);
}

/** path: yol + sorgu (örn. "/p/1?x=2"). Kural yoksa serbest. */
export function isAllowed(robots, token, path) {
  let best = null;
  for (const r of rulesFor(robots, token)) {
    if (r.path === '') continue; // boş Disallow = serbest
    if (!patternToRegex(r.path).test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))
      best = r;
  }
  return best ? best.allow : true;
}

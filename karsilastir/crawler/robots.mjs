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

/** Derlenmiş kural kalıpları: büyük site haritasında aynı kurallar yüz binlerce kez sorulur, her seferinde derlenmesin. */
const REGEX_CACHE = new Map();

function patternToRegex(p) {
  let re = REGEX_CACHE.get(p);
  if (re) return re;
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  re = new RegExp('^' + body + (anchored ? '$' : ''));
  if (REGEX_CACHE.size >= 2000) REGEX_CACHE.clear(); // sınırsız büyümesin
  REGEX_CACHE.set(p, re);
  return re;
}

/** Ürün belirteci (örn. "KarsilastirBot") için geçerli kural gruplarını seçer; yoksa '*'. */
function groupsFor(robots, token) {
  const t = token.toLowerCase();
  const specific = robots.groups.filter(g => g.agents.some(a => a !== '*' && t.startsWith(a)));
  return specific.length ? specific : robots.groups.filter(g => g.agents.includes('*'));
}
const rulesFor = (robots, token) => groupsFor(robots, token).flatMap(g => g.rules);

/** Geçerli gruptaki Crawl-delay (saniye) milisaniye olarak; yoksa 0. Birden çok grup varsa en büyüğü. */
export function crawlDelayMs(robots, token) {
  const d = groupsFor(robots, token).map(g => g.crawlDelay || 0);
  return Math.round(Math.max(0, ...d) * 1000);
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

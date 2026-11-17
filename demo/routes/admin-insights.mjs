import { send } from '../lib/http.mjs';
import {
  InsightsError,
  arbitrage,
  categoryTrends,
  cohort,
  compare,
  funnel,
  importMarketData,
  summary,
} from '../services/insights.mjs';

// Pazar ve davranış içgörü uçları. Veri yalnız dışarıdan beslenir (resmi API / affiliate / lisanslı); burada scraping yoktur.
// Yetki ve yöntem kapıları handler.mjs'tedir; yazma uçları ayrıca POST ister.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
const STATUS = { invalid: 400, notfound: 404 };
const POSTS = new Set(['import', 'compare', 'arbitrage']);
const GETS = new Set(['trends', 'funnel', 'cohort']);

export async function adminInsightsRoutes(c) {
  const { req, res, p, url, body } = c;
  const m = /^\/api\/admin\/insights(?:\/([^/]+))?$/.exec(p);
  if (!m) return;
  const sub = m[1];
  try {
    if (POSTS.has(sub)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST bekleniyor' }, { allow: 'POST' });
      if (sub === 'import') return send(res, 200, importMarketData(body));
      if (sub === 'compare') return send(res, 200, { ok: true, items: compare(body) });
      return send(res, 200, { ok: true, items: arbitrage(body) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'GET bekleniyor' }, { allow: 'GET, HEAD' });
    if (!sub) return send(res, 200, summary());
    if (!GETS.has(sub)) return send(res, 404, { error: 'Bulunamadı' });
    const days = url.searchParams.get('days') ?? undefined;
    if (sub === 'trends') return send(res, 200, { items: categoryTrends({ days }) });
    if (sub === 'funnel') return send(res, 200, funnel({ days }));
    return send(res, 200, cohort({ days }));
  } catch (e) {
    if (e instanceof InsightsError) return send(res, STATUS[e.code] || 400, { error: e.message });
    throw e;
  }
}
